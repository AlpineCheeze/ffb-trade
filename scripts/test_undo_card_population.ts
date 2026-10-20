import assert from 'assert';
import { generateDeckItems, generateSwipeKey, arraysEqualIgnoreOrder } from '../src/lib/matchmaking';
import { undoServerSwipe, recordServerSwipe, getServerLeagueState } from '../src/lib/serverLeagueStore';
import { createMockLeague } from '../src/lib/espn';
import { Swipe, TradeType } from '../src/types/fantasy';

console.log('========================================================');
console.log('--- Starting Swipe Undo Card Population Test Suite ---');
console.log('========================================================\n');

// Set up clean demo league fixture
const baseLeague = createMockLeague();
const userTeam = baseLeague.teams[0]; // team_1 (Touchdown Savants)
const offeredPlayer = userTeam.roster[0]; // Justin Jefferson (p_jj)
const tradeType: TradeType = '1-for-1';
const seed = 'test_undo_card_population_seed';

// [Test 1] Verify initial deck generation populates cards with full player & owner details
console.log('[Test 1] Initial deck item structure and player details population...');
const initialDeck = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  swipes: [],
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});

assert(initialDeck.length > 0, 'Initial deck must contain items');
const firstCard = initialDeck[0];
assert(firstCard.id, 'Card must have a valid id');
assert(firstCard.players.length === 1, 'Card must have exactly 1 target player');
const targetPlayer = firstCard.players[0];
assert(targetPlayer.id, 'Player must have id');
assert(targetPlayer.fullName, 'Player must have fullName');
assert(targetPlayer.position, 'Player must have position');
assert(targetPlayer.headshotUrl, 'Player must have headshotUrl');
assert(firstCard.ownerTeam, 'Card must have ownerTeam');
assert(firstCard.ownerTeam.id, 'OwnerTeam must have id');
assert(firstCard.ownerTeam.id !== userTeam.id, 'Cannot trade with own team');
console.log(`✓ Test 1 Passed: First card populated with ${targetPlayer.fullName} (${targetPlayer.position} - ${targetPlayer.nflTeam}) owned by ${firstCard.ownerTeam.name}.`);

// [Test 2] Swipe top card (Pass) and verify deck advances
console.log('\n[Test 2] Swiping top card and checking deck progression...');
const swipe1: Swipe = {
  id: 'swipe_test_1',
  teamId: userTeam.id,
  targetTeamId: firstCard.ownerTeam.id,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  targetPlayerIds: [targetPlayer.id],
  isInterested: false,
  createdAt: new Date().toISOString(),
};

const deckAfterSwipe1 = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  swipes: [swipe1],
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});

assert.strictEqual(deckAfterSwipe1.length, initialDeck.length - 1, 'Deck count must decrease by 1');
assert.notStrictEqual(deckAfterSwipe1[0].id, firstCard.id, 'Top card must no longer be the swiped card');
assert.strictEqual(deckAfterSwipe1[0].id, initialDeck[1].id, 'Next card must now be at index 0');
console.log(`✓ Test 2 Passed: Deck progressed from ${firstCard.players[0].fullName} to ${deckAfterSwipe1[0].players[0].fullName}.`);

// [Test 3] Undo Swipe 1 and verify original player card populates at index 0
console.log('\n[Test 3] Undoing swipe: verifying exact card and player population at index 0...');
// Simulate Undo: remove swipe1
const swipesAfterUndo = [swipe1].filter((s) => s.id !== swipe1.id);
const deckAfterUndo1 = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  swipes: swipesAfterUndo,
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});

assert.strictEqual(deckAfterUndo1.length, initialDeck.length, 'Deck must restore to full length');
assert.strictEqual(deckAfterUndo1[0].id, firstCard.id, 'Top card must be restored to first card');
assert.strictEqual(deckAfterUndo1[0].players[0].fullName, targetPlayer.fullName, 'Player fullName must match exactly');
assert.strictEqual(deckAfterUndo1[0].players[0].headshotUrl, targetPlayer.headshotUrl, 'Player headshotUrl must match');
assert.strictEqual(deckAfterUndo1[0].ownerTeam.id, firstCard.ownerTeam.id, 'OwnerTeam must match');
console.log(`✓ Test 3 Passed: Undone card cleanly restored to index 0 with full player data: ${deckAfterUndo1[0].players[0].fullName}.`);

// [Test 4] Swipe multiple cards, then perform undo on the last swipe
console.log('\n[Test 4] Swiping 3 cards and undoing the 3rd swipe...');
const card1 = initialDeck[0];
const card2 = initialDeck[1];
const card3 = initialDeck[2];

const multiSwipes: Swipe[] = [
  {
    id: 'swipe_m1',
    teamId: userTeam.id,
    targetTeamId: card1.ownerTeam.id,
    tradeType,
    offeredPlayerIds: [offeredPlayer.id],
    targetPlayerIds: card1.players.map((p) => p.id),
    isInterested: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'swipe_m2',
    teamId: userTeam.id,
    targetTeamId: card2.ownerTeam.id,
    tradeType,
    offeredPlayerIds: [offeredPlayer.id],
    targetPlayerIds: card2.players.map((p) => p.id),
    isInterested: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'swipe_m3',
    teamId: userTeam.id,
    targetTeamId: card3.ownerTeam.id,
    tradeType,
    offeredPlayerIds: [offeredPlayer.id],
    targetPlayerIds: card3.players.map((p) => p.id),
    isInterested: false,
    createdAt: new Date().toISOString(),
  },
];

const deckAfter3Swipes = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  swipes: multiSwipes,
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});
assert.strictEqual(deckAfter3Swipes[0].id, initialDeck[3].id, '4th card must now be at index 0');

