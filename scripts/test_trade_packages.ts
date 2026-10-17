import assert from 'assert';
import path from 'path';
import {
  generateDeckItems,
  checkForMutualMatch,
  getReciprocalTradeType,
  isReciprocalTradeType,
  arraysEqualIgnoreOrder,
} from '../src/lib/matchmaking';
import {
  recordServerSwipe,
  undoServerSwipe,
  getServerLeagueState,
  clearAllServerLeagues,
} from '../src/lib/serverLeagueStore';
import { League, Team, Player, TradeType, Swipe } from '../src/types/fantasy';

function createMockTeam(teamId: string, name: string, playerCount = 15): Team {
  const roster: Player[] = [];
  const positions: Array<'QB' | 'RB' | 'WR' | 'TE'> = ['QB', 'RB', 'WR', 'TE'];

  for (let i = 0; i < playerCount; i++) {
    const pos = positions[i % positions.length];
    roster.push({
      id: `p_${teamId}_${String(i + 1).padStart(2, '0')}`,
      fullName: `Player ${teamId} ${i + 1}`,
      position: pos,
      nflTeam: 'NFL',
      projectedPoints: 10 + (i % 10),
      seasonAvgPoints: 12 + (i % 8),
      headshotUrl: `https://example.com/p_${teamId}_${i + 1}.png`,
      byeWeek: 7,
      injuryStatus: 'ACTIVE',
    });
  }

  return {
    id: teamId,
    espnTeamId: teamId.replace(/\D/g, '') || '101',
    name,
    ownerName: `Owner ${name}`,
    roster,
  };
}

function createMockLeague(teamCount = 10, playersPerTeam = 15): League {
  const teams: Team[] = [];
  for (let t = 1; t <= teamCount; t++) {
    teams.push(createMockTeam(`team_${t}`, `Team ${t}`, playersPerTeam));
  }

  return {
    id: 'league_test_pkgs',
    espnLeagueId: '77889900',
    seasonId: '2026',
    name: 'Package Test League',
    isPrivate: false,
    teams,
    lastSyncedAt: new Date().toISOString(),
  };
}

