import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { UserAccount } from '@/types/fantasy';

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day session TTL
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_KEYLEN = 64;
export const PBKDF2_DIGEST = 'sha512';

export interface SessionMeta {
  createdAt: string;
  expiresAt: string;
}

export interface StoredUser {
  id: string;
  username: string; // display username as entered
  normalizedUsername: string; // lowercase for collision checks
  salt: string;
  hash: string;
  tokens: string[]; // active session tokens
  sessions?: Record<string, SessionMeta>; // token -> session metadata with TTL
  claimedTeams: Record<string, string>; // leagueId -> teamId
  isSuperUser?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Global in-memory cache across Next.js hot reloads and warm serverless invocations
declare global {
  // eslint-disable-next-line no-var
  var __tradeHornyUserStore: Map<string, StoredUser> | undefined;
  // eslint-disable-next-line no-var
  var __tradeHornyUserWritableDir: string | null | undefined;
  // eslint-disable-next-line no-var
  var __tradeHornyUsersLoaded: boolean | undefined;
}

const userMemoryStore: Map<string, StoredUser> =
  globalThis.__tradeHornyUserStore || new Map<string, StoredUser>();
globalThis.__tradeHornyUserStore = userMemoryStore;

export class AsyncLock {
  private queues = new Map<string, Promise<void>>();

  async acquire<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.queues.get(key) || Promise.resolve();
    let resolveLock!: () => void;
    const current = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.queues.set(key, current);

    try {
      await prev.catch(() => {});
      return await fn();
    } finally {
      resolveLock();
      if (this.queues.get(key) === current) {
        this.queues.delete(key);
      }
    }
  }
}

export const userLock = new AsyncLock();

/**
 * Resets directory memoization and loaded flags (used for isolated test suites).
 */
export function resetUserStoreMemoization(): void {
  globalThis.__tradeHornyUserWritableDir = undefined;
  globalThis.__tradeHornyUsersLoaded = undefined;
}

/**
 * Atomic file writer: writes to a temporary file in the same directory,
 * flushes, and atomically renames to the destination file.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tempPath, content, 'utf-8');

  try {
    fs.renameSync(tempPath, filePath);
    return;
  } catch {
    // Windows fallback: retry unlink + rename loop to handle transient file locks
    let lastErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        fs.renameSync(tempPath, filePath);
        return;
      } catch (err) {
        lastErr = err;
      }
    }

    try {
      fs.copyFileSync(tempPath, filePath);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
      return;
    } catch {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {}
      throw lastErr;
    }
  }
}

/**
 * Resolves a writable directory for user account persistence.
 * Uses `.data/users` locally, respects `process.env.DATA_DIR`,
 * and falls back to `os.tmpdir()` on read-only serverless filesystems.
 */
function getWritableUserDir(): string | null {
  if (process.env.DATA_DIR) {
    const testDir = path.join(process.env.DATA_DIR, 'users');
    if (!fs.existsSync(testDir)) {
      try {
        fs.mkdirSync(testDir, { recursive: true });
      } catch {}
    }
    return testDir;
  }

  if (globalThis.__tradeHornyUserWritableDir !== undefined) {
    return globalThis.__tradeHornyUserWritableDir;
  }

  const candidates = [
    path.join(process.cwd(), '.data', 'users'),
    path.join(os.tmpdir(), 'pasta-loft', 'users'),
    path.join(os.tmpdir(), 'trade-horny', 'users'),
  ];

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const probeFile = path.join(dir, `.write_probe_${process.pid}`);
      fs.writeFileSync(probeFile, 'ok', 'utf-8');
      fs.unlinkSync(probeFile);
      globalThis.__tradeHornyUserWritableDir = dir;
      return dir;
    } catch {
      // Try next candidate
    }
  }

  globalThis.__tradeHornyUserWritableDir = null;
  return null;
}

/**
 * Validates and sanitizes a userId to prevent directory traversal and injection.
 */
export function sanitizeUserId(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    throw new Error('Invalid user ID');
  }
  return trimmed;
}

/**
 * Validates and sanitizes a username.
 */
