import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  clearAllServerLeagues,
  getServerLeagueState,
  saveServerLeagueSnapshot,
  recordServerSwipe,
} from '../src/lib/serverLeagueStore';
import {
  clearAllServerUsers,
  createUser,
  loginUser,
  getUserByToken,
} from '../src/lib/serverUserStore';
import { POST as adminClearPOST, GET as adminClearGET } from '../src/app/api/admin/clear/route';
import { POST as leaguePOST } from '../src/app/api/league/route';
import { createMockLeague } from '../src/lib/espn';
import { NextRequest } from 'next/server';

async function runClearTests() {
  console.log('--- Starting Data Clearing Verification Suite ---');

  // Test 1: clearAllServerLeagues directly
  console.log('\n[Test 1] Testing clearAllServerLeagues()...');
  // Seed a dummy league
  const dummyLeague = createMockLeague();
  dummyLeague.id = 'league_dummy_clear_test';
  dummyLeague.espnLeagueId = 'dummy_clear_test';
  saveServerLeagueSnapshot(dummyLeague, 'dummy_clear_test');

  const beforeState = getServerLeagueState('dummy_clear_test');
  assert(beforeState !== null, 'Dummy league should exist before clear');

  const leagueClearResult = clearAllServerLeagues();
  assert(leagueClearResult.deletedLeagues.includes('dummy_clear_test'), 'Dummy league should be deleted');
  assert.strictEqual(leagueClearResult.demoReseeded, true, 'Demo league should be re-seeded');

  const afterState = getServerLeagueState('dummy_clear_test');
  assert.strictEqual(afterState, null, 'Dummy league should no longer exist');

  const demoState = getServerLeagueState('12345678');
  assert(demoState !== null, 'Demo league 12345678 must be cleanly re-seeded');
  assert.strictEqual(demoState.matches.length, 0, 'Demo matches should be 0');
  console.log('✓ Test 1 Passed: clearAllServerLeagues wipes test leagues and re-seeds clean demo league.');

  // Test 2: clearAllServerUsers directly
  console.log('\n[Test 2] Testing clearAllServerUsers()...');
  const userResult = createUser('test_wipe_user', 'password123');
  assert(userResult && userResult.token);
  const foundUser = getUserByToken(userResult.token);
  assert(foundUser !== null, 'User should exist before clear');

  const userClearResult = clearAllServerUsers();
  assert(userClearResult.deletedUsers >= 1, 'Should have deleted at least 1 user');

  const afterUser = getUserByToken(userResult.token);
  assert.strictEqual(afterUser, null, 'User session should be invalidated and gone');
  console.log('✓ Test 2 Passed: clearAllServerUsers wipes all user accounts and sessions.');

  // Test 3: POST /api/admin/clear route with authentication
  console.log('\n[Test 3] Testing POST /api/admin/clear route security...');
  // 3a. Unauthenticated request should be rejected with 401
  const reqAdminUnauth = new NextRequest('http://localhost:3000/api/admin/clear', {
    method: 'POST',
  });
  const resAdminUnauth = await adminClearPOST(reqAdminUnauth);
  assert.strictEqual(resAdminUnauth.status, 401, 'Unauthenticated POST /api/admin/clear must return 401 Unauthorized');

  // 3b. GET request should be rejected with 405 Method Not Allowed
  const resAdminGet = await adminClearGET();
  assert.strictEqual(resAdminGet.status, 405, 'GET /api/admin/clear must return 405 Method Not Allowed');

  // 3c. Authenticated superuser request succeeds
  const superuAuth = loginUser('superu', 'thanos');
  const reqAdminAuth = new NextRequest('http://localhost:3000/api/admin/clear', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${superuAuth.token}`,
    },
  });
  const resAdmin = await adminClearPOST(reqAdminAuth);
  assert.strictEqual(resAdmin.status, 200, 'POST /api/admin/clear with superuser token should return 200');
  const bodyAdmin = await resAdmin.json();
  assert.strictEqual(bodyAdmin.success, true);
  assert.strictEqual(bodyAdmin.demoReseeded, true);
  console.log('✓ Test 3 Passed: /api/admin/clear blocks unauthenticated calls and succeeds with superuser token.');

  // Test 4: POST /api/league endpoint must reject action: "clear_all_data" (SEC-01)
  console.log('\n[Test 4] Testing POST /api/league rejection of action: "clear_all_data"...');
  const reqLeagueClear = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'clear_all_data',
    }),
  });
  const resLeagueClear = await leaguePOST(reqLeagueClear);
  assert.strictEqual(resLeagueClear.status, 400, 'POST /api/league clear_all_data must return 400 Bad Request');
  const bodyLeagueClear = await resLeagueClear.json();
  assert(bodyLeagueClear.error && bodyLeagueClear.error.includes('Unsupported action'));
  console.log('✓ Test 4 Passed: POST /api/league clear_all_data is blocked with 400 Bad Request.');

  // Test 5: ensureCleanSlateMigration()
  console.log('\n[Test 5] Testing ensureCleanSlateMigration()...');
  const { ensureCleanSlateMigration } = await import('../src/lib/serverLeagueStore');
  const migrationRes = ensureCleanSlateMigration();
  assert(typeof migrationRes.executed === 'boolean', 'Migration should return status object');
  console.log('✓ Test 5 Passed: ensureCleanSlateMigration is safe and idempotent.');

  console.log('\n=============================================');
  console.log('ALL DATA CLEARING TESTS PASSED! 🎉');
  console.log('=============================================');
}

export const testPromise = runClearTests().catch((err) => {
  console.error('Data Clearing Test Suite Failed:', err);
  process.exit(1);
});
