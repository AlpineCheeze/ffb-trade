import assert from 'assert';
import { createMockLeague } from '../src/lib/espn';
import {
  generateDeckItems,
  shuffleDeckItems,
  generateSwipeKey,
  hashDeckSeed,
  matchesPositionFilter,
} from '../src/lib/matchmaking';
import { Swipe, Position, TradeType, League, Team } from '../src/types/fantasy';

function createFull10TeamLeague(): { league: League; userTeam: Team; opponentTeams: Team[] } {
  const baseMock = createMockLeague();
  const userTeam = baseMock.teams[0];

  const fullTeams: Team[] = [userTeam];
  for (let t = 2; t <= 10; t++) {
    const roster = [];
    for (let p = 1; p <= 15; p++) {
      roster.push({
        id: `p_t${t}_${p}`,
        espnPlayerId: `${t * 100 + p}`,
        fullName: `Player ${t}-${p}`,
        position: (p % 3 === 0 ? 'WR' : p % 3 === 1 ? 'RB' : 'TE') as Position,
        nflTeam: 'KC',
        projectedPoints: 15,
        seasonAvgPoints: 15,
        opponentDifficulty: 'normal' as const,
        nextOpponent: '@ GB',
        byeWeek: 7,
        injuryStatus: 'ACTIVE' as const,
      });
    }
    fullTeams.push({
      id: `team_${t}`,
      espnTeamId: `${t}`,
      name: `Team ${t}`,
      ownerName: `Owner ${t}`,
      roster,
    });
  }

  const league: League = {
    ...baseMock,
    id: 'league_full_10',
    teams: fullTeams,
  };

  const opponentTeams = fullTeams.filter((t) => t.id !== userTeam.id);
  return { league, userTeam, opponentTeams };
}