export function sanitizeUsername(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
    throw new Error('Username must be between 2 and 30 characters.');
  }
  if (!/^[a-zA-Z0-9_\-\. ]{2,30}$/.test(trimmed)) {
    throw new Error('Username may only contain letters, numbers, spaces, dots, hyphens, and underscores.');
  }
  if (trimmed.startsWith('.') || trimmed.endsWith('.') || trimmed.includes('..')) {
    throw new Error('Username cannot start/end with a dot or contain consecutive dots.');
  }
  return trimmed;
}

/**
 * Constant-time comparison for strings to eliminate timing attacks.
 * Uses SHA-256 digest hashing before comparison so any string format
 * (hex, utf-8, arbitrary length) can be compared in strict constant time.
 */
export function safeTimingEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  try {
    const hashA = crypto.createHash('sha256').update(a, 'utf-8').digest();
    const hashB = crypto.createHash('sha256').update(b, 'utf-8').digest();
    return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
  } catch {
    return false;
  }
}

/**
 * Hashes a password using PBKDF2 with SHA-512 and 100,000 iterations.
 */
export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hashHex = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
  const hash = `pbkdf2:${PBKDF2_ITERATIONS}:${PBKDF2_DIGEST}:${hashHex}`;
  return { salt, hash };
}

/**
 * Verifies password against expected hash with backward compatibility for:
 * 1. Modern PBKDF2 100k iters (`pbkdf2:100000:sha512:<hex>`)
 * 2. Unprefixed 100k iters PBKDF2
 * 3. Legacy 1k iters PBKDF2 (`crypto.pbkdf2Sync(..., 1000, 64, 'sha512')`)
 * 4. Legacy SHA-256 (both salted and unsalted)
 * Returns whether password is valid and whether the stored hash needs rehashing.
 */