// Undo 3rd swipe
const lastSwipe = multiSwipes[multiSwipes.length - 1];
const multiSwipesAfterUndo = multiSwipes.filter((s) => s.id !== lastSwipe.id);
const deckAfterUndoing3rd = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  swipes: multiSwipesAfterUndo,
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});

assert.strictEqual(deckAfterUndoing3rd[0].id, card3.id, 'Card 3 must populate back at index 0');
assert.strictEqual(deckAfterUndoing3rd[1].id, initialDeck[3].id, 'Card 4 must remain at index 1');
assert.strictEqual(deckAfterUndoing3rd[0].players[0].fullName, card3.players[0].fullName);
console.log(`✓ Test 4 Passed: 3rd swipe undone cleanly, restoring ${deckAfterUndoing3rd[0].players[0].fullName} to front of deck.`);

// [Test 5] Undoing the final card in a cleared deck populates the card
console.log('\n[Test 5] Undoing when the deck was completely cleared (0 cards remaining)...');
// Create swipes for all cards in initialDeck
const allSwipes: Swipe[] = initialDeck.map((item, idx) => ({
  id: `all_swipe_${idx}`,
  teamId: userTeam.id,
  targetTeamId: item.ownerTeam.id,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  targetPlayerIds: item.players.map((p) => p.id),
  isInterested: false,
  createdAt: new Date().toISOString(),
}));

const clearedDeck = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  swipes: allSwipes,
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});
assert.strictEqual(clearedDeck.length, 0, 'Deck must be empty (cleared)');

// Undo the final swipe
const finalSwipe = allSwipes[allSwipes.length - 1];
const swipesAfterUndoingCleared = allSwipes.filter((s) => s.id !== finalSwipe.id);
const restoredFromCleared = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  swipes: swipesAfterUndoingCleared,
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});

assert.strictEqual(restoredFromCleared.length, 1, 'Restored deck must have 1 card');
assert.strictEqual(
  restoredFromCleared[0].id,
  initialDeck[initialDeck.length - 1].id,
  'Restored card must match the final swiped card'
);
assert(restoredFromCleared[0].players[0].fullName, 'Player data must be fully populated');
console.log(`✓ Test 5 Passed: Undoing from cleared deck state populates ${restoredFromCleared[0].players[0].fullName}.`);

// [Test 6] Multi-Player Package Undo (2-for-2)
console.log('\n[Test 6] Multi-player package (2-for-2) undo card population...');
const offered2 = [userTeam.roster[0].id, userTeam.roster[1].id];
const deck2for2 = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType: '2-for-2',
  offeredPlayerIds: offered2,
  swipes: [],
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});
assert(deck2for2.length > 0, '2-for-2 deck must have items');
const first2for2 = deck2for2[0];
assert.strictEqual(first2for2.players.length, 2, 'Must have 2 target players');

const swipe2for2: Swipe = {
  id: 'swipe_2for2',
  teamId: userTeam.id,
  targetTeamId: first2for2.ownerTeam.id,
  tradeType: '2-for-2',
  offeredPlayerIds: offered2,
  targetPlayerIds: first2for2.players.map((p) => p.id),
  isInterested: true,
  createdAt: new Date().toISOString(),
};

const afterSwipe2for2 = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType: '2-for-2',
  offeredPlayerIds: offered2,
  swipes: [swipe2for2],
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});
assert.notStrictEqual(afterSwipe2for2[0].id, first2for2.id);

// Undo 2-for-2 swipe
const afterUndo2for2 = generateDeckItems({
  league: baseLeague,
  userTeam,
  tradeType: '2-for-2',
  offeredPlayerIds: offered2,
  swipes: [],
  matches: [],
  selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  seed,
});
assert.strictEqual(afterUndo2for2[0].id, first2for2.id, '2-for-2 package must restore to index 0');
assert.strictEqual(afterUndo2for2[0].players.length, 2, 'Must populate both players');
console.log(`✓ Test 6 Passed: 2-for-2 package restored with ${afterUndo2for2[0].players.map((p) => p.fullName).join(' & ')}.`);

// [Test 7] Server undoServerSwipe integration
console.log('\n[Test 7] Server undoServerSwipe and match revert verification...');
const testLeagueId = '12345678';
const serverStateBefore = getServerLeagueState(testLeagueId);
assert(serverStateBefore !== null);

const swipeToServer: Swipe = {
  id: `swipe_srv_${Date.now()}`,
  teamId: userTeam.id,
  targetTeamId: firstCard.ownerTeam.id,
  tradeType,
  offeredPlayerIds: [offeredPlayer.id],
  targetPlayerIds: [targetPlayer.id],
  isInterested: false,
  createdAt: new Date().toISOString(),
};

recordServerSwipe(testLeagueId, swipeToServer, baseLeague);
const serverStateAfterSwipe = getServerLeagueState(testLeagueId)!;
assert(serverStateAfterSwipe.swipes.some((s) => s.id === swipeToServer.id), 'Server must record swipe');

const undoResult = undoServerSwipe(testLeagueId, userTeam.id, tradeType, [offeredPlayer.id]);
assert(undoResult !== null);
assert(!undoResult.swipes.some((s) => s.id === swipeToServer.id), 'Server must remove undone swipe');
console.log('✓ Test 7 Passed: Server undoServerSwipe removes swipe from server state.');

console.log('\n========================================================');
console.log('ALL SWIPE UNDO CARD POPULATION TESTS PASSED! 🎉');
console.log('========================================================\n');

export const testPromise = Promise.resolve();

