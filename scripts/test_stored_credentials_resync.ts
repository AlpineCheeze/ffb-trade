import assert from 'assert';
import {
  saveStoredLeagueCreds,
  getStoredLeagueCreds,
  removeStoredLeagueCreds,
  removeStoredLeague,
  saveLeague,
} from '../src/lib/leagueStore';
import {
  saveServerLeagueSnapshot,
  getServerLeagueState,
  deleteServerLeagueState,
  toClientLeagueView,
} from '../src/lib/serverLeagueStore';
import { POST as espnPOST, GET as espnGET } from '../src/app/api/espn/route';
import { createMockLeague } from '../src/lib/espn';
import { NextRequest } from 'next/server';

export async function runStoredCredentialsTests() {
  console.log('\n========================================================');
  console.log('--- Starting Stored Credentials & Re-Sync Test Suite ---');
  console.log('========================================================\n');

  // Set up mock window and localStorage / sessionStorage for Node environment
  const mockStorage: Record<string, string> = {};
  const mockSession: Record<string, string> = {};
  (global as any).window = {
    localStorage: {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
    },
    sessionStorage: {
      getItem: (key: string) => mockSession[key] || null,
      setItem: (key: string, val: string) => {
        mockSession[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockSession[key];
      },
      clear: () => {
        for (const k of Object.keys(mockSession)) delete mockSession[k];
      },
    },
  };
  (global as any).localStorage = (global as any).window.localStorage;
  (global as any).sessionStorage = (global as any).window.sessionStorage;

  const testLeagueId = '99887766';
  deleteServerLeagueState(testLeagueId);

  // [Test 1] Client Storage: saveStoredLeagueCreds & getStoredLeagueCreds
  console.log('[Test 1] Testing client-side persistent storage of ESPN cookies...');
  saveStoredLeagueCreds(testLeagueId, {
    espnS2: 'AEB_sample_s2_token_xyz',
    swid: '{12345678-ABCD-EF01-2345-6789ABCDEF01}',
  });

  const retrievedCreds = getStoredLeagueCreds(testLeagueId);
  assert(retrievedCreds !== null, 'Stored creds should not be null');
  assert.strictEqual(retrievedCreds?.espnS2, 'AEB_sample_s2_token_xyz');
  assert.strictEqual(retrievedCreds?.swid, '{12345678-ABCD-EF01-2345-6789ABCDEF01}');
  console.log('✓ Test 1 Passed: Client credentials successfully persisted and retrieved.');

  // [Test 2] Client Storage: removal on league deletion
  console.log('\n[Test 2] Testing removeStoredLeague cleans up persistent credentials...');
  removeStoredLeague(testLeagueId);
  const afterDeleteCreds = getStoredLeagueCreds(testLeagueId);
  assert.strictEqual(afterDeleteCreds, null, 'Creds should be removed after league deletion');
  console.log('✓ Test 2 Passed: Credential cleanup upon league removal verified.');

  // [Test 3] Server Storage: saveServerLeagueSnapshot stores espnCredentials
  console.log('\n[Test 3] Testing server-side persistent storage of espnCredentials in ServerLeagueState...');
  const mockLeague = createMockLeague();
  mockLeague.espnLeagueId = testLeagueId;
  mockLeague.name = 'Private Test League';

  saveServerLeagueSnapshot(mockLeague, testLeagueId, {
    espnS2: 'AEB_server_persisted_s2',
    swid: '{ABCD-1234-SWID}',
  });

  let serverState = getServerLeagueState(testLeagueId);
  assert(serverState !== null, 'Server state should exist');
  assert(serverState?.espnCredentials !== undefined, 'espnCredentials must be saved');
  assert.strictEqual(serverState?.espnCredentials?.espnS2, 'AEB_server_persisted_s2');
  assert.strictEqual(serverState?.espnCredentials?.swid, '{ABCD-1234-SWID}');
  console.log('✓ Test 3 Passed: Server stores espnCredentials securely in ServerLeagueState.');

  // [Test 4] Server Storage: snapshot update preserves existing credentials when omitted
  console.log('\n[Test 4] Testing that subsequent snapshot saves preserve stored credentials...');
  const updatedMock = { ...mockLeague, name: 'Updated Private League Name' };
  saveServerLeagueSnapshot(updatedMock, testLeagueId); // No credentials passed!

  serverState = getServerLeagueState(testLeagueId);
  assert.strictEqual(serverState?.league.name, 'Updated Private League Name');
  assert.strictEqual(serverState?.espnCredentials?.espnS2, 'AEB_server_persisted_s2');
  assert.strictEqual(serverState?.espnCredentials?.swid, '{ABCD-1234-SWID}');
  console.log('✓ Test 4 Passed: Stored server credentials preserved across subsequent snapshots.');

  // [Test 5] Security Check: toClientLeagueView never leaks credentials
  console.log('\n[Test 5] Verifying that toClientLeagueView NEVER leaks espnCredentials to clients...');
  const clientView = toClientLeagueView(serverState!, null);
  assert.strictEqual((clientView as any).espnCredentials, undefined);
  assert.strictEqual((clientView.league as any).espnCredentials, undefined);
  console.log('✓ Test 5 Passed: Data privacy verified — zero credentials exposed in client views.');

  // [Test 6] API Endpoint: POST /api/espn serves cached or re-syncs using stored credentials
  console.log('\n[Test 6] Testing POST /api/espn re-sync without re-entering cookies...');
  const postReq = new NextRequest('http://localhost:6969/api/espn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leagueId: testLeagueId,
      // NOTE: NO espnS2 or swid passed!
    }),
  });

  const postRes = await espnPOST(postReq);
  const postJson = await postRes.json();
  assert.strictEqual(postRes.status, 200);
  assert.strictEqual(postJson.success, true);
  assert.strictEqual(postJson.league.espnLeagueId, testLeagueId);
  console.log('✓ Test 6 Passed: POST /api/espn successfully returned league data without re-entering cookies.');

  // Clean up test league
  deleteServerLeagueState(testLeagueId);

  console.log('\n========================================================');
  console.log('ALL STORED CREDENTIALS & RE-SYNC TESTS PASSED! 🎉');
  console.log('========================================================\n');
}

export const testPromise = runStoredCredentialsTests();