export function verifyPasswordWithUpgrade(
  password: string,
  salt: string,
  expectedHash: string
): { valid: boolean; needsRehash: boolean } {
  try {
    if (!expectedHash) return { valid: false, needsRehash: false };

    // 1. Prefixed PBKDF2 format: pbkdf2:<iterations>:<digest>:<hashHex>
    if (expectedHash.startsWith('pbkdf2:')) {
      const parts = expectedHash.split(':');
      const iters = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
      const digest = parts[2] || PBKDF2_DIGEST;
      const targetHex = parts[3] || '';
      const computedHex = crypto
        .pbkdf2Sync(password, salt, iters, PBKDF2_KEYLEN, digest)
        .toString('hex');
      const valid = safeTimingEqual(computedHex, targetHex);
      return { valid, needsRehash: iters < PBKDF2_ITERATIONS };
    }

    // 2. Unprefixed modern 100k iters
    const modernHex = crypto
      .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
      .toString('hex');
    if (safeTimingEqual(modernHex, expectedHash)) {
      return { valid: true, needsRehash: true };
    }

    // 3. Legacy 1,000 iterations PBKDF2
    const legacy1kHex = crypto
      .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
      .toString('hex');
    if (safeTimingEqual(legacy1kHex, expectedHash)) {
      return { valid: true, needsRehash: true };
    }

    // 4. Legacy raw SHA-256
    const rawSha256 = crypto.createHash('sha256').update(password).digest('hex');
    if (safeTimingEqual(rawSha256, expectedHash)) {
      return { valid: true, needsRehash: true };
    }
    const saltedSha256 = crypto.createHash('sha256').update(salt + password).digest('hex');
    if (safeTimingEqual(saltedSha256, expectedHash)) {
      return { valid: true, needsRehash: true };
    }

    return { valid: false, needsRehash: false };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

/**
 * Verifies a password against expected hash in constant time.
 */
export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  return verifyPasswordWithUpgrade(password, salt, expectedHash).valid;
}

/**
 * Checks whether a given token has passed its expiration TTL.
 */
export function isTokenExpired(user: StoredUser, token: string): boolean {
  if (user.sessions && user.sessions[token]) {
    const expiry = new Date(user.sessions[token].expiresAt).getTime();
    if (!isNaN(expiry)) {
      return Date.now() > expiry;
    }
  }
  const match = token.match(/^tok_(\d+)_/);
  if (match) {
    const created = parseInt(match[1], 10);
    if (!isNaN(created)) {
      return Date.now() - created > TOKEN_TTL_MS;
    }
  }
  // For un-timestamped legacy tokens without session records:
  // Fallback to checking the user's updatedAt or createdAt timestamp
  const refTime = new Date(user.updatedAt || user.createdAt).getTime();
  if (!isNaN(refTime)) {
    return Date.now() - refTime > TOKEN_TTL_MS;
  }
  return false;
}

/**
 * Ensures the root superuser account ('superu' / 'thanos') always exists
 * and has superuser privileges without force-reverting passwords on every restart.
 */
export function ensureSuperUserAccount(): StoredUser {
  const superUsername = 'superu';
  const superPassword = process.env.INITIAL_SUPERUSER_PASSWORD || 'thanos';
  const normalized = superUsername.toLowerCase();

  for (const user of userMemoryStore.values()) {
    if (user.normalizedUsername === normalized || user.id === 'usr_superu_root') {
      let changed = false;
      if (!user.isSuperUser) {
        user.isSuperUser = true;
        changed = true;
      }
      if (!user.hash || !user.salt) {
        const { salt, hash } = hashPassword(superPassword);
        user.salt = salt;
        user.hash = hash;
        changed = true;
      } else if (!user.hash.startsWith('pbkdf2:100000:')) {
        const { valid, needsRehash } = verifyPasswordWithUpgrade(superPassword, user.salt, user.hash);
        if (valid && needsRehash) {
          const { salt, hash } = hashPassword(superPassword);
          user.salt = salt;
          user.hash = hash;
          changed = true;
        }
      }
      if (changed) {
        user.updatedAt = new Date().toISOString();
        userMemoryStore.set(user.id, user);
        writeUserToDisk(user);
      }
      return user;
    }
  }

  // Create superu account
  const { salt, hash } = hashPassword(superPassword);
  const userId = `usr_superu_root`;
  const now = new Date().toISOString();
  const superUser: StoredUser = {
    id: userId,
    username: superUsername,
    normalizedUsername: normalized,
    salt,
    hash,
    tokens: [],
    sessions: {},
    claimedTeams: {},
    isSuperUser: true,
    createdAt: now,
    updatedAt: now,
  };

  userMemoryStore.set(superUser.id, superUser);
  writeUserToDisk(superUser);
  return superUser;
}

function ensureUsersLoaded(): void {
  if (globalThis.__tradeHornyUsersLoaded) return;
  globalThis.__tradeHornyUsersLoaded = true;

  const dir = getWritableUserDir();
  if (dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('.') && !file.includes('.tmp.')) {
          try {
            const filePath = path.join(dir, file);
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw) as StoredUser;
            if (parsed && parsed.id && parsed.username && parsed.hash) {
              if (!Array.isArray(parsed.tokens)) parsed.tokens = [];
              if (!parsed.sessions || typeof parsed.sessions !== 'object') {
                parsed.sessions = {};
              }
              if (!parsed.claimedTeams || typeof parsed.claimedTeams !== 'object') {
                parsed.claimedTeams = {};
              }
              if (!parsed.normalizedUsername) {
                parsed.normalizedUsername = parsed.username.toLowerCase();
              }
              // Prune any expired tokens on load
              const originalCount = parsed.tokens.length;
              parsed.tokens = parsed.tokens.filter((t) => !isTokenExpired(parsed, t));
              if (parsed.sessions) {
                for (const tok of Object.keys(parsed.sessions)) {
                  if (!parsed.tokens.includes(tok)) {
                    delete parsed.sessions[tok];
                  }
                }
              }
              userMemoryStore.set(parsed.id, parsed);
              if (parsed.tokens.length !== originalCount) {
                writeUserToDisk(parsed);
              }
            }
          } catch {
            // Skip corrupt file
          }
        }
      }
    } catch (err) {
      console.error('Failed to load users from disk:', err);
    }
  }

  // Ensure root super user exists on system initialization
  ensureSuperUserAccount();
}