export const testPromise = (async function runTests() {
  console.log('\n======================================================');
  console.log('--- Starting Player Pool Randomization Test Suite ---');
  console.log('======================================================\n');

  const { league: mockLeague, userTeam: mockUserTeam, opponentTeams: mockOpponents } = {
    league: createMockLeague(),
    userTeam: createMockLeague().teams[0],
    opponentTeams: createMockLeague().teams.filter((t) => t.id !== createMockLeague().teams[0].id),
  };
  const { league: fullLeague, userTeam, opponentTeams } = createFull10TeamLeague();
  const offeredPlayer = userTeam.roster[0];
  const allPositions: Position[] = ['QB', 'RB', 'WR', 'TE', 'FLEX'];

  // Test 1: Verify MurmurHash3 uniformity and determinism
  console.log('[Test 1] Testing MurmurHash3 determinism and uniform distribution...');
  {
    const h1 = hashDeckSeed('seed_alpha::item_1');
    const h2 = hashDeckSeed('seed_alpha::item_1');
    const h3 = hashDeckSeed('seed_beta::item_1');
    const h4 = hashDeckSeed('seed_alpha::item_2');

    assert.strictEqual(h1, h2, 'MurmurHash3 must be deterministic for identical inputs');
    assert.notStrictEqual(h1, h3, 'Different seeds must produce different hashes');
    assert.notStrictEqual(h1, h4, 'Different item IDs must produce different hashes');
    assert(h1 >= 0 && h1 <= 0xffffffff, 'Hash must be a valid unsigned 32-bit integer');
    console.log('✓ Test 1 Passed: MurmurHash3 is deterministic and properly seeded.');
  }

  // Test 2: Randomization across teams (players from different teams are thoroughly mixed)
  console.log('\n[Test 2] Testing candidate player pool team randomization (1-for-1)...');
  {
    // Part A: Testing on default mock demo league (8 opponent players across 2 teams)
    const mockDeck = generateDeckItems({
      league: mockLeague,
      userTeam: mockUserTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [mockUserTeam.roster[0].id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: mockOpponents,
      seed: 'test_session_seed_mock',
    });

    const totalMockOpponentPlayers = mockOpponents.reduce((sum, t) => sum + t.roster.length, 0);
    assert.strictEqual(mockDeck.length, totalMockOpponentPlayers, 'Mock deck must include all opponent players');

    let mockTransitions = 0;
    for (let i = 1; i < mockDeck.length; i++) {
      if (mockDeck[i].ownerTeam.id !== mockDeck[i - 1].ownerTeam.id) {
        mockTransitions++;
      }
    }
    const teamSequence = mockDeck.map((i) => i.ownerTeam.id);
    console.log(`   Mock League - Total cards: ${mockDeck.length}, Team sequence: ${teamSequence.join(', ')}`);
    // In old code: strictly ['team_2', 'team_2', 'team_2', 'team_2', 'team_3', 'team_3', 'team_3', 'team_3']
    const isOldSequential = mockDeck.every((item, idx) => item.ownerTeam.id === (idx < 4 ? 'team_2' : 'team_3'));
    assert(!isOldSequential, 'Mock deck must not be strictly grouped sequentially by team');

    // Part B: Testing on a full 10-team fantasy league (9 opponent teams * 15 players = 135 players)
    const fullDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: 'test_session_seed_full',
    });

    assert.strictEqual(fullDeck.length, 135, 'Full league deck must contain all 135 opponent players');

    let fullTransitions = 0;
    let fullMaxStreak = 1;
    let fullCurStreak = 1;

    for (let i = 1; i < fullDeck.length; i++) {
      if (fullDeck[i].ownerTeam.id !== fullDeck[i - 1].ownerTeam.id) {
        fullTransitions++;
        fullCurStreak = 1;
      } else {
        fullCurStreak++;
        if (fullCurStreak > fullMaxStreak) {
          fullMaxStreak = fullCurStreak;
        }
      }
    }

    console.log(`   10-Team League - Total cards: ${fullDeck.length}, Team transitions: ${fullTransitions}, Max team streak: ${fullMaxStreak} (old had 8 transitions, streak 15)`);
    assert(
      fullTransitions >= 100,
      `Full 135-card deck should have >= 100 transitions across 9 teams (got ${fullTransitions})`
    );
    assert(
      fullMaxStreak <= 4,
      `Full 135-card deck max team streak must be <= 4 (got ${fullMaxStreak}, old had 15)`
    );

    console.log('✓ Test 2 Passed: Candidate pool is thoroughly randomized across teams.');
  }

  // Test 3: Rock-solid stability across swipes (no re-shuffling under user)
  console.log('\n[Test 3] Testing stability across successive swipes...');
  {
    const sessionSeed = 'test_session_stability_seed';
    let currentSwipes: Swipe[] = [];

    // Generate initial deck using full 10-team league (135 cards)
    const initialDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: currentSwipes,
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });

    assert(initialDeck.length === 135, 'Initial deck must have 135 items');

    // Simulate swiping 15 cards in succession
    for (let swipeStep = 0; swipeStep < 15; swipeStep++) {
      const topCard = initialDeck[swipeStep];
      const expectedRemaining = initialDeck.slice(swipeStep + 1);

      // Record swipe for topCard
      currentSwipes.push({
        id: `swipe_${swipeStep}`,
        teamId: userTeam.id,
        tradeType: '1-for-1',
        offeredPlayerIds: [offeredPlayer.id],
        targetPlayerIds: topCard.players.map((p) => p.id),
        targetTeamId: topCard.ownerTeam.id,
        isInterested: swipeStep % 2 === 0,
        createdAt: new Date().toISOString(),
      });

      // Re-generate deck after swipe
      const newDeck = generateDeckItems({
        league: fullLeague,
        userTeam,
        tradeType: '1-for-1',
        offeredPlayerIds: [offeredPlayer.id],
        swipes: currentSwipes,
        selectedPositions: allPositions,
        includedOpponentTeams: opponentTeams,
        seed: sessionSeed,
      });

      assert.strictEqual(
        newDeck.length,
        expectedRemaining.length,
        `Step ${swipeStep + 1}: Deck length should decrement by 1`
      );

      // Verify that every single remaining item matches the original sequence exactly
      for (let i = 0; i < newDeck.length; i++) {
        assert.strictEqual(
          newDeck[i].id,
          expectedRemaining[i].id,
          `Step ${swipeStep + 1}: Item at index ${i} changed from ${expectedRemaining[i].id} to ${newDeck[i].id}`
        );
      }
    }

    console.log('✓ Test 3 Passed: 15 successive swipes verified with 100% order stability.');
  }

  // Test 4: Stability across background polling ticks (identical state re-evaluation)
  console.log('\n[Test 4] Testing stability across 8-second background polling ticks...');
  {
    const sessionSeed = 'test_polling_tick_seed';
    const activeSwipes: Swipe[] = [
      {
        id: 'seed_swipe_1',
        teamId: userTeam.id,
        tradeType: '1-for-1',
        offeredPlayerIds: [offeredPlayer.id],
        targetPlayerIds: [opponentTeams[0].roster[0].id],
        targetTeamId: opponentTeams[0].id,
        isInterested: false,
        createdAt: new Date().toISOString(),
      },
    ];

    const deckTick1 = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [...activeSwipes],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });

    // Simulate 5 background polling ticks with freshly cloned object references
    for (let tick = 1; tick <= 5; tick++) {
      const clonedSwipes = JSON.parse(JSON.stringify(activeSwipes));
      const clonedTeams = JSON.parse(JSON.stringify(opponentTeams));

      const deckTickN = generateDeckItems({
        league: fullLeague,
        userTeam,
        tradeType: '1-for-1',
        offeredPlayerIds: [offeredPlayer.id],
        swipes: clonedSwipes,
        selectedPositions: allPositions,
        includedOpponentTeams: clonedTeams,
        seed: sessionSeed,
      });

      assert.strictEqual(deckTickN.length, deckTick1.length, `Tick ${tick}: Deck length must not change`);
      for (let i = 0; i < deckTick1.length; i++) {
        assert.strictEqual(
          deckTickN[i].id,
          deckTick1[i].id,
          `Tick ${tick}: Card at index ${i} must remain identical`
        );
      }
    }

    console.log('✓ Test 4 Passed: Background polling ticks produce perfectly stable cards without jumping.');
  }

  // Test 5: Undo Swipe restores exact original position
  console.log('\n[Test 5] Testing Undo Swipe restoring exact card position...');
  {
    const sessionSeed = 'test_undo_seed';
    const initialDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });

    const firstCard = initialDeck[0];
    const secondCard = initialDeck[1];

    const swipe: Swipe = {
      id: 'swipe_to_undo',
      teamId: userTeam.id,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      targetPlayerIds: firstCard.players.map((p) => p.id),
      targetTeamId: firstCard.ownerTeam.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    // After swipe, secondCard becomes top card
    const afterSwipeDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [swipe],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });
    assert.strictEqual(afterSwipeDeck[0].id, secondCard.id, 'Top card after swipe should be second card');

    // Simulate Undo by removing swipe
    const afterUndoDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });

    assert.strictEqual(afterUndoDeck[0].id, firstCard.id, 'Undo must restore original top card');
    assert.strictEqual(afterUndoDeck[1].id, secondCard.id, 'Undo must restore original second card');
    assert.strictEqual(afterUndoDeck.length, initialDeck.length, 'Undo must restore full deck length');
    console.log('✓ Test 5 Passed: Undo swipe cleanly restores card to the exact original position.');
  }

  // Test 6: Package Randomization (1-for-2 and 2-for-2)
  console.log('\n[Test 6] Testing package trade pool randomization (1-for-2)...');
  {
    const packageDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-2',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: 'test_pkg_seed',
    });

    // 9 teams * (15 * 14 / 2 = 105 pairs) = 945 pairs
    assert.strictEqual(packageDeck.length, 945, 'Package deck should contain all 945 pairs');

    let teamTransitions = 0;
    for (let i = 1; i < packageDeck.length; i++) {
      if (packageDeck[i].ownerTeam.id !== packageDeck[i - 1].ownerTeam.id) {
        teamTransitions++;
      }
    }

    console.log(`   Package pool transitions: ${teamTransitions} / 944 (old had 8 transitions)`);
    assert(
      teamTransitions >= 750,
      `Package pairs must be thoroughly interleaved across teams (got ${teamTransitions} transitions, expected >= 750)`
    );
    console.log('✓ Test 6 Passed: 2-player target packages are thoroughly interleaved across teams.');
  }

  // Test 7: Different seeds produce distinct shuffles
  console.log('\n[Test 7] Testing that different seeds produce distinct permutations...');
  {
    const deckA = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: 'seed_alpha',
    });

    const deckB = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: 'seed_beta',
    });

    assert.strictEqual(deckA.length, deckB.length, 'Both decks should have the same number of players');

    let matchingIndices = 0;
    for (let i = 0; i < deckA.length; i++) {
      if (deckA[i].id === deckB[i].id) {
        matchingIndices++;
      }
    }

    // In a pool of 135 items, two independent shuffles should have very few matching indices (avg ~ 1)
    assert(
      matchingIndices < 10,
      `Different seeds must produce different orderings (matched ${matchingIndices} / ${deckA.length})`
    );
    console.log(`   Seed A vs Seed B identical index matches: ${matchingIndices} / ${deckA.length}`);
    console.log('✓ Test 7 Passed: Distinct seeds produce distinct shuffles.');
  }

  // Test 8: Position filter preserves relative randomized ordering
  console.log('\n[Test 8] Testing position filter relative order preservation...');
  {
    const sessionSeed = 'test_filter_seed';
    const fullDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: allPositions,
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });

    const wrDeck = generateDeckItems({
      league: fullLeague,
      userTeam,
      tradeType: '1-for-1',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: ['WR'],
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });

    assert(wrDeck.length > 0, 'WR deck must contain WR players');
    assert(wrDeck.every((item) => item.players[0].position === 'WR'), 'All items in WR deck must be WRs');

    // Extract only WRs from full deck in their appearance order
    const wrsInFullDeck = fullDeck.filter((item) => item.players[0].position === 'WR');

    assert.strictEqual(
      wrDeck.length,
      wrsInFullDeck.length,
      'Filtered WR deck length must equal WR count from full deck'
    );

    for (let i = 0; i < wrDeck.length; i++) {
      assert.strictEqual(
        wrDeck[i].id,
        wrsInFullDeck[i].id,
        `WR relative order mismatch at index ${i}`
      );
    }
    console.log('✓ Test 8 Passed: Position filters preserve relative randomized ordering.');
  }

  console.log('\n======================================================');
  console.log('ALL PLAYER POOL RANDOMIZATION TESTS PASSED! 🎉');
  console.log('======================================================\n');
})();
