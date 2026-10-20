import assert from 'assert';
import {
  computeIncomingActivityHints,
  generateDeckItems,
  getReciprocalTradeType,
} from '../src/lib/matchmaking';
import { createMockLeague } from '../src/lib/espn';
import { Swipe, Match, Team, Player, TradeType, InterestedTeamDetail } from '../src/types/fantasy';
import { toClientLeagueView } from '../src/lib/serverLeagueStore';

console.log('========================================================');
console.log('--- Starting Roster Interested Teams Test Suite ---');
console.log('========================================================\n');

const league = createMockLeague();
const team1 = league.teams[0]; // The Touchdown Savants
const team2 = league.teams[1]; // Gotham City Rogues
const team3 = league.teams[2]; // Metropolis Meteors

// ---------------------------------------------------------------------------
// Test 1: computeIncomingActivityHints returns playerInterestedTeams with team details
// ---------------------------------------------------------------------------
console.log('[Test 1] computeIncomingActivityHints returns playerInterestedTeams with team details...');

const p1 = team1.roster[0]; // Justin Jefferson
const swipe1: Swipe = {
  id: 'sw_test_1',
  teamId: team2.id,
  targetTeamId: team1.id,
  tradeType: '1-for-1',
  offeredPlayerIds: [team2.roster[0].id],
  targetPlayerIds: [p1.id],
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const hints1 = computeIncomingActivityHints([swipe1], team1.id, [], league.teams);
assert.ok(hints1.playerInterestedTeams, 'playerInterestedTeams must be defined');
assert.ok(hints1.playerInterestedTeams[p1.id], `playerInterestedTeams must have an entry for ${p1.id}`);
assert.strictEqual(hints1.playerInterestedTeams[p1.id].length, 1, 'Should have 1 interested team');

const interestedTeam = hints1.playerInterestedTeams[p1.id][0];
assert.strictEqual(interestedTeam.teamId, team2.id, 'Team ID must match');
assert.strictEqual(interestedTeam.teamName, team2.name, 'Team name must match');
assert.strictEqual(interestedTeam.ownerName, team2.claimedBy || team2.ownerName, 'Owner name must match');
assert.deepStrictEqual(interestedTeam.tradeTypes, ['1-for-1'], 'Trade types must reflect reciprocal structure');
console.log('✓ Test 1 Passed: Single interested team details accurately populated.\n');

// ---------------------------------------------------------------------------
// Test 2: Multiple opponents interested in the same player
// ---------------------------------------------------------------------------
console.log('[Test 2] Multiple opponents interested in the same player...');

const swipe2: Swipe = {
  id: 'sw_test_2',
  teamId: team3.id,
  targetTeamId: team1.id,
  tradeType: '2-for-1', // opponent offers 2, wants 1 -> user perspective is 1-for-2
  offeredPlayerIds: [team3.roster[0].id, team3.roster[1].id],
  targetPlayerIds: [p1.id],
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const hints2 = computeIncomingActivityHints([swipe1, swipe2], team1.id, [], league.teams);
assert.strictEqual(hints2.playerInterestedTeams?.[p1.id]?.length, 2, 'Should have 2 interested teams');
const teamIds = hints2.playerInterestedTeams![p1.id].map((t) => t.teamId);
assert.ok(teamIds.includes(team2.id), 'Must include team 2');
assert.ok(teamIds.includes(team3.id), 'Must include team 3');

const team3Detail = hints2.playerInterestedTeams![p1.id].find((t) => t.teamId === team3.id)!;
assert.deepStrictEqual(team3Detail.tradeTypes, ['1-for-2'], 'Reciprocal trade type for 2-for-1 must be 1-for-2');
console.log('✓ Test 2 Passed: Multiple teams interested in same player correctly captured.\n');

// ---------------------------------------------------------------------------
// Test 3: Deduplication and merged tradeTypes when an opponent has multiple swipes
// ---------------------------------------------------------------------------
console.log('[Test 3] Deduplication and merged tradeTypes for same team with multiple offers...');

const swipe1b: Swipe = {
  id: 'sw_test_1b',
  teamId: team2.id,
  targetTeamId: team1.id,
  tradeType: '1-for-2', // reciprocal is 2-for-1
  offeredPlayerIds: [team2.roster[1].id],
  targetPlayerIds: [p1.id, team1.roster[1].id],
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const hints3 = computeIncomingActivityHints([swipe1, swipe1b], team1.id, [], league.teams);
assert.strictEqual(hints3.playerInterestedTeams?.[p1.id]?.length, 1, 'Should deduplicate team2 into 1 entry');
const team2Merged = hints3.playerInterestedTeams![p1.id][0];
assert.ok(team2Merged.tradeTypes?.includes('1-for-1'), 'Must include 1-for-1');
assert.ok(team2Merged.tradeTypes?.includes('2-for-1'), 'Must include reciprocal 2-for-1');
console.log('✓ Test 3 Passed: Same team with multiple offers merged cleanly.\n');

// ---------------------------------------------------------------------------
// Test 4: Opponent passes (isInterested: false) are excluded
// ---------------------------------------------------------------------------
console.log('[Test 4] Opponent passes (isInterested: false) are excluded...');

const swipePass: Swipe = {
  id: 'sw_test_pass',
  teamId: team2.id,
  targetTeamId: team1.id,
  tradeType: '1-for-1',
  offeredPlayerIds: [team2.roster[0].id],
  targetPlayerIds: [p1.id],
  isInterested: false,
  createdAt: new Date().toISOString(),
};

const hints4 = computeIncomingActivityHints([swipePass], team1.id, [], league.teams);
assert.strictEqual(hints4.playerInterestedTeams?.[p1.id]?.length || 0, 0, 'Pass must not register as interested');
console.log('✓ Test 4 Passed: Passes are strictly excluded.\n');

// ---------------------------------------------------------------------------
// Test 5: Swipes that user has already responded to are excluded
// ---------------------------------------------------------------------------
console.log('[Test 5] Responded swipes are excluded...');

const userResponseSwipe: Swipe = {
  id: 'sw_user_resp',
  teamId: team1.id,
  targetTeamId: team2.id,
  tradeType: '1-for-1',
  offeredPlayerIds: [p1.id],
  targetPlayerIds: [team2.roster[0].id],
  isInterested: false, // user swiped Pass
  createdAt: new Date().toISOString(),
};

const hints5 = computeIncomingActivityHints([swipe1, userResponseSwipe], team1.id, [], league.teams);
assert.strictEqual(hints5.playerInterestedTeams?.[p1.id]?.length || 0, 0, 'Responded swipe must be excluded');
console.log('✓ Test 5 Passed: Responded incoming swipes are excluded.\n');

// ---------------------------------------------------------------------------
// Test 6: Swipes that are already matched in matches are excluded
// ---------------------------------------------------------------------------
console.log('[Test 6] Already matched trades in matches are excluded...');

const activeMatch: Match = {
  id: 'match_active_1',
  teamAId: team1.id,
  teamBId: team2.id,
  tradeType: '1-for-1',
  teamAPlayers: [p1],
  teamBPlayers: [team2.roster[0]],
  createdAt: new Date().toISOString(),
};

const hints6 = computeIncomingActivityHints([swipe1], team1.id, [activeMatch], league.teams);
assert.strictEqual(hints6.playerInterestedTeams?.[p1.id]?.length || 0, 0, 'Already matched trade must be excluded');
console.log('✓ Test 6 Passed: Active matches are excluded from interested teams.\n');

// ---------------------------------------------------------------------------
// Test 7: toClientLeagueView integrates playerInterestedTeams
// ---------------------------------------------------------------------------
console.log('[Test 7] toClientLeagueView returns enriched playerInterestedTeams...');

const serverState = {
  league,
  swipes: [swipe1, swipe2],
  matches: [],
  deletedMatches: [],
  lastResetAt: 0,
};

const clientView = toClientLeagueView(serverState as any, team1.id);
assert.ok(clientView.incomingActivityHints?.playerInterestedTeams, 'clientView must include playerInterestedTeams');
assert.strictEqual(clientView.incomingActivityHints!.playerInterestedTeams![p1.id].length, 2);
console.log('✓ Test 7 Passed: toClientLeagueView wire contract verified.\n');

// ---------------------------------------------------------------------------
// Test 8: Mock demo league seed swipes show interested teams on Justin Jefferson and Saquon Barkley
// ---------------------------------------------------------------------------
console.log('[Test 8] Mock demo league seed swipes show interested teams on Jefferson and Barkley...');

import { createSeedOpponentSwipes } from '../src/lib/matchmaking';
const seedSwipes = createSeedOpponentSwipes(league);
const demoHints = computeIncomingActivityHints(seedSwipes, team1.id, [], league.teams);

const jj = team1.roster.find((p) => p.id === 'p_jj')!;
const saquon = team1.roster.find((p) => p.id === 'p_saquon')!;

assert.ok(demoHints.playerInterestedTeams?.[jj.id], 'Justin Jefferson must have interested teams in demo league');
assert.ok(demoHints.playerInterestedTeams?.[saquon.id], 'Saquon Barkley must have interested teams in demo league');

const jjTeams = demoHints.playerInterestedTeams![jj.id].map((t) => t.teamName);
const saquonTeams = demoHints.playerInterestedTeams![saquon.id].map((t) => t.teamName);

assert.ok(jjTeams.includes('Gridiron Gladiators'), 'Gridiron Gladiators must be interested in Justin Jefferson');
assert.ok(jjTeams.includes('Endzone Dynasty'), 'Endzone Dynasty must be interested in Justin Jefferson');
assert.ok(saquonTeams.includes('Gridiron Gladiators'), 'Gridiron Gladiators must be interested in Saquon Barkley');
assert.ok(saquonTeams.includes('Endzone Dynasty'), 'Endzone Dynasty must be interested in Saquon Barkley');

console.log(`  -> Justin Jefferson interested teams: ${jjTeams.join(', ')}`);
console.log(`  -> Saquon Barkley interested teams: ${saquonTeams.join(', ')}`);
console.log('✓ Test 8 Passed: Demo league seed swipes correctly link to Jefferson and Barkley.\n');

console.log('========================================================');
console.log('ALL ROSTER INTERESTED TEAMS TESTS PASSED! 🎉');
console.log('========================================================\n');

export const testPromise = Promise.resolve();
