import assert from 'assert';
import {
  computeIncomingLikes,
  checkForMutualMatch,
  getReciprocalTradeType,
} from '../src/lib/matchmaking';
import { createMockLeague } from '../src/lib/espn';
import { Swipe, Match, Team, Player, TradeType, IncomingLike } from '../src/types/fantasy';
import { toClientLeagueView } from '../src/lib/serverLeagueStore';

console.log('========================================================');
console.log('--- Starting Incoming Likes ("View Your Likes") Test Suite ---');
console.log('========================================================\n');

const league = createMockLeague();
const team1 = league.teams[0]; // The Touchdown Savants (user team)
const team2 = league.teams[1]; // Gotham City Rogues / Gridiron Gladiators
const team3 = league.teams[2]; // Metropolis Meteors / Endzone Dynasty

// ---------------------------------------------------------------------------
// Test 1: computeIncomingLikes returns unreciprocated incoming like
// ---------------------------------------------------------------------------
console.log('[Test 1] computeIncomingLikes returns unreciprocated incoming like with correct reciprocal trade type...');

const pUser = team1.roster[0]; // Justin Jefferson
const pOpp = team2.roster[0]; // CeeDee Lamb

const incomingSwipe1: Swipe = {
  id: 'sw_like_1',
  teamId: team2.id,
  targetTeamId: team1.id,
  tradeType: '1-for-1',
  offeredPlayerIds: [pOpp.id],
  targetPlayerIds: [pUser.id],
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const likes1 = computeIncomingLikes([incomingSwipe1], team1.id, [], league);
assert.strictEqual(likes1.length, 1, 'Should have exactly 1 incoming like');
assert.strictEqual(likes1[0].id, incomingSwipe1.id, 'Like ID must match swipe ID');
assert.strictEqual(likes1[0].opponentTeamId, team2.id, 'Opponent team ID must match');
assert.strictEqual(likes1[0].opponentTeamName, team2.name, 'Opponent team name must match');
assert.strictEqual(likes1[0].tradeType, '1-for-1', 'Reciprocal trade type should be 1-for-1');
assert.deepStrictEqual(likes1[0].offeredPlayerIds, [pUser.id], 'Offered player IDs (user sends) must match target of incoming swipe');
assert.deepStrictEqual(likes1[0].targetPlayerIds, [pOpp.id], 'Target player IDs (user gets) must match offered of incoming swipe');
assert.strictEqual(likes1[0].offeredPlayers[0].id, pUser.id, 'Offered player object must match');
assert.strictEqual(likes1[0].targetPlayers[0].id, pOpp.id, 'Target player object must match');
console.log('✓ Test 1 Passed: Unreciprocated incoming like mapped accurately.\n');

// ---------------------------------------------------------------------------
// Test 2: Multi-player trade type reciprocity (2-for-1 -> 1-for-2, 3-for-1 -> 1-for-3)
// ---------------------------------------------------------------------------
console.log('[Test 2] Multi-player trade type reciprocity (opponent sends 2-for-1, user receives as 1-for-2)...');

const pOpp2 = team2.roster[1];
const incomingSwipe2: Swipe = {
  id: 'sw_like_2',
  teamId: team2.id,
  targetTeamId: team1.id,
  tradeType: '2-for-1', // Team 2 sends 2 players (pOpp, pOpp2) for 1 player (pUser)
  offeredPlayerIds: [pOpp.id, pOpp2.id],
  targetPlayerIds: [pUser.id],
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const likes2 = computeIncomingLikes([incomingSwipe2], team1.id, [], league);
assert.strictEqual(likes2.length, 1);
assert.strictEqual(likes2[0].tradeType, '1-for-2', 'User perspective trade type must be 1-for-2');
assert.strictEqual(likes2[0].opponentTradeType, '2-for-1', 'Opponent trade type must be 2-for-1');
assert.strictEqual(likes2[0].offeredPlayers.length, 1, 'User offers 1 player');
assert.strictEqual(likes2[0].targetPlayers.length, 2, 'User receives 2 players');
console.log('✓ Test 2 Passed: Multi-player trade type reciprocity verified.\n');

// ---------------------------------------------------------------------------
// Test 3: Swiping Yes (Want) on an incoming like creates an immediate mutual match
// ---------------------------------------------------------------------------
console.log('[Test 3] Swiping Yes (Want) on an incoming like creates an immediate mutual match...');

const likeToAccept = likes1[0];

// User responds with a Yes swipe using the like details
const userAcceptSwipe: Swipe = {
  id: 'sw_user_accept',
  teamId: team1.id,
  targetTeamId: likeToAccept.opponentTeamId,
  tradeType: likeToAccept.tradeType,
  offeredPlayerIds: likeToAccept.offeredPlayerIds,
  targetPlayerIds: likeToAccept.targetPlayerIds,
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const allSwipesWithAccept = [incomingSwipe1, userAcceptSwipe];
const mutualMatch = checkForMutualMatch(userAcceptSwipe, allSwipesWithAccept, league);

assert.ok(mutualMatch, 'Mutual match MUST be created when user swipes Yes on an incoming like');
assert.ok(
  (mutualMatch.teamAId === team2.id && mutualMatch.teamBId === team1.id) ||
  (mutualMatch.teamAId === team1.id && mutualMatch.teamBId === team2.id),
  'Mutual match team IDs must match team1 and team2'
);
console.log('✓ Test 3 Passed: Immediate mutual match detected upon swiping Yes.\n');

// ---------------------------------------------------------------------------
// Test 4: Confirmed match removes like from computeIncomingLikes
// ---------------------------------------------------------------------------
console.log('[Test 4] Confirmed match removes like from computeIncomingLikes...');

const likesAfterMatch = computeIncomingLikes([incomingSwipe1, userAcceptSwipe], team1.id, [mutualMatch], league);
assert.strictEqual(likesAfterMatch.length, 0, 'Incoming like should be removed once matched');
console.log('✓ Test 4 Passed: Confirmed match eliminates like from pending list.\n');

// ---------------------------------------------------------------------------
// Test 5: Swiping Pass (isInterested: false) removes like from computeIncomingLikes
// ---------------------------------------------------------------------------
console.log('[Test 5] Swiping Pass (isInterested: false) removes like from computeIncomingLikes...');

const userPassSwipe: Swipe = {
  id: 'sw_user_pass',
  teamId: team1.id,
  targetTeamId: likeToAccept.opponentTeamId,
  tradeType: likeToAccept.tradeType,
  offeredPlayerIds: likeToAccept.offeredPlayerIds,
  targetPlayerIds: likeToAccept.targetPlayerIds,
  isInterested: false,
  createdAt: new Date().toISOString(),
};

const likesAfterPass = computeIncomingLikes([incomingSwipe1, userPassSwipe], team1.id, [], league);
assert.strictEqual(likesAfterPass.length, 0, 'Incoming like should be removed when user passes on it');
console.log('✓ Test 5 Passed: Swiping pass removes like from pending list.\n');

// ---------------------------------------------------------------------------
// Test 6: Opponent Pass (isInterested: false) is never returned as an incoming like
// ---------------------------------------------------------------------------
console.log('[Test 6] Opponent Pass (isInterested: false) is never returned as an incoming like...');

const opponentPassSwipe: Swipe = {
  id: 'sw_opp_pass',
  teamId: team2.id,
  targetTeamId: team1.id,
  tradeType: '1-for-1',
  offeredPlayerIds: [pOpp.id],
  targetPlayerIds: [pUser.id],
  isInterested: false, // Opponent passed
  createdAt: new Date().toISOString(),
};

const likesOppPass = computeIncomingLikes([opponentPassSwipe], team1.id, [], league);
assert.strictEqual(likesOppPass.length, 0, 'Opponent passes must never appear as incoming likes');
console.log('✓ Test 6 Passed: Opponent passes ignored.\n');

// ---------------------------------------------------------------------------
// Test 7: Swipes targeting another team are ignored
// ---------------------------------------------------------------------------
console.log('[Test 7] Swipes targeting another team are ignored...');

const otherTeamSwipe: Swipe = {
  id: 'sw_other_team',
  teamId: team2.id,
  targetTeamId: team3.id, // Targets team 3, not team 1
  tradeType: '1-for-1',
  offeredPlayerIds: [pOpp.id],
  targetPlayerIds: [team3.roster[0].id],
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const likesOtherTeam = computeIncomingLikes([otherTeamSwipe], team1.id, [], league);
assert.strictEqual(likesOtherTeam.length, 0, 'Swipes targeting third-party teams must not appear');
console.log('✓ Test 7 Passed: Third-party swipes excluded.\n');

// ---------------------------------------------------------------------------
// Test 8: toClientLeagueView wire integration
// ---------------------------------------------------------------------------
console.log('[Test 8] toClientLeagueView wire integration includes incomingLikes...');

const serverState = {
  espnLeagueId: league.espnLeagueId,
  league,
  swipes: [incomingSwipe1],
  matches: [],
  deletedMatches: [],
  lastResetAt: Date.now(),
};

const clientView = toClientLeagueView(serverState, team1.id);
assert.ok(clientView.incomingLikes, 'ClientLeagueView must include incomingLikes array');
assert.strictEqual(clientView.incomingLikes.length, 1);
assert.strictEqual(clientView.incomingLikes[0].opponentTeamId, team2.id);
console.log('✓ Test 8 Passed: toClientLeagueView wire integration verified.\n');

console.log('========================================================');
console.log('ALL INCOMING LIKES ("VIEW YOUR LIKES") TESTS PASSED! 🎉');
console.log('========================================================\n');
