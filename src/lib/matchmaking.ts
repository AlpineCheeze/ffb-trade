import { Swipe, Match, League, Player } from '@/types/fantasy';

/**
 * True multiset equality comparison that preserves duplicate counts.
 */
export function arraysEqualIgnoreOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Checks if a newly recorded swipe triggers a mutual trade match (1-1, 2-1, 1-2, or 2-2).
 */
export function checkForMutualMatch(
  newSwipe: Swipe,
  allSwipes: Swipe[],
  league: League
): Match | null {
  if (!newSwipe.isInterested) {
    return null;
  }

  // Find complementary swipe from the target team directed specifically back at this team
  const complementarySwipe = allSwipes.find((s) => {
    if (!s.isInterested) return false;
    // Both teams must specifically target each other
    if (s.teamId !== newSwipe.targetTeamId || s.targetTeamId !== newSwipe.teamId) return false;

    // Check trade type reciprocity
    const isReciprocalType =
      (newSwipe.tradeType === '1-for-1' && s.tradeType === '1-for-1') ||
      (newSwipe.tradeType === '2-for-1' && s.tradeType === '1-for-2') ||
      (newSwipe.tradeType === '1-for-2' && s.tradeType === '2-for-1') ||
      (newSwipe.tradeType === '2-for-2' && s.tradeType === '2-for-2');

    if (!isReciprocalType) return false;

    // Complementary check: Other team offered what we targeted, and targeted what we offered
    const offeredMatchesTarget = arraysEqualIgnoreOrder(s.offeredPlayerIds, newSwipe.targetPlayerIds);
    const targetMatchesOffered = arraysEqualIgnoreOrder(s.targetPlayerIds, newSwipe.offeredPlayerIds);

    return offeredMatchesTarget && targetMatchesOffered;
  });

  if (!complementarySwipe) {
    return null;
  }

  // Find teams in league data
  const teamA = league.teams.find((t) => t.id === newSwipe.teamId);
  const teamB = league.teams.find((t) => t.id === newSwipe.targetTeamId);
  if (!teamA || !teamB) return null;

  const teamAPlayers = teamA.roster.filter((p) => newSwipe.offeredPlayerIds.includes(p.id));
  const teamBPlayers = teamB.roster.filter((p) => newSwipe.targetPlayerIds.includes(p.id));

  // Strict cardinality validation matching the exact expected package sizes
  const expectedA = (newSwipe.tradeType === '2-for-1' || newSwipe.tradeType === '2-for-2') ? 2 : 1;
  const expectedB = (newSwipe.tradeType === '1-for-2' || newSwipe.tradeType === '2-for-2') ? 2 : 1;

  if (teamAPlayers.length !== expectedA || teamBPlayers.length !== expectedB) {
    return null;
  }

  return {
    id: `match_${teamA.id}_${teamB.id}_${Date.now()}`,
    leagueId: league.id,
    tradeType: newSwipe.tradeType,
    teamAId: teamA.id,
    teamBId: teamB.id,
    teamA,
    teamB,
    teamAPlayers,
    teamBPlayers,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Seed opponent swipes for the demo sandbox league.
 * For real imported ESPN leagues, returns an empty array to prevent mock player ID contamination.
 */
export function createSeedOpponentSwipes(league: League): Swipe[] {
  // Only inject seed swipes for the mock demo league
  const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
  if (!isMock) {
    return [];
  }

  const seeds: Swipe[] = [];

  // Dave Miller (Team 2): 1-for-1 Straight swap
  // Offers Breece Hall (RB) for Justin Jefferson (WR)
  seeds.push({
    id: 'seed_swipe_1',
    teamId: 'team_2',
    tradeType: '1-for-1',
    offeredPlayerIds: ['p_breece'],
    targetPlayerIds: ['p_jj'],
    targetTeamId: 'team_1',
    isInterested: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  });

  // Sarah Jenkins (Team 3): 2-for-1 Package
  // Offers Ja'Marr Chase & Bijan Robinson for Saquon Barkley (Team 1)
  seeds.push({
    id: 'seed_swipe_2',
    teamId: 'team_3',
    tradeType: '2-for-1',
    offeredPlayerIds: ['p_chase', 'p_bijan'],
    targetPlayerIds: ['p_saquon'],
    targetTeamId: 'team_1',
    isInterested: true,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  });

  // Dave Miller (Team 2): 2-for-2 Blockbuster
  // Offers Breece Hall & CeeDee Lamb for Justin Jefferson & Saquon Barkley
  seeds.push({
    id: 'seed_swipe_3',
    teamId: 'team_2',
    tradeType: '2-for-2',
    offeredPlayerIds: ['p_breece', 'p_ceedee'],
    targetPlayerIds: ['p_jj', 'p_saquon'],
    targetTeamId: 'team_1',
    isInterested: true,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  });

  return seeds;
}