function writeUserToDisk(user: StoredUser): void {
  const dir = getWritableUserDir();
  if (!dir) return;

  try {
    const cleanId = sanitizeUserId(user.id);
    const filePath = path.join(dir, `${cleanId}.json`);
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(dir);
    if (!resolvedPath.startsWith(resolvedDir)) {
      throw new Error('Path traversal detected');
    }
    atomicWriteFileSync(filePath, JSON.stringify(user, null, 2));
  } catch (err) {
    console.error(`Failed to write user ${user.id} to disk:`, err);
  }
}

export function toPublicUser(stored: StoredUser): UserAccount {
  return {
    id: stored.id,
    username: stored.username,
    claimedTeams: stored.claimedTeams || {},
    isSuperUser: Boolean(stored.isSuperUser),
    createdAt: stored.createdAt,
  };
}

/**
 * Registers a new user account with a unique username and hashed password.
 */
export function createUser(
  rawUsername: string,
  rawPassword: string
): { user: UserAccount; token: string } {
  ensureUsersLoaded();

  const username = sanitizeUsername(rawUsername);
  const normalizedUsername = username.toLowerCase();

  if (normalizedUsername === 'superu') {
    throw new Error('Username "superu" is reserved.');
  }

  const password = String(rawPassword ?? '');
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters.');
  }

  // Check uniqueness case-insensitively
  for (const existing of userMemoryStore.values()) {
    if (existing.normalizedUsername === normalizedUsername) {
      throw new Error(`Username "${username}" is already taken. Please choose another.`);
    }
  }

  const { salt, hash } = hashPassword(password);
  const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const token = `tok_${now.getTime()}_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
  const nowIso = now.toISOString();

  const newUser: StoredUser = {
    id: userId,
    username,
    normalizedUsername,
    salt,
    hash,
    tokens: [token],
    sessions: {
      [token]: {
        createdAt: nowIso,
        expiresAt,
      },
    },
    claimedTeams: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  userMemoryStore.set(userId, newUser);
  writeUserToDisk(newUser);

  return {
    user: toPublicUser(newUser),
    token,
  };
}

/**
 * Authenticates a user with username and password, returning an active session token.
 * Dynamically upgrades legacy hashes to modern PBKDF2 upon successful verification.
 */
export function loginUser(
  rawUsername: string,
  rawPassword: string
): { user: UserAccount; token: string } {
  ensureUsersLoaded();

  const trimmedUsername = String(rawUsername ?? '').trim();
  const normalizedUsername = trimmedUsername.toLowerCase();
  const password = String(rawPassword ?? '');

  if (!trimmedUsername || !password) {
    throw new Error('Please enter both username and password.');
  }

  let foundUser: StoredUser | null = null;
  for (const user of userMemoryStore.values()) {
    if (user.normalizedUsername === normalizedUsername) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    throw new Error('Invalid username or password.');
  }

  const { valid, needsRehash } = verifyPasswordWithUpgrade(password, foundUser.salt, foundUser.hash);
  if (!valid) {
    throw new Error('Invalid username or password.');
  }

  if (needsRehash) {
    const { salt, hash } = hashPassword(password);
    foundUser.salt = salt;
    foundUser.hash = hash;
  }

  // Issue new session token with TTL
  const now = new Date();
  const token = `tok_${now.getTime()}_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();

  if (!Array.isArray(foundUser.tokens)) {
    foundUser.tokens = [];
  }
  if (!foundUser.sessions) {
    foundUser.sessions = {};
  }

  foundUser.sessions[token] = {
    createdAt: now.toISOString(),
    expiresAt,
  };

  // Prune any expired tokens and keep up to 10 active tokens across devices
  const activeUnexpired = foundUser.tokens.filter((t) => !isTokenExpired(foundUser!, t));
  foundUser.tokens = [token, ...activeUnexpired.slice(0, 9)];
  foundUser.updatedAt = now.toISOString();

  userMemoryStore.set(foundUser.id, foundUser);
  writeUserToDisk(foundUser);

  return {
    user: toPublicUser(foundUser),
    token,
  };
}

/**
 * Resolves a user account by session token, verifying and revoking expired tokens.
 */
