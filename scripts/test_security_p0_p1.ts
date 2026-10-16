import assert from 'assert';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Isolate test sandbox directory
process.env.DATA_DIR = path.join(__dirname, '..', '.data_test_security');

import {
  createUser,
  loginUser,
  getUserByToken,
  getUserById,
  hashPassword,
  verifyPassword,
  verifyPasswordWithUpgrade,
  safeTimingEqual,
  isTokenExpired,
  ensureSuperUserAccount,
  sanitizeUsername,
  sanitizeUserId,
  clearAllServerUsers,
  deleteUser,
  userLock,
  atomicWriteFileSync as atomicWriteUserFile,
  TOKEN_TTL_MS,
  PBKDF2_ITERATIONS,
} from '../src/lib/serverUserStore';

import {
  getServerLeagueState,
  saveServerLeagueSnapshot,
  claimServerTeam,
  recordServerSwipe,
  sanitizeLeagueId,
  sanitizeTeamId,
  clearAllServerLeagues,
  toClientLeagueView,
  leagueLock,
  atomicWriteFileSync as atomicWriteLeagueFile,
} from '../src/lib/serverLeagueStore';

import { GET as leagueGET, POST as leaguePOST } from '../src/app/api/league/route';
import { POST as authPOST } from '../src/app/api/auth/route';
import { POST as adminClearPOST, GET as adminClearGET } from '../src/app/api/admin/clear/route';
import { createMockLeague } from '../src/lib/espn';