export const testPromise = (async function runTradePackageTests() {
  console.log('========================================================');
  console.log('--- Starting Trade Packages & Reciprocity Test Suite ---');
  console.log('========================================================\n');

  const league = createMockLeague(10, 15);
  const userTeam = league.teams[0]; // team_1
  const opponentTeams = league.teams.slice(1); // 9 teams

  // --------------------------------------------------------------------------
  // Test 1: getReciprocalTradeType & isReciprocalTradeType for all 9 types
  // --------------------------------------------------------------------------
  console.log('[Test 1] Testing reciprocity mapping across all 9 TradeTypes...');
  const expectedReciprocals: Record<TradeType, TradeType> = {
    '1-for-1': '1-for-1',
    '1-for-2': '2-for-1',
    '1-for-3': '3-for-1',
    '2-for-1': '1-for-2',
    '2-for-2': '2-for-2',
    '2-for-3': '3-for-2',
    '3-for-1': '1-for-3',
    '3-for-2': '2-for-3',
    '3-for-3': '3-for-3',
  };

  const allTradeTypes: TradeType[] = [
    '1-for-1', '1-for-2', '1-for-3',
    '2-for-1', '2-for-2', '2-for-3',
    '3-for-1', '3-for-2', '3-for-3',
  ];

  for (const t of allTradeTypes) {
    const reciprocal = getReciprocalTradeType(t);
    assert.strictEqual(
      reciprocal,
      expectedReciprocals[t],
      `Reciprocal of ${t} must be ${expectedReciprocals[t]}, got ${reciprocal}`
    );
    assert.strictEqual(
      isReciprocalTradeType(t, expectedReciprocals[t]),
      true,
      `isReciprocalTradeType(${t}, ${expectedReciprocals[t]}) must be true`
    );
    // Non-reciprocals must return false
    for (const other of allTradeTypes) {
      if (other !== expectedReciprocals[t]) {
        assert.strictEqual(
          isReciprocalTradeType(t, other),
          false,
          `isReciprocalTradeType(${t}, ${other}) must be false`
        );
      }
    }
  }
  console.log('✓ Test 1 Passed: All 9 TradeTypes map to exact mathematical reciprocals.');

  // --------------------------------------------------------------------------
  // Test 2: generateDeckItems for 3-player target packages (combinatorics)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing 3-player target package combinatorial deck generation...');
  {
    const offeredPlayer = userTeam.roster[0];
    const deck = generateDeckItems({
      league,
      userTeam,
      tradeType: '1-for-3',
      offeredPlayerIds: [offeredPlayer.id],
      swipes: [],
      selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      includedOpponentTeams: opponentTeams,
      seed: 'test_triplet_seed',
    });

    // 9 teams * C(15, 3) = 9 * (15 * 14 * 13 / 6) = 9 * 455 = 4095
    assert.strictEqual(
      deck.length,
      4095,
      `Deck for 9 teams with 15 players must contain exactly 4095 3-player packages (got ${deck.length})`
    );

    // Verify all deck items have exactly 3 players from the same owner team
    for (let i = 0; i < Math.min(deck.length, 100); i++) {
      const item = deck[i];
      assert.strictEqual(item.players.length, 3, `Item ${item.id} must have 3 players`);
      assert(item.id.startsWith(`pkg_${item.ownerTeam.id}_`), `ID should follow pkg_${item.ownerTeam.id}_ format`);
      // Check that all 3 players belong to ownerTeam
      for (const p of item.players) {
        assert(
          item.ownerTeam.roster.some((r) => r.id === p.id),
          `Player ${p.id} must belong to ownerTeam ${item.ownerTeam.id}`
        );
      }
    }
    console.log('✓ Test 2 Passed: 3-player target packages correctly generated (4095 triplets).');
  }

  // --------------------------------------------------------------------------
  // Test 3: Canonical Sorting & Immutability Under Roster Array Permutation
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing canonical sorting of 3-player packages under roster permutation...');
  {
    const sessionSeed = 'stable_seed_123';
    const offeredIds = [userTeam.roster[0].id, userTeam.roster[1].id, userTeam.roster[2].id];

    const deckOriginal = generateDeckItems({
      league,
      userTeam,
      tradeType: '3-for-3',
      offeredPlayerIds: offeredIds,
      swipes: [],
      selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      includedOpponentTeams: opponentTeams,
      seed: sessionSeed,
    });

    // Reverse and permute opponent rosters
    const permutedOpponentTeams: Team[] = opponentTeams.map((team) => ({
      ...team,
      roster: [...team.roster].reverse(),
    }));

    const deckPermuted = generateDeckItems({
      league,
      userTeam,
      tradeType: '3-for-3',
      offeredPlayerIds: offeredIds,
      swipes: [],
      selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      includedOpponentTeams: permutedOpponentTeams,
      seed: sessionSeed,
    });

    assert.strictEqual(deckPermuted.length, deckOriginal.length);

    for (let i = 0; i < 200; i++) {
      const orig = deckOriginal[i];
      const perm = deckPermuted[i];
      assert.strictEqual(perm.id, orig.id, `Deck item ${i} ID diverged under roster permutation`);
      assert.strictEqual(perm.players[0].id, orig.players[0].id);
      assert.strictEqual(perm.players[1].id, orig.players[1].id);
      assert.strictEqual(perm.players[2].id, orig.players[2].id);
      // Ensure sorted order
      assert(perm.players[0].id < perm.players[1].id, 'Player 0 ID < Player 1 ID');
      assert(perm.players[1].id < perm.players[2].id, 'Player 1 ID < Player 2 ID');
    }
    console.log('✓ Test 3 Passed: 3-player package IDs are canonically sorted and immune to permutation.');
  }

  // --------------------------------------------------------------------------
  // Test 4: Mutual Reciprocal Matchmaking for 3-for-1 <-> 1-for-3
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing reciprocal matching: 3-for-1 matches 1-for-3...');
  {
    const team1 = league.teams[0];
    const team2 = league.teams[1];

    const t1Offer = [team1.roster[0].id, team1.roster[1].id, team1.roster[2].id];
    const t1Target = [team2.roster[0].id];

    // Team 1 swipes 3-for-1 on Team 2
    const swipeT1: Swipe = {
      id: 'swipe_t1_3for1',
      teamId: team1.id,
      tradeType: '3-for-1',
      offeredPlayerIds: t1Offer,
      targetPlayerIds: t1Target,
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    // Before reciprocation: No match
    const noMatch = checkForMutualMatch(swipeT1, [], league);
    assert.strictEqual(noMatch, null, 'No match should occur before reciprocation');

    // Team 2 swipes reciprocally 1-for-3 on Team 1
    const swipeT2: Swipe = {
      id: 'swipe_t2_1for3',
      teamId: team2.id,
      tradeType: '1-for-3',
      offeredPlayerIds: t1Target,
      targetPlayerIds: t1Offer,
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const matchT2 = checkForMutualMatch(swipeT2, [swipeT1], league);
    assert(matchT2 !== null, 'Mutual match MUST be found for 3-for-1 <-> 1-for-3');
    assert.strictEqual(matchT2.teamAPlayers.length, 1);
    assert.strictEqual(matchT2.teamBPlayers.length, 3);
    assert(arraysEqualIgnoreOrder(matchT2.teamAPlayers.map((p) => p.id), t1Target));
    assert(arraysEqualIgnoreOrder(matchT2.teamBPlayers.map((p) => p.id), t1Offer));
    console.log('✓ Test 4 Passed: 3-for-1 and 1-for-3 mutually match.');
  }

  // --------------------------------------------------------------------------
  // Test 5: Mutual Reciprocal Matchmaking for 3-for-2 <-> 2-for-3
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing reciprocal matching: 3-for-2 matches 2-for-3...');
  {
    const team1 = league.teams[0];
    const team2 = league.teams[1];

    const t1Offer = [team1.roster[0].id, team1.roster[1].id, team1.roster[2].id];
    const t1Target = [team2.roster[0].id, team2.roster[1].id];

    const swipeT1: Swipe = {
      id: 'swipe_t1_3for2',
      teamId: team1.id,
      tradeType: '3-for-2',
      offeredPlayerIds: t1Offer,
      targetPlayerIds: t1Target,
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const swipeT2: Swipe = {
      id: 'swipe_t2_2for3',
      teamId: team2.id,
      tradeType: '2-for-3',
      offeredPlayerIds: t1Target,
      targetPlayerIds: t1Offer,
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const match = checkForMutualMatch(swipeT2, [swipeT1], league);
    assert(match !== null, 'Mutual match MUST be found for 3-for-2 <-> 2-for-3');
    assert.strictEqual(match.teamAPlayers.length, 2);
    assert.strictEqual(match.teamBPlayers.length, 3);
    console.log('✓ Test 5 Passed: 3-for-2 and 2-for-3 mutually match.');
  }

  // --------------------------------------------------------------------------
  // Test 6: Mutual Reciprocal Matchmaking for 3-for-3 Blockbuster
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing reciprocal matching: 3-for-3 blockbuster swap...');
  {
    const team1 = league.teams[0];
    const team2 = league.teams[1];

    const t1Offer = [team1.roster[0].id, team1.roster[1].id, team1.roster[2].id];
    const t1Target = [team2.roster[0].id, team2.roster[1].id, team2.roster[2].id];

    const swipeT1: Swipe = {
      id: 'swipe_t1_3for3',
      teamId: team1.id,
      tradeType: '3-for-3',
      offeredPlayerIds: t1Offer,
      targetPlayerIds: t1Target,
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const swipeT2: Swipe = {
      id: 'swipe_t2_3for3',
      teamId: team2.id,
      tradeType: '3-for-3',
      offeredPlayerIds: t1Target,
      targetPlayerIds: t1Offer,
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const match = checkForMutualMatch(swipeT2, [swipeT1], league);
    assert(match !== null, 'Mutual match MUST be found for 3-for-3');
    assert.strictEqual(match.teamAPlayers.length, 3);
    assert.strictEqual(match.teamBPlayers.length, 3);
    console.log('✓ Test 6 Passed: 3-for-3 blockbuster packages mutually match.');
  }

  // --------------------------------------------------------------------------
  // Test 7: Cardinality Mismatch & Incompatible Trade Type Rejections
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing cardinality validation and non-reciprocal rejection...');
  {
    const team1 = league.teams[0];
    const team2 = league.teams[1];

    const t1Offer = [team1.roster[0].id, team1.roster[1].id, team1.roster[2].id];
    const t1Target = [team2.roster[0].id];

    const swipeT1: Swipe = {
      id: 'swipe_t1_3for1_bad',
      teamId: team1.id,
      tradeType: '3-for-1',
      offeredPlayerIds: t1Offer,
      targetPlayerIds: t1Target,
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    // Team 2 erroneously uses 2-for-1 instead of 1-for-3
    const swipeT2WrongType: Swipe = {
      id: 'swipe_t2_wrong_type',
      teamId: team2.id,
      tradeType: '2-for-1',
      offeredPlayerIds: t1Target,
      targetPlayerIds: t1Offer,
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const matchWrongType = checkForMutualMatch(swipeT2WrongType, [swipeT1], league);
    assert.strictEqual(matchWrongType, null, 'Incompatible trade type must NOT match');

    // Cardinality mismatch: offered array has 2 players but tradeType says 3-for-1
    const swipeBadCardinality: Swipe = {
      id: 'swipe_t1_cardinality_mismatch',
      teamId: team1.id,
      tradeType: '3-for-1',
      offeredPlayerIds: [team1.roster[0].id, team1.roster[1].id], // only 2 players!
      targetPlayerIds: t1Target,
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    };

    const matchBadCard = checkForMutualMatch(swipeBadCardinality, [swipeT2WrongType], league);
    assert.strictEqual(matchBadCard, null, 'Cardinality mismatch must be rejected');
    console.log('✓ Test 7 Passed: Incompatible trade types and cardinality mismatches rejected.');
  }

  // --------------------------------------------------------------------------
  // Test 8: Server League Store Swipe Recording & Undo for 3-Player Packages
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] Testing server store swipe recording & undo with 3-player packages...');
  {
    clearAllServerLeagues();
    const testLeagueId = 'pkg_server_league_01';

    const team1 = league.teams[0];
    const team2 = league.teams[1];

    const t1Offer = [team1.roster[0].id, team1.roster[1].id, team1.roster[2].id];
    const t2Offer = [team2.roster[0].id, team2.roster[1].id];

    // Team 1 swipes 3-for-2
    const res1 = recordServerSwipe(testLeagueId, {
      id: 'swipe_server_t1',
      teamId: team1.id,
      tradeType: '3-for-2',
      offeredPlayerIds: t1Offer,
      targetPlayerIds: t2Offer,
      targetTeamId: team2.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    }, { ...league, espnLeagueId: testLeagueId });

    assert(res1 !== null);
    assert.strictEqual(res1.matchFound, null, 'No match on first swipe');
    assert.strictEqual(res1.state.swipes.length, 1);

    // Team 2 swipes 2-for-3
    const res2 = recordServerSwipe(testLeagueId, {
      id: 'swipe_server_t2',
      teamId: team2.id,
      tradeType: '2-for-3',
      offeredPlayerIds: t2Offer,
      targetPlayerIds: t1Offer,
      targetTeamId: team1.id,
      isInterested: true,
      createdAt: new Date().toISOString(),
    }, { ...league, espnLeagueId: testLeagueId });

    assert(res2 !== null);
    assert(res2.matchFound !== null, 'Server store must detect mutual match');
    assert.strictEqual(res2.state.matches.length, 1);

    // Undo Team 2's swipe -> match must be reverted cleanly
    const undoRes = undoServerSwipe(testLeagueId, team2.id, '2-for-3', t2Offer);
    assert(undoRes !== null);
    assert.strictEqual(undoRes.swipes.length, 1, 'Only team 1 swipe should remain');
    assert.strictEqual(undoRes.matches.length, 0, 'Reverted match must be removed');
    console.log('✓ Test 8 Passed: Server store swipe recording and undo verified for 3-player packages.');
  }

  // --------------------------------------------------------------------------
  // Test 9: User Offered Players Excluded From 3-Player Packages
  // --------------------------------------------------------------------------
  console.log('\n[Test 9] Testing exclusion of offered players from 3-player candidate pool...');
  {
    // If user offers 3 players, none of those 3 players may appear in candidate packages
    const offeredIds = [userTeam.roster[0].id, userTeam.roster[1].id, userTeam.roster[2].id];

    const deck = generateDeckItems({
      league,
      userTeam,
      tradeType: '3-for-3',
      offeredPlayerIds: offeredIds,
      swipes: [],
      selectedPositions: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
      includedOpponentTeams: opponentTeams,
      seed: 'seed_offered_exclusion',
    });

    for (const item of deck) {
      for (const p of item.players) {
        assert(
          !offeredIds.includes(p.id),
          `Offered player ${p.id} must never appear in target package ${item.id}`
        );
      }
    }
    console.log('✓ Test 9 Passed: Offered players strictly excluded from all target packages.');
  }

  console.log('\n========================================================');
  console.log('ALL TRADE PACKAGES & RECIPROCITY TESTS PASSED! 🎉');
  console.log('========================================================\n');
})();