export function getUserByToken(token: string): UserAccount | null {
  ensureUsersLoaded();

  const cleanToken = String(token ?? '').trim();
  if (!cleanToken) return null;

  for (const user of userMemoryStore.values()) {
    if (Array.isArray(user.tokens) && user.tokens.includes(cleanToken)) {
      if (isTokenExpired(user, cleanToken)) {
        // Revoke expired token
        user.tokens = user.tokens.filter((t) => t !== cleanToken);
        if (user.sessions) {
          delete user.sessions[cleanToken];
        }
        user.updatedAt = new Date().toISOString();
        userMemoryStore.set(user.id, user);
        writeUserToDisk(user);
        return null;
      }
      return toPublicUser(user);
    }
  }

  return null;
}

/**
 * Resolves a user account by user ID.
 */
export function getUserById(userId: string): UserAccount | null {
  ensureUsersLoaded();

  let cleanId: string;
  try {
    cleanId = sanitizeUserId(userId);
  } catch {
    return null;
  }

  const found = userMemoryStore.get(cleanId);
  return found ? toPublicUser(found) : null;
}

/**
 * Links a team in a specific ESPN league to the user's account.
 */
export function linkUserTeamClaim(
  userId: string,
  espnLeagueId: string,
  teamId: string
): UserAccount | null {
  ensureUsersLoaded();

  let cleanUserId: string;
  try {
    cleanUserId = sanitizeUserId(userId);
  } catch {
    return null;
  }

  const cleanLeagueId = String(espnLeagueId ?? '').trim();
  const cleanTeamId = String(teamId ?? '').trim();

  if (!cleanUserId || !cleanLeagueId || !cleanTeamId) return null;

  const user = userMemoryStore.get(cleanUserId);
  if (!user) return null;

  if (!user.claimedTeams) {
    user.claimedTeams = {};
  }

  user.claimedTeams[cleanLeagueId] = cleanTeamId;
  user.updatedAt = new Date().toISOString();

  userMemoryStore.set(user.id, user);
  writeUserToDisk(user);

  return toPublicUser(user);
}

/**
 * Unlinks a team claim for a specific ESPN league from the user's account.
 */
export function unlinkUserTeamClaim(
  userId: string,
  espnLeagueId: string
): UserAccount | null {
  ensureUsersLoaded();

  let cleanUserId: string;
  try {
    cleanUserId = sanitizeUserId(userId);
  } catch {
    return null;
  }

  const cleanLeagueId = String(espnLeagueId ?? '').trim();
  if (!cleanUserId || !cleanLeagueId) return null;

  const user = userMemoryStore.get(cleanUserId);
  if (!user) return null;

  if (user.claimedTeams && user.claimedTeams[cleanLeagueId]) {
    delete user.claimedTeams[cleanLeagueId];
    user.updatedAt = new Date().toISOString();
    userMemoryStore.set(user.id, user);
    writeUserToDisk(user);
  }

  return toPublicUser(user);
}

/**
 * Invalidates a session token (logout).
 */
export function logoutUser(token: string): boolean {
  ensureUsersLoaded();

  const cleanToken = String(token ?? '').trim();
  if (!cleanToken) return false;

  for (const user of userMemoryStore.values()) {
    if (Array.isArray(user.tokens) && user.tokens.includes(cleanToken)) {
      user.tokens = user.tokens.filter((t) => t !== cleanToken);
      if (user.sessions) {
        delete user.sessions[cleanToken];
      }
      user.updatedAt = new Date().toISOString();
      userMemoryStore.set(user.id, user);
      writeUserToDisk(user);
      return true;
    }
  }

  return false;
}

/**
 * Completely clears all stored user accounts, active sessions, and claimed teams
 * from memory and persistent disk for a fresh testing clean slate.
 */