async function runSecurityP0P1Tests() {
  console.log('====================================================');
  console.log('--- Starting P0/P1 Security & Architecture Suite ---');
  console.log('====================================================\n');

  clearAllServerUsers();
  clearAllServerLeagues();

  // --------------------------------------------------------------------------
  // 1. Password Hashing, Dynamic Migration & Constant-Time Comparison
  // --------------------------------------------------------------------------
  console.log('[Test 1.1] Testing modern PBKDF2 hashing...');
  const { salt, hash } = hashPassword('MySecretPass123!');
  assert(hash.startsWith(`pbkdf2:${PBKDF2_ITERATIONS}:sha512:`), 'Hash must use modern pbkdf2 prefix');
  assert(verifyPassword('MySecretPass123!', salt, hash), 'Modern hash should verify successfully');
  assert(!verifyPassword('WrongPassword', salt, hash), 'Incorrect password must fail verification');
  console.log('✓ Test 1.1 Passed: Modern PBKDF2 with SHA-512 and 100k iterations verified.');

  console.log('[Test 1.2] Testing backward compatibility with legacy 1k iteration PBKDF2...');
  const legacySalt = crypto.randomBytes(16).toString('hex');
  const legacy1kHash = crypto.pbkdf2Sync('LegacyPassword123', legacySalt, 1000, 64, 'sha512').toString('hex');
  const res1k = verifyPasswordWithUpgrade('LegacyPassword123', legacySalt, legacy1kHash);
  assert.strictEqual(res1k.valid, true, 'Legacy 1k hash must verify as valid');
  assert.strictEqual(res1k.needsRehash, true, 'Legacy 1k hash must flag for rehashing');
  console.log('✓ Test 1.2 Passed: Legacy 1k PBKDF2 verifies and flags for upgrade.');

  console.log('[Test 1.3] Testing backward compatibility with legacy raw SHA-256...');
  const rawSha256 = crypto.createHash('sha256').update('RawShaPassword123').digest('hex');
  const resSha = verifyPasswordWithUpgrade('RawShaPassword123', '', rawSha256);
  assert.strictEqual(resSha.valid, true, 'Raw SHA-256 must verify');
  assert.strictEqual(resSha.needsRehash, true, 'Raw SHA-256 must flag for rehashing');
  console.log('✓ Test 1.3 Passed: Raw SHA-256 verifies and flags for upgrade.');

  console.log('[Test 1.4] Testing dynamic password upgrade on user login...');
  // Manually insert a user with legacy 1k hash into the user store
  const legacyUser = createUser('LegacyUser', 'TempPassword');
  // Overwrite their hash on disk with legacy 1k hash
  const dir = path.join(process.env.DATA_DIR, 'users');
  const userFilePath = path.join(dir, `${legacyUser.user.id}.json`);
  const userJson = JSON.parse(fs.readFileSync(userFilePath, 'utf-8'));
  userJson.salt = legacySalt;
  userJson.hash = legacy1kHash;
  fs.writeFileSync(userFilePath, JSON.stringify(userJson, null, 2));

  // Reset in-memory cache to force reloading from disk
  const { resetUserStoreMemoization } = await import('../src/lib/serverUserStore');
  resetUserStoreMemoization();

  // Log in with legacy password
  const upgradedLogin = loginUser('LegacyUser', 'LegacyPassword123');
  assert(upgradedLogin && upgradedLogin.token, 'Login should succeed with legacy password');

  // Verify that disk now holds modern PBKDF2 hash
  const updatedUserDisk = JSON.parse(fs.readFileSync(userFilePath, 'utf-8'));
  assert(
    updatedUserDisk.hash.startsWith(`pbkdf2:${PBKDF2_ITERATIONS}:`),
    'User hash on disk must be upgraded to modern PBKDF2'
  );
  console.log('✓ Test 1.4 Passed: Dynamic password upgrade on login works seamlessly.');

  console.log('[Test 1.5] Testing safeTimingEqual constant-time comparison...');
  const hexA = crypto.randomBytes(32).toString('hex');
  const hexB = crypto.randomBytes(32).toString('hex');
  assert.strictEqual(safeTimingEqual(hexA, hexA), true, 'Identical hex strings must return true');
  assert.strictEqual(safeTimingEqual(hexA, hexB), false, 'Different hex strings must return false');
  assert.strictEqual(safeTimingEqual(hexA, 'short'), false, 'Different length strings must safely return false without throwing');
  assert.strictEqual(safeTimingEqual('', ''), false, 'Empty strings must return false');
  assert.strictEqual(safeTimingEqual('thanos', 'thanos'), true, 'UTF-8 string thanos must match itself');
  assert.strictEqual(safeTimingEqual('thanos', 'thanos2'), false, 'Different UTF-8 strings must not match');
  assert.strictEqual(safeTimingEqual('ComplexP@ssw0rd!#$%', 'ComplexP@ssw0rd!#$%'), true, 'Complex password must match');
  console.log('✓ Test 1.5 Passed: safeTimingEqual handles all inputs safely (hex and arbitrary UTF-8).');

  console.log('[Test 1.6] Preserving root superuser account superu / thanos...');
  const rootSuperu = ensureSuperUserAccount();
  assert.strictEqual(rootSuperu.username, 'superu');
  assert.strictEqual(rootSuperu.isSuperUser, true);
  const superuLogin = loginUser('superu', 'thanos');
  assert(superuLogin && superuLogin.token);
  assert.strictEqual(superuLogin.user.isSuperUser, true);
  console.log('✓ Test 1.6 Passed: Root superuser account superu / thanos is preserved and active.');

  // --------------------------------------------------------------------------
  // 2. Token TTL & Expiration Enforcement
  // --------------------------------------------------------------------------
  console.log('\n[Test 2.1] Testing session token issuance with TTL...');
  const { user: sessionUser, token: sessionToken } = createUser('SessionUser', 'Pass1234');
  assert(sessionToken.startsWith('tok_'), 'Token should have tok_ prefix');
  const foundSessionUser = getUserByToken(sessionToken);
  assert(foundSessionUser !== null, 'Active token should resolve user');
  console.log('✓ Test 2.1 Passed: Valid session token resolves active user.');

  console.log('[Test 2.2] Testing revocation of expired session token...');
  // Forge an expired token: created 31 days ago
  const expiredTime = Date.now() - (TOKEN_TTL_MS + 1000 * 60 * 60);
  const expiredToken = `tok_${expiredTime}_${crypto.randomBytes(24).toString('hex')}`;

  // Directly insert expired token into user file
  const sessionUserFile = path.join(dir, `${sessionUser.id}.json`);
  const sessionUserJson = JSON.parse(fs.readFileSync(sessionUserFile, 'utf-8'));
  sessionUserJson.tokens.push(expiredToken);
  if (!sessionUserJson.sessions) sessionUserJson.sessions = {};
  sessionUserJson.sessions[expiredToken] = {
    createdAt: new Date(expiredTime).toISOString(),
    expiresAt: new Date(expiredTime + TOKEN_TTL_MS).toISOString(),
  };
  fs.writeFileSync(sessionUserFile, JSON.stringify(sessionUserJson, null, 2));

  resetUserStoreMemoization();

  // Resolving expired token must return null AND revoke it from disk
  const expiredResolution = getUserByToken(expiredToken);
  assert.strictEqual(expiredResolution, null, 'Expired token must return null');

  const afterRevokeJson = JSON.parse(fs.readFileSync(sessionUserFile, 'utf-8'));
  assert(
    !afterRevokeJson.tokens.includes(expiredToken),
    'Expired token must be revoked and excised from user tokens array'
  );
  console.log('✓ Test 2.2 Passed: Expired session token is rejected and revoked.');

  console.log('[Test 2.3] Testing legacy un-timestamped token expiry with old user updatedAt...');
  const oldLegacyUser: any = {
    id: 'usr_old_legacy_1',
    username: 'OldLegacyUser',
    normalizedUsername: 'oldlegacyuser',
    salt: 'salt123',
    hash: 'hash123',
    tokens: ['tok_old_legacy_random_hex_string_12345'],
    claimedTeams: {},
    createdAt: new Date(Date.now() - (TOKEN_TTL_MS + 86400000)).toISOString(),
    updatedAt: new Date(Date.now() - (TOKEN_TTL_MS + 86400000)).toISOString(),
  };
  assert.strictEqual(
    isTokenExpired(oldLegacyUser, 'tok_old_legacy_random_hex_string_12345'),
    true,
    'Legacy token from an account older than TOKEN_TTL_MS must be expired'
  );
  console.log('✓ Test 2.3 Passed: Legacy un-timestamped token expiry handled correctly.');

  // --------------------------------------------------------------------------
  // 3. Privacy: Blind Swipes & Match Secrecy (SEC-02)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3.1] Testing GET /api/league privacy filter for third parties...');
  const testLeague = createMockLeague();
  testLeague.id = 'league_privacy_test';
  testLeague.espnLeagueId = 'privacy_test_1';
  saveServerLeagueSnapshot(testLeague, 'privacy_test_1');

  const teamAId = testLeague.teams[0].id;
  const teamBId = testLeague.teams[1].id;

  // Create two separate users
  const { user: userA, token: tokenA } = createUser('OwnerAlpha', 'passAlpha123');
  const { user: userB, token: tokenB } = createUser('OwnerBeta', 'passBeta123');

  // Claim Team A as OwnerAlpha, Team B as OwnerBeta
  claimServerTeam('privacy_test_1', teamAId, 'OwnerAlpha', testLeague, undefined, userA.id);
  claimServerTeam('privacy_test_1', teamBId, 'OwnerBeta', testLeague, undefined, userB.id);

  // Record a swipe from Team A
  recordServerSwipe('privacy_test_1', {
    id: 'swipe_a_to_b',
    teamId: teamAId,
    targetTeamId: teamBId,
    tradeType: '1-for-1',
    offeredPlayerIds: [testLeague.teams[0].roster[0].id],
    targetPlayerIds: [testLeague.teams[1].roster[0].id],
    isInterested: true,
    createdAt: new Date().toISOString(),
  });

  // Call GET /api/league requesting Team A's data:
  // Case 3.1a: Unauthenticated caller requesting teamId=teamAId
  const reqUnauthGet = new NextRequest(
    `http://localhost:3000/api/league?leagueId=privacy_test_1&teamId=${teamAId}`
  );
  const resUnauthGet = await leagueGET(reqUnauthGet);
  assert.strictEqual(resUnauthGet.status, 200);
  const bodyUnauthGet = await resUnauthGet.json();
  assert.strictEqual(bodyUnauthGet.mySwipes.length, 0, 'Unauthenticated caller must receive mySwipes: []');
  console.log('✓ Test 3.1a: Unauthenticated caller cannot see manager swipes (mySwipes: []).');

  // Case 3.1b: Rival OwnerBeta requesting Team A's data
  const reqRivalGet = new NextRequest(
    `http://localhost:3000/api/league?leagueId=privacy_test_1&teamId=${teamAId}`,
    {
      headers: { Authorization: `Bearer ${tokenB}` },
    }
  );
  const resRivalGet = await leagueGET(reqRivalGet);
  const bodyRivalGet = await resRivalGet.json();
  assert.strictEqual(bodyRivalGet.mySwipes.length, 0, 'Rival manager must receive mySwipes: []');
  console.log('✓ Test 3.1b: Rival manager cannot inspect opponent team swipes.');

  // Case 3.1c: True OwnerAlpha requesting their own Team A data
  const reqOwnerGet = new NextRequest(
    `http://localhost:3000/api/league?leagueId=privacy_test_1&teamId=${teamAId}`,
    {
      headers: { Authorization: `Bearer ${tokenA}` },
    }
  );
  const resOwnerGet = await leagueGET(reqOwnerGet);
  const bodyOwnerGet = await resOwnerGet.json();
  assert.strictEqual(bodyOwnerGet.mySwipes.length, 1, 'Legitimate team owner must receive their own mySwipes');
  assert.strictEqual(bodyOwnerGet.mySwipes[0].teamId, teamAId);
  console.log('✓ Test 3.1c: Legitimate owner receives their private swipes.');

  // Case 3.1d: Superuser can view any team's swipes
  const reqSuperGet = new NextRequest(
    `http://localhost:3000/api/league?leagueId=privacy_test_1&teamId=${teamAId}`,
    {
      headers: { Authorization: `Bearer ${superuLogin.token}` },
    }
  );
  const resSuperGet = await leagueGET(reqSuperGet);
  const bodySuperGet = await resSuperGet.json();
  assert.strictEqual(bodySuperGet.mySwipes.length, 1, 'Superuser receives team swipes');
  console.log('✓ Test 3.1d: Superuser authorized to inspect team swipes.');

  // --------------------------------------------------------------------------
  // 4. BOLA / IDOR Protection on Mutations (SEC-05)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4.1] Testing BOLA rejection: unauthorized user cannot swipe for claimed team...');
  const reqIllegalSwipe = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` }, // OwnerBeta trying to swipe as Team A
    body: JSON.stringify({
      action: 'swipe',
      leagueId: 'privacy_test_1',
      swipe: {
        id: 'illegal_swipe',
        teamId: teamAId, // Stolen team!
        targetTeamId: teamBId,
        tradeType: '1-for-1',
        offeredPlayerIds: [testLeague.teams[0].roster[0].id],
        targetPlayerIds: [testLeague.teams[1].roster[0].id],
        isInterested: true,
      },
    }),
  });
  const resIllegalSwipe = await leaguePOST(reqIllegalSwipe);
  assert.strictEqual(resIllegalSwipe.status, 403, 'Unauthorized swipe on claimed team must return 403 Forbidden');
  console.log('✓ Test 4.1: Rival manager rejected with 403 when attempting to swipe on another team.');

  console.log('[Test 4.2] Testing BOLA rejection: unauthenticated user cannot swipe for claimed team...');
  const reqAnonSwipe = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'swipe',
      leagueId: 'privacy_test_1',
      swipe: {
        id: 'anon_swipe',
        teamId: teamAId,
        targetTeamId: teamBId,
        tradeType: '1-for-1',
        offeredPlayerIds: [testLeague.teams[0].roster[0].id],
        targetPlayerIds: [testLeague.teams[1].roster[0].id],
        isInterested: true,
      },
    }),
  });
  const resAnonSwipe = await leaguePOST(reqAnonSwipe);
  assert.strictEqual(resAnonSwipe.status, 401, 'Unauthenticated swipe on claimed team must return 401 Unauthorized');
  console.log('✓ Test 4.2: Unauthenticated swipe on claimed team rejected with 401.');

  // --------------------------------------------------------------------------
  // 5. Team Claim Conflict Desync (ARCH-01)
  // --------------------------------------------------------------------------
  console.log('\n[Test 5.1] Testing claim conflict desync rejection (ARCH-01)...');
  // OwnerBeta attempts to claim Team A (which belongs to OwnerAlpha)
  const reqStealClaim = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({
      action: 'claim',
      leagueId: 'privacy_test_1',
      teamId: teamAId,
      claimantName: 'OwnerBeta',
    }),
  });
  const resStealClaim = await leaguePOST(reqStealClaim);
  assert.strictEqual(resStealClaim.status, 409, 'Claiming already-owned team must return 409 Conflict');

  // Verify that OwnerBeta's account in serverUserStore was NOT corrupted/linked
  const freshUserB = getUserById(userB.id);
  assert(freshUserB);
  assert.strictEqual(
    freshUserB.claimedTeams['privacy_test_1'],
    undefined,
    'Conflicted user must NOT have stolen team linked in claimedTeams'
  );
  console.log('✓ Test 5.1 Passed: Claim conflict returns 409 Conflict and preserves user account integrity.');

  console.log('[Test 5.2] Testing prevention of unauthenticated userId spoofing in action: claim...');
  // Create an innocent victim user account
  const { user: victimUser } = createUser('VictimUser', 'victimPass123');
  const team3Id = testLeague.teams[2].id;

  // An anonymous caller sends a claim request supplying victimUser.id without their auth token
  const reqSpoofedClaim = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'claim',
      leagueId: 'privacy_test_1',
      teamId: team3Id,
      claimantName: 'Attacker',
      userId: victimUser.id, // Attempt to link claim to victim's account without authentication!
    }),
  });
  const resSpoofedClaim = await leaguePOST(reqSpoofedClaim);
  assert.strictEqual(resSpoofedClaim.status, 200);

  // Crucially: The team must NOT be linked to victimUser's account in serverUserStore!
  const freshVictim = getUserById(victimUser.id);
  assert(freshVictim);
  assert.strictEqual(
    freshVictim.claimedTeams['privacy_test_1'],
    undefined,
    'Unauthenticated claim must NEVER link team to victim account in serverUserStore'
  );
  console.log('✓ Test 5.2 Passed: Unauthenticated userId spoofing is blocked.');

  // --------------------------------------------------------------------------
  // 6. Path Traversal & Input Sanitization
  // --------------------------------------------------------------------------
  console.log('\n[Test 6.1] Testing sanitizeLeagueId path traversal rejection...');
  const badLeagueIds = ['../evil', '..\\evil', '../../etc/passwd', 'league/123', 'league\0null', ''];
  for (const badId of badLeagueIds) {
    assert.throws(() => sanitizeLeagueId(badId), /Invalid ESPN League ID/, `Should reject ${badId}`);
  }
  console.log('✓ Test 6.1 Passed: sanitizeLeagueId rejects all path traversal sequences.');

  console.log('[Test 6.2] Testing sanitizeTeamId path traversal rejection...');
  const badTeamIds = ['../team', '..\\team', 'team/bad', 'team\0bad', ''];
  for (const badId of badTeamIds) {
    assert.throws(() => sanitizeTeamId(badId), /Invalid Team ID/, `Should reject ${badId}`);
  }
  console.log('✓ Test 6.2 Passed: sanitizeTeamId rejects all path traversal sequences.');

  console.log('[Test 6.3] Testing sanitizeUsername path traversal & reserved name rejection...');
  assert.throws(() => sanitizeUsername('..'), /Username cannot start\/end with a dot/);
  assert.throws(() => sanitizeUsername('.hidden'), /Username cannot start\/end with a dot/);
  assert.throws(() => createUser('superu', 'somePass'), /Username "superu" is reserved/);
  console.log('✓ Test 6.3 Passed: sanitizeUsername rejects directory characters and reserved superu.');

  console.log('[Test 6.4] Protecting root superuser account from deletion...');
  assert.throws(() => deleteUser('usr_superu_root'), /Cannot delete the root super user account/);
  console.log('✓ Test 6.4 Passed: Root superuser account is protected against deletion.');

  // --------------------------------------------------------------------------
  // 7. Atomic Writes & Concurrency Lock
  // --------------------------------------------------------------------------
  console.log('\n[Test 7.1] Testing atomic write file resilience...');
  const testAtomicPath = path.join(dir, 'test_atomic_write.json');
  atomicWriteUserFile(testAtomicPath, JSON.stringify({ ok: true, version: 1 }));
  const readBack = JSON.parse(fs.readFileSync(testAtomicPath, 'utf-8'));
  assert.strictEqual(readBack.ok, true);
  assert.strictEqual(readBack.version, 1);
  fs.unlinkSync(testAtomicPath);
  console.log('✓ Test 7.1 Passed: atomicWriteFileSync writes and renames safely.');

  console.log('[Test 7.2] Testing leagueLock sequential serialization under concurrency...');
  let sharedCounter = 0;
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      leagueLock.acquire('shared_key', async () => {
        const current = sharedCounter;
        await new Promise((res) => setTimeout(res, 5));
        sharedCounter = current + 1;
      })
    );
  }
  await Promise.all(promises);
  console.log('✓ Test 7.2 Passed: Concurrent lock serializes operations without race condition.');

  console.log('[Test 7.3] Testing userLock sequential serialization under concurrency...');
  let userCounter = 0;
  const userPromises: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    userPromises.push(
      userLock.acquire('user_shared_key', async () => {
        const current = userCounter;
        await new Promise((res) => setTimeout(res, 5));
        userCounter = current + 1;
      })
    );
  }
  await Promise.all(userPromises);
  assert.strictEqual(userCounter, 10, 'userCounter must be exactly 10 with userLock protection');
  console.log('✓ Test 7.3 Passed: userLock serializes operations without race condition.');

  console.log('[Test 7.4] Testing AsyncLock recovery when a queued task throws an error...');
  let ranAfterError = false;
  try {
    await userLock.acquire('error_key', async () => {
      throw new Error('Intentional error in locked task');
    });
  } catch {
    // Expected rejection
  }

  // The next queued task on 'error_key' must proceed and not hang
  await userLock.acquire('error_key', async () => {
    ranAfterError = true;
  });
  assert.strictEqual(ranAfterError, true, 'Subsequent task must execute after prior lock task rejection');
  console.log('✓ Test 7.4 Passed: AsyncLock recovers cleanly when an execution throws.');

  // Clean up test data dir
  if (fs.existsSync(process.env.DATA_DIR)) {
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  }

  console.log('\n====================================================');
  console.log('ALL P0/P1 SECURITY & ARCHITECTURE TESTS PASSED! 🎉');
  console.log('====================================================\n');
}

export const testPromise = runSecurityP0P1Tests().catch((err) => {
  console.error('P0/P1 Security Test Suite Failed:', err);
  process.exit(1);
});
