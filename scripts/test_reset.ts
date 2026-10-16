import assert from 'assert';
import {
  getServerLeagueState,
  saveServerLeagueSnapshot,
  claimServerTeam,
  recordServerSwipe,
  deleteServerMatch,
  resetServerLeagueSwipes,
  toClientLeagueView,
  sanitizeLeagueId,
} from '../src/lib/serverLeagueStore';
import { POST } from '../src/app/api/league/route';
import { createMockLeague } from '../src/lib/espn';
import { NextRequest } from 'next/server';

async function runTests() {
  console.log('--- Starting Reset Swipes Verification Suite ---');

  // Test 1: Real League Workflow with Claim, Swipes, Matches, and Reset
  console.log('\n[Test 1] Testing resetServerLeagueSwipes on custom league...');
  const baseLeague = createMockLeague();
  const testLeagueId = 'reset_test_999';
  const customLeague = {
    ...baseLeague,
    id: `league_${testLeagueId}`,
    espnLeagueId: testLeagueId,
    name: 'Reset Test League',
  };

  // Save initial league
  saveServerLeagueSnapshot(customLeague, testLeagueId);
  let state = getServerLeagueState(testLeagueId);
  assert(state !== null, 'State should exist for custom league');
  assert.strictEqual(state.swipes.length, 0, 'Real custom league should start with 0 swipes');

  // Claim Team 1
  const team1Id = customLeague.teams[0].id;
  const team2Id = customLeague.teams[1].id;
  claimServerTeam(testLeagueId, team1Id, 'Alice Cooper', customLeague);
  claimServerTeam(testLeagueId, team2Id, 'Bob Dylan', customLeague);

  state = getServerLeagueState(testLeagueId)!;
  const team1 = state.league.teams.find((t) => t.id === team1Id);
  const team2 = state.league.teams.find((t) => t.id === team2Id);
  assert.strictEqual(team1?.isClaimed, true, 'Team 1 should be claimed');
  assert.strictEqual(team1?.claimedBy, 'Alice Cooper', 'Team 1 claimedBy should match');
  assert.strictEqual(team2?.isClaimed, true, 'Team 2 should be claimed');
  assert.strictEqual(team2?.claimedBy, 'Bob Dylan', 'Team 2 claimedBy should match');

  // Record mutual swipe between Team 1 and Team 2 to create a match
  const p1 = team1?.roster[0];
  const p2 = team2?.roster[0];
  assert(p1 && p2, 'Players must exist');

  // Team 1 swipes on Team 2's player
  const swipe1Result = recordServerSwipe(testLeagueId, {
    id: 'swipe_t1_1',
    teamId: team1Id,
    tradeType: '1-for-1',
    offeredPlayerIds: [p1.id],
    targetPlayerIds: [p2.id],
    targetTeamId: team2Id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  }, customLeague);
  assert(swipe1Result !== null);
  assert.strictEqual(swipe1Result.matchFound, null, 'No match yet on first swipe');

  // Team 2 swipes reciprocally on Team 1's player
  const swipe2Result = recordServerSwipe(testLeagueId, {
    id: 'swipe_t2_1',
    teamId: team2Id,
    tradeType: '1-for-1',
    offeredPlayerIds: [p2.id],
    targetPlayerIds: [p1.id],
    targetTeamId: team1Id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  }, customLeague);
  assert(swipe2Result !== null);
  assert(swipe2Result.matchFound !== null, 'Mutual match should be found');

  state = getServerLeagueState(testLeagueId)!;
  assert.strictEqual(state.swipes.length, 2, 'Should have 2 swipes recorded');
  assert.strictEqual(state.matches.length, 1, 'Should have 1 match');

  // Delete match to test deletedMatches state
  deleteServerMatch(testLeagueId, team1Id, state.matches[0].id, customLeague);
  state = getServerLeagueState(testLeagueId)!;
  assert.strictEqual(state.matches.length, 0, 'Match should be removed from active matches');
  assert.strictEqual((state.deletedMatches || []).length, 1, 'Match should be archived under deletedMatches');

  // Add another swipe so swipes > 0
  recordServerSwipe(testLeagueId, {
    id: 'swipe_t1_2',
    teamId: team1Id,
    tradeType: '1-for-1',
    offeredPlayerIds: [p1.id],
    targetPlayerIds: [team2?.roster[1].id || 'dummy'],
    targetTeamId: team2Id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  }, customLeague);

  state = getServerLeagueState(testLeagueId)!;
  assert(state.swipes.length > 0, 'Swipes should exist before reset');

  // NOW RESET THE LEAGUE SWIPES
  const resetResult = resetServerLeagueSwipes(testLeagueId, customLeague);
  assert(resetResult !== null, 'resetServerLeagueSwipes should return updated state');
  assert.strictEqual(resetResult.swipes.length, 0, 'All swipes should be reset to empty array');
  assert.strictEqual(resetResult.matches.length, 0, 'All matches should be reset to empty array');
  assert.strictEqual(resetResult.deletedMatches?.length, 0, 'All deletedMatches should be reset to empty array');
  assert.strictEqual(Object.keys(resetResult.elo).length, 0, 'Elo ratings should be reset');

  // CRITICAL: Team claims MUST remain intact!
  const resetTeam1 = resetResult.league.teams.find((t) => t.id === team1Id);
  const resetTeam2 = resetResult.league.teams.find((t) => t.id === team2Id);
  assert.strictEqual(resetTeam1?.isClaimed, true, 'Team 1 claim should still be preserved');
  assert.strictEqual(resetTeam1?.claimedBy, 'Alice Cooper', 'Team 1 claimedBy should still be preserved');
  assert.strictEqual(resetTeam2?.isClaimed, true, 'Team 2 claim should still be preserved');
  assert.strictEqual(resetTeam2?.claimedBy, 'Bob Dylan', 'Team 2 claimedBy should still be preserved');

  console.log('✓ Test 1 Passed: League swipes, matches, and archives completely reset while preserving manager team claims!');

  // Test 2: Demo League (12345678) Reset
  console.log('\n[Test 2] Testing reset on mock demo league (12345678)...');
  const demoId = '12345678';
  let demoState = getServerLeagueState(demoId)!;
  assert(demoState !== null, 'Demo state should exist');

  // Swipe in demo league
  const demoTeam1 = demoState.league.teams[0];
  const demoTeam2 = demoState.league.teams[1];
  recordServerSwipe(demoId, {
    id: 'demo_user_swipe_1',
    teamId: demoTeam1.id,
    tradeType: '1-for-1',
    offeredPlayerIds: [demoTeam1.roster[0].id],
    targetPlayerIds: [demoTeam2.roster[0].id],
    targetTeamId: demoTeam2.id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  });

  const resetDemo = resetServerLeagueSwipes(demoId);
  assert(resetDemo !== null, 'Reset demo state should succeed');
  assert.strictEqual(resetDemo.matches.length, 0, 'Demo matches should be empty after reset');
  assert.strictEqual(resetDemo.deletedMatches?.length, 0, 'Demo deletedMatches should be empty after reset');
  assert(resetDemo.swipes.length > 0, 'Demo seed opponent swipes should be re-seeded for demo sandbox');
  // Check that demo user swipe is gone
  assert(!resetDemo.swipes.some((s) => s.id === 'demo_user_swipe_1'), 'Demo user swipe should be gone');
  console.log('✓ Test 2 Passed: Demo league reset re-seeds seed opponent swipes and wipes matches.');

  // Test 3: API Route POST /api/league with action: reset_swipes
  console.log('\n[Test 3] Testing POST /api/league endpoint with action: "reset_swipes"...');
  const req1 = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_swipes',
      leagueId: testLeagueId,
      teamId: team1Id,
    }),
  });
  const res1 = await POST(req1);
  assert.strictEqual(res1.status, 200, 'POST /api/league reset_swipes should return 200');
  const body1 = await res1.json();
  assert.strictEqual(body1.success, true, 'success flag should be true');
  assert.strictEqual(body1.mySwipes.length, 0, 'mySwipes should be empty');
  assert.strictEqual(body1.matches.length, 0, 'matches should be empty');
  assert.strictEqual(body1.deletedMatches.length, 0, 'deletedMatches should be empty');
  assert.strictEqual(body1.league.espnLeagueId, testLeagueId, 'league should match');
  console.log('✓ Test 3 Passed: API route action "reset_swipes" returns clean ClientLeagueView with 200 OK.');

  // Test 4: API Route POST /api/league with action: reset_league_swipes alias
  console.log('\n[Test 4] Testing POST /api/league endpoint with action: "reset_league_swipes"...');
  const req2 = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_league_swipes',
      leagueId: testLeagueId,
      teamId: team1Id,
    }),
  });
  const res2 = await POST(req2);
  assert.strictEqual(res2.status, 200, 'POST /api/league reset_league_swipes should return 200');
  const body2 = await res2.json();
  assert.strictEqual(body2.success, true);
  console.log('✓ Test 4 Passed: API route action "reset_league_swipes" works identically.');

  // Test 5: API validation error paths
  console.log('\n[Test 5] Testing error handling paths...');
  const reqInvalidId = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_swipes',
      leagueId: 'invalid/traversal/id!!',
    }),
  });
  const resInvalidId = await POST(reqInvalidId);
  assert.strictEqual(resInvalidId.status, 400, 'Invalid leagueId format should return 400');

  const reqMissingId = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_swipes',
    }),
  });
  const resMissingId = await POST(reqMissingId);
  assert.strictEqual(resMissingId.status, 400, 'Missing leagueId should return 400');

  const reqNonExistent = new NextRequest('http://localhost:3000/api/league', {
    method: 'POST',
    body: JSON.stringify({
      action: 'reset_swipes',
      leagueId: 'nonexistent999',
    }),
  });
  const resNonExistent = await POST(reqNonExistent);
  assert.strictEqual(resNonExistent.status, 404, 'Non-existent league should return 404');
  console.log('✓ Test 5 Passed: Error handling and input sanitization verified.');

  // Test 6: New Swiping & Matching Cycle After Reset
  console.log('\n[Test 6] Testing new swipe and match cycle on the reset deck...');
  const postResetSwipe1 = recordServerSwipe(testLeagueId, {
    id: 'post_reset_swipe_1',
    teamId: team1Id,
    tradeType: '1-for-1',
    offeredPlayerIds: [p1.id],
    targetPlayerIds: [p2.id],
    targetTeamId: team2Id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  });
  assert(postResetSwipe1 !== null);
  assert.strictEqual(postResetSwipe1.state.swipes.length, 1, 'Fresh swipe should be recorded');
  assert.strictEqual(postResetSwipe1.matchFound, null, 'No match before reciprocation');

  const postResetSwipe2 = recordServerSwipe(testLeagueId, {
    id: 'post_reset_swipe_2',
    teamId: team2Id,
    tradeType: '1-for-1',
    offeredPlayerIds: [p2.id],
    targetPlayerIds: [p1.id],
    targetTeamId: team1Id,
    isInterested: true,
    createdAt: new Date().toISOString(),
  });
  assert(postResetSwipe2 !== null);
  assert.strictEqual(postResetSwipe2.state.swipes.length, 2, 'Both reciprocal swipes recorded');
  assert(postResetSwipe2.matchFound !== null, 'Match should trigger cleanly on freshly reset league');
  assert.strictEqual(postResetSwipe2.state.matches.length, 1, '1 active match created');
  console.log('✓ Test 6 Passed: New swipes and mutual matches work flawlessly after league reset.');

  console.log('\n=============================================');
  console.log('ALL RESET SWIPES VERIFICATION TESTS PASSED! 🎉');
  console.log('=============================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