export function clearAllServerUsers(): { deletedUsers: number } {
  userMemoryStore.clear();
  globalThis.__tradeHornyUsersLoaded = false;
  let count = 0;

  const candidateDirs = [
    ...(process.env.DATA_DIR ? [path.join(process.env.DATA_DIR, 'users')] : []),
    path.join(process.cwd(), '.data', 'users'),
    path.join(os.tmpdir(), 'pasta-loft', 'users'),
    path.join(os.tmpdir(), 'trade-horny', 'users'),
  ];

  for (const dir of candidateDirs) {
    if (dir && fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if ((file.endsWith('.json') || file.includes('.tmp.')) && !file.startsWith('.')) {
            if (file === 'usr_superu_root.json') {
              continue;
            }
            try {
              fs.unlinkSync(path.join(dir, file));
              count++;
            } catch (e) {
              console.error(`Failed to delete user file ${file}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Failed to read users directory for clearing:', e);
      }
    }
  }

  // Also check for any root users.json in candidates
  const rootCandidates = [
    ...(process.env.DATA_DIR ? [path.join(process.env.DATA_DIR, 'users.json')] : []),
    path.join(process.cwd(), '.data', 'users.json'),
    path.join(os.tmpdir(), 'pasta-loft', 'users.json'),
    path.join(os.tmpdir(), 'trade-horny', 'users.json'),
  ];
  for (const rootFile of rootCandidates) {
    if (fs.existsSync(rootFile)) {
      try {
        fs.unlinkSync(rootFile);
        count++;
      } catch {}
    }
  }

  // Re-seed root superuser account with clean slate
  const rootSuperu = ensureSuperUserAccount();
  rootSuperu.claimedTeams = {};
  rootSuperu.tokens = [];
  rootSuperu.sessions = {};
  rootSuperu.updatedAt = new Date().toISOString();
  userMemoryStore.set(rootSuperu.id, rootSuperu);
  writeUserToDisk(rootSuperu);

  return { deletedUsers: count };
}

/**
 * Returns all registered users on the system (for superuser management).
 */
export function getAllUsers(): UserAccount[] {
  ensureUsersLoaded();
  const list = Array.from(userMemoryStore.values()).map(toPublicUser);
  // Sort so superu is at the top, then alphabetically by username
  return list.sort((a, b) => {
    if (a.username.toLowerCase() === 'superu') return -1;
    if (b.username.toLowerCase() === 'superu') return 1;
    return a.username.localeCompare(b.username);
  });
}

/**
 * Deletes a user account by ID.
 * Throws an error if attempting to delete the root superuser account.
 */
export function deleteUser(userId: string): boolean {
  ensureUsersLoaded();
  let cleanUserId: string;
  try {
    cleanUserId = sanitizeUserId(userId);
  } catch {
    return false;
  }

  const user = userMemoryStore.get(cleanUserId);
  if (!user) return false;

  if (user.id === 'usr_superu_root' || user.normalizedUsername === 'superu' || user.username.toLowerCase() === 'superu') {
    throw new Error('Cannot delete the root super user account.');
  }

  userMemoryStore.delete(cleanUserId);

  const candidateDirs = [
    ...(process.env.DATA_DIR ? [path.join(process.env.DATA_DIR, 'users')] : []),
    path.join(process.cwd(), '.data', 'users'),
    path.join(os.tmpdir(), 'pasta-loft', 'users'),
    path.join(os.tmpdir(), 'trade-horny', 'users'),
  ];

  for (const dir of candidateDirs) {
    if (dir && fs.existsSync(dir)) {
      try {
        const filePath = path.join(dir, `${cleanUserId}.json`);
        const resolvedPath = path.resolve(filePath);
        const resolvedDir = path.resolve(dir);
        if (resolvedPath.startsWith(resolvedDir) && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error(`Failed to delete user file for ${cleanUserId}:`, e);
      }
    }
  }

  return true;
}

/**
 * Unlinks team claims for a deleted league across all users in the store.
 */
export function unlinkAllUserClaimsForLeague(espnLeagueId: string): void {
  ensureUsersLoaded();
  const cleanId = String(espnLeagueId ?? '').trim();
  if (!cleanId) return;

  for (const user of userMemoryStore.values()) {
    if (user.claimedTeams && user.claimedTeams[cleanId]) {
      delete user.claimedTeams[cleanId];
      user.updatedAt = new Date().toISOString();
      userMemoryStore.set(user.id, user);
      writeUserToDisk(user);
    }
  }
}
