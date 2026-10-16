import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { UserAccount } from '@/types/fantasy';

export interface StoredUser {
  id: string;
  username: string; // display username as entered
  normalizedUsername: string; // lowercase for collision checks
  salt: string;
  hash: string;
  tokens: string[]; // active session tokens
  claimedTeams: Record<string, string>; // leagueId -> teamId
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

/**
 * Resolves a writable directory for user account persistence.
 * Uses `.data/users` locally, and falls back to `os.tmpdir()`
 * on read-only serverless filesystems.
 */
function getWritableUserDir(): string | null {
  if (globalThis.__tradeHornyUserWritableDir !== undefined) {
    return globalThis.__tradeHornyUserWritableDir;
  }

  const candidates = [
    ...(process.env.DATA_DIR ? [path.join(process.env.DATA_DIR, 'users')] : []),
    path.join(process.cwd(), '.data', 'users'),
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

function ensureUsersLoaded(): void {
  if (globalThis.__tradeHornyUsersLoaded) return;
  globalThis.__tradeHornyUsersLoaded = true;

  const dir = getWritableUserDir();
  if (!dir) return;

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('.')) {
        try {
          const filePath = path.join(dir, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw) as StoredUser;
          if (parsed && parsed.id && parsed.username && parsed.hash) {
            if (!Array.isArray(parsed.tokens)) parsed.tokens = [];
            if (!parsed.claimedTeams || typeof parsed.claimedTeams !== 'object') {
              parsed.claimedTeams = {};
            }
            if (!parsed.normalizedUsername) {
              parsed.normalizedUsername = parsed.username.toLowerCase();
            }
            userMemoryStore.set(parsed.id, parsed);
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

function writeUserToDisk(user: StoredUser): void {
  const dir = getWritableUserDir();
  if (!dir) return;

  try {
    const filePath = path.join(dir, `${user.id}.json`);
    const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(user, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Failed to write user ${user.id} to disk:`, err);
  }
}

export function sanitizeUsername(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
    throw new Error('Username must be between 2 and 30 characters.');
  }
  if (!/^[a-zA-Z0-9_\-\. ]{2,30}$/.test(trimmed)) {
    throw new Error('Username may only contain letters, numbers, spaces, dots, hyphens, and underscores.');
  }
  return trimmed;
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

export function toPublicUser(stored: StoredUser): UserAccount {
  return {
    id: stored.id,
    username: stored.username,
    claimedTeams: stored.claimedTeams || {},
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
  const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
  const now = new Date().toISOString();

  const newUser: StoredUser = {
    id: userId,
    username,
    normalizedUsername,
    salt,
    hash,
    tokens: [token],
    claimedTeams: {},
    createdAt: now,
    updatedAt: now,
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

  if (!foundUser || !verifyPassword(password, foundUser.salt, foundUser.hash)) {
    throw new Error('Invalid username or password.');
  }

  // Issue new session token
  const token = `tok_${crypto.randomBytes(24).toString('hex')}`;
  if (!Array.isArray(foundUser.tokens)) {
    foundUser.tokens = [];
  }
  // Keep up to 10 active tokens across devices
  foundUser.tokens = [token, ...foundUser.tokens.slice(0, 9)];
  foundUser.updatedAt = new Date().toISOString();

  userMemoryStore.set(foundUser.id, foundUser);
  writeUserToDisk(foundUser);

  return {
    user: toPublicUser(foundUser),
    token,
  };
}

/**
 * Resolves a user account by session token.
 */
export function getUserByToken(token: string): UserAccount | null {
  ensureUsersLoaded();

  const cleanToken = String(token ?? '').trim();
  if (!cleanToken) return null;

  for (const user of userMemoryStore.values()) {
    if (Array.isArray(user.tokens) && user.tokens.includes(cleanToken)) {
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

  const cleanId = String(userId ?? '').trim();
  if (!cleanId) return null;

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

  const cleanUserId = String(userId ?? '').trim();
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

  const cleanUserId = String(userId ?? '').trim();
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
    path.join(os.tmpdir(), 'trade-horny', 'users'),
  ];

  for (const dir of candidateDirs) {
    if (dir && fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if ((file.endsWith('.json') || file.includes('.tmp.')) && !file.startsWith('.')) {
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

  return { deletedUsers: count };
}
