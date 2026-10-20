import assert from 'assert';
import { createMockLeague } from '@/lib/espn';
import {
  generateDeckItems,
  computePriorityTargetKeys,
  getReciprocalTradeType,
  VALID_TRADE_TYPES,
} from '@/lib/matchmaking';
import { Swipe, TradeType } from '@/types/fantasy';

export async function runPotentialMatchDeckPriorityTests() {
  console.log('========================================================');
  console.log('--- Starting Potential Match Deck Priority Test Suite ---');
  console.log('========================================================\n');

  const league = createMockLeague();
  const userTeam = league.teams[0];   // team_1
  const oppTeamB = league.teams[1];   // team_2
  const oppTeamC = league.teams[2];   // team_3

  // Helper to get player IDs
  const uP = (idx: number) => userTeam.roster[idx].id;
  const bP = (idx: number) => oppTeamB.roster[idx].id;
  const cP = (idx: number) => oppTeamC.roster[idx].id;

  // -------------------------------------------------------------------------
  // Test 1: Single potential match in 1-for-1 placed at index 0
  // -------------------------------------------------------------------------
  console.log('[Test 1] 1-for-1 potential match placed at index 0...');
  {
    const oppSwipe: Swipe = {
      id: 'sw_1for1_opp',
      teamId: oppTeamB.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [bP(0)],
      targetPlayerIds: [uP(0)],
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const priorityKeys = computePriorityTargetKeys([oppSwipe], userTeam.id);
    const deck = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      swipes: [oppSwipe],
      priorityTargetKeys: priorityKeys,
      seed: 'test_seed_1for1',
    });

    assert.ok(deck.length > 1, 'Deck should contain multiple candidate cards');
    assert.strictEqual(deck[0].ownerTeam.id, oppTeamB.id, 'Index 0 owner must be opponent B');
    assert.strictEqual(deck[0].players[0].id, bP(0), 'Index 0 player must be opponent player');
    console.log('✓ Test 1 Passed: 1-for-1 potential match is at index 0.');
  }

  // -------------------------------------------------------------------------
  // Test 2: Verification across all 9 trade structures
  // -------------------------------------------------------------------------
  console.log('[Test 2] Verification across all 9 TradeTypes...');
  for (const userTradeType of VALID_TRADE_TYPES) {
    const oppTradeType = getReciprocalTradeType(userTradeType);
    const [userSendCountStr, userGetCountStr] = userTradeType.split('-for-');
    const userSendCount = parseInt(userSendCountStr, 10);
    const userGetCount = parseInt(userGetCountStr, 10);

    const userOffered = [uP(0), uP(1), uP(2)].slice(0, userSendCount);
    const oppOffered = [bP(0), bP(1), bP(2)].slice(0, userGetCount);

    const oppSwipe: Swipe = {
      id: `sw_opp_${userTradeType}`,
      teamId: oppTeamB.id,
      tradeType: oppTradeType,
      offeredPlayerIds: oppOffered,
      targetPlayerIds: userOffered,
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const priorityKeys = computePriorityTargetKeys([oppSwipe], userTeam.id);
    const deck = generateDeckItems({
      league,
      userTeam,
      tradeType: userTradeType,
      offeredPlayerIds: userOffered,
      swipes: [oppSwipe],
      priorityTargetKeys: priorityKeys,
      seed: `seed_all9_${userTradeType}`,
    });

    assert.ok(deck.length > 0, `Deck should have items for ${userTradeType}`);
    const topCard = deck[0];
    assert.strictEqual(
      topCard.ownerTeam.id,
      oppTeamB.id,
      `${userTradeType}: top card owner must be team B`
    );
    const topCardPlayerIds = topCard.players.map((p) => p.id).sort();
    const expectedPlayerIds = [...oppOffered].sort();
    assert.deepStrictEqual(
      topCardPlayerIds,
      expectedPlayerIds,
      `${userTradeType}: top card players must match opponent offered players`
    );
  }
  console.log('✓ Test 2 Passed: All 9 TradeTypes front-load potential match at index 0.');

  // -------------------------------------------------------------------------
  // Test 3: Multiple potential matches from same and multiple opponents
  // -------------------------------------------------------------------------
  console.log('[Test 3] Multiple potential matches all appear first in queue...');
  {
    // Opponent B offers 2 different players in 1-for-1 for user player uP(0)
    const oppBSwipe1: Swipe = {
      id: 'sw_mult_b1',
      teamId: oppTeamB.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [bP(0)],
      targetPlayerIds: [uP(0)],
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };
    const oppBSwipe2: Swipe = {
      id: 'sw_mult_b2',
      teamId: oppTeamB.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [bP(1)],
      targetPlayerIds: [uP(0)],
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };
    // Opponent C also offers a player for user player uP(0)
    const oppCSwipe: Swipe = {
      id: 'sw_mult_c1',
      teamId: oppTeamC.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [cP(0)],
      targetPlayerIds: [uP(0)],
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const allOppSwipes = [oppBSwipe1, oppBSwipe2, oppCSwipe];
    const priorityKeys = computePriorityTargetKeys(allOppSwipes, userTeam.id);
    assert.strictEqual(priorityKeys.length, 3, 'Should have 3 priority keys');

    const deck = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      swipes: allOppSwipes,
      priorityTargetKeys: priorityKeys,
      seed: 'seed_multiple_matches',
    });

    assert.ok(deck.length >= 3, 'Deck must contain at least 3 items');
    const first3CardPlayerIds = [
      deck[0].players[0].id,
      deck[1].players[0].id,
      deck[2].players[0].id,
    ];
    const expectedPrioIds = [bP(0), bP(1), cP(0)];

    // All 3 priority players must be at index 0, 1, 2
    for (const pid of expectedPrioIds) {
      assert.ok(
        first3CardPlayerIds.includes(pid),
        `Priority player ${pid} must be among top 3 cards in deck`
      );
    }

    // Card at index 3 must be a regular (non-priority) card
    if (deck.length > 3) {
      assert.ok(
        !expectedPrioIds.includes(deck[3].players[0].id),
        'Card at index 3 must not be one of the priority cards'
      );
    }
    console.log('✓ Test 3 Passed: All multiple potential matches appear at indices 0, 1, 2.');
  }

  // -------------------------------------------------------------------------
  // Test 4: Exclusion of already swiped cards (Pass, Want, Matched)
  // -------------------------------------------------------------------------
  console.log('[Test 4] Excluded cards (user swiped Pass, Want, or already matched)...');
  {
    const oppSwipe: Swipe = {
      id: 'sw_excl_opp',
      teamId: oppTeamB.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [bP(0)],
      targetPlayerIds: [uP(0)],
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date(Date.now() - 60000).toISOString(),
    };

    // Case 4a: User swiped Pass on it
    const userPassSwipe: Swipe = {
      id: 'sw_user_pass',
      teamId: userTeam.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      targetPlayerIds: [bP(0)],
      targetTeamId: oppTeamB.id,
      isInterested: false,
      createdAt: new Date().toISOString(),
    };

    const keysAfterPass = computePriorityTargetKeys([oppSwipe, userPassSwipe], userTeam.id);
    assert.strictEqual(
      keysAfterPass.length,
      0,
      'computePriorityTargetKeys must exclude incoming swipe if user responded with Pass'
    );

    const deckAfterPass = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      swipes: [oppSwipe, userPassSwipe],
      priorityTargetKeys: keysAfterPass,
      seed: 'seed_excl_pass',
    });
    assert.ok(
      !deckAfterPass.some((card) => card.players[0].id === bP(0)),
      'Passed card must be excluded from candidate deck'
    );

    // Case 4b: User swiped Want on it (mutual match formed)
    const userWantSwipe: Swipe = {
      id: 'sw_user_want',
      teamId: userTeam.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      targetPlayerIds: [bP(0)],
      targetTeamId: oppTeamB.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const keysAfterWant = computePriorityTargetKeys([oppSwipe, userWantSwipe], userTeam.id);
    assert.strictEqual(
      keysAfterWant.length,
      0,
      'computePriorityTargetKeys must exclude incoming swipe if user responded with Want'
    );

    const deckAfterWant = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      swipes: [oppSwipe, userWantSwipe],
      priorityTargetKeys: keysAfterWant,
      seed: 'seed_excl_want',
    });
    assert.ok(
      !deckAfterWant.some((card) => card.players[0].id === bP(0)),
      'Matched/Want card must be excluded from candidate deck'
    );
    console.log('✓ Test 4 Passed: Responded and matched cards strictly excluded from deck.');
  }

  // -------------------------------------------------------------------------
  // Test 5: Opponent Pass (isInterested: false) is NOT prioritized
  // -------------------------------------------------------------------------
  console.log('[Test 5] Opponent isInterested: false (Pass) is not prioritized...');
  {
    const oppPassSwipe: Swipe = {
      id: 'sw_opp_passed',
      teamId: oppTeamB.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [bP(0)],
      targetPlayerIds: [uP(0)],
      targetTeamId: userTeam.id,
      isInterested: false,
      createdAt: new Date().toISOString(),
    };

    const keys = computePriorityTargetKeys([oppPassSwipe], userTeam.id);
    assert.strictEqual(keys.length, 0, 'Opponent pass should produce 0 priority keys');

    // Default deck without any opponent swipe
    const defaultDeck = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      swipes: [],
      seed: 'seed_pass_check',
    });

    // Deck with opponent pass swipe
    const deckWithOppPass = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(0)],
      swipes: [oppPassSwipe],
      priorityTargetKeys: keys,
      seed: 'seed_pass_check',
    });

    assert.deepStrictEqual(
      deckWithOppPass.map((d) => d.id),
      defaultDeck.map((d) => d.id),
      'Opponent pass should not alter deck ordering'
    );
    console.log('✓ Test 5 Passed: Opponent pass does not prioritize card.');
  }

  // -------------------------------------------------------------------------
  // Test 6: Offered player mismatch does not prioritize
  // -------------------------------------------------------------------------
  console.log('[Test 6] Offered player mismatch does not prioritize...');
  {
    // Opponent swiped yes wanting uP(0)
    const oppSwipe: Swipe = {
      id: 'sw_opp_wants_u0',
      teamId: oppTeamB.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [bP(0)],
      targetPlayerIds: [uP(0)],
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const keys = computePriorityTargetKeys([oppSwipe], userTeam.id);

    // User is currently offering uP(1), not uP(0)
    const deckUserOfferingU1 = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(1)],
      swipes: [oppSwipe],
      priorityTargetKeys: keys,
      seed: 'seed_mismatch_check',
    });

    const baselineDeckU1 = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [uP(1)],
      swipes: [],
      seed: 'seed_mismatch_check',
    });

    // Since uP(1) does not match what opponent wanted (uP(0)), deck ordering matches baseline
    assert.deepStrictEqual(
      deckUserOfferingU1.map((d) => d.id),
      baselineDeckU1.map((d) => d.id),
      'Deck ordering must not be prioritized when offered player does not match opponent request'
    );
    console.log('✓ Test 6 Passed: Offered player mismatch correctly ignored.');
  }

  // -------------------------------------------------------------------------
  // Test 7: Canonical player ID sorting independence (2-player & 3-player)
  // -------------------------------------------------------------------------
  console.log('[Test 7] Canonical sorting independence across offered and target player IDs...');
  {
    // User offers [uP(1), uP(0)] in reverse order in 2-for-2
    // Opponent offered [bP(1), bP(0)] in reverse order in 2-for-2
    const oppSwipe: Swipe = {
      id: 'sw_opp_2for2_rev',
      teamId: oppTeamB.id,
      tradeType: '2-for-2',
      offeredPlayerIds: [bP(1), bP(0)],
      targetPlayerIds: [uP(1), uP(0)],
      targetTeamId: userTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const keys = computePriorityTargetKeys([oppSwipe], userTeam.id);
    const deck = generateDeckItems({
      league,
      userTeam,
      tradeType: '2-for-2',
      offeredPlayerIds: [uP(0), uP(1)],
      swipes: [oppSwipe],
      priorityTargetKeys: keys,
      seed: 'seed_canonical_sort',
    });

    assert.ok(deck.length > 0, 'Deck should have items');
    assert.strictEqual(deck[0].ownerTeam.id, oppTeamB.id, 'Top card must be from team B');
    const topCardIds = deck[0].players.map((p) => p.id).sort();
    const expectedIds = [bP(0), bP(1)].sort();
    assert.deepStrictEqual(topCardIds, expectedIds, 'Top card must match opponent pair');
    console.log('✓ Test 7 Passed: Canonical sorting handles arbitrary player ID ordering.');
  }

  console.log('\n========================================================');
  console.log('ALL POTENTIAL MATCH DECK PRIORITY TESTS PASSED! 🎉');
  console.log('========================================================\n');
}

export const testPromise = runPotentialMatchDeckPriorityTests();
