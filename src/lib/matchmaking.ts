import { Swipe, Match, League, Player, Team, TradeType, Position } from '@/types/fantasy';

export interface DeckItem {
  id: string;
  ownerTeam: Team;
  players: Player[];
}

/**
 * Unique composite key generator using actual trade type, offered player IDs, and target player IDs.
 */
export function generateSwipeKey(
  type: TradeType,
  offeredIds: string[],
  targetIds: string[]
): string {
  const sortedTargets = Array.isArray(targetIds) ? [...targetIds].sort().join(',') : '';
  const sortedOffered = Array.isArray(offeredIds) ? [...offeredIds].sort().join(',') : '';
  return `${type}|${sortedOffered}|${sortedTargets}`;
}

/**
 * Checks if a player's position matches the user's active position filters (including FLEX).
 */
export function matchesPositionFilter(pos: Position, selectedPositions?: Position[]): boolean {
  if (!selectedPositions || !Array.isArray(selectedPositions)) return true;
  return (
    selectedPositions.includes(pos) ||
    (selectedPositions.includes('FLEX') && (pos === 'RB' || pos === 'WR' || pos === 'TE'))
  );
}

/**
 * 32-bit MurmurHash3 implementation for high-quality, uniform hash distribution.
 */
export function hashDeckSeed(key: string, seed: number = 0): number {
  const str = String(key);
  let h = (Number(seed) || 0) >>> 0;
  for (let i = 0; i < str.length; i++) {
    let k = str.charCodeAt(i);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }
  h ^= str.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Shuffles items deterministically using item IDs and a seed.
 * Guarantees stable ordering across swipes and polling ticks within a session.
 */
export function shuffleDeckItems<T extends { id: string }>(
  items: T[],
  seed: string | number = 'trade_horny_deck_seed'
): T[] {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? [...items] : [];
  }
  const seedStr = String(seed);
  const scored = items.map((item, idx) => ({
    item,
    hash: hashDeckSeed(`${seedStr}::${String(item?.id ?? idx)}`),
    idx,
  }));

  scored.sort((a, b) => {
    if (a.hash < b.hash) return -1;
    if (a.hash > b.hash) return 1;
    const idA = String(a.item?.id ?? a.idx);
    const idB = String(b.item?.id ?? b.idx);
    const idCmp = idA.localeCompare(idB);
    if (idCmp !== 0) return idCmp;
    return a.idx - b.idx;
  });

  return scored.map((s) => s.item);
}

export interface GenerateDeckItemsOptions {
  league?: League | null;
  userTeam?: Team | null;
  tradeType: TradeType;
  offeredPlayerIds: string[];
  swipes?: Swipe[];
  selectedPositions?: Position[];
  includedOpponentTeams?: Team[];
  seed?: string | number;
}

/**
 * Generates and randomizes the candidate player/package pool for the swiping deck.
 * Ensures players from different teams are thoroughly shuffled together, while maintaining
 * rock-solid stability across swipes and background polling cycles.
 */
export function generateDeckItems({
  league,
  userTeam,
  tradeType,
  offeredPlayerIds,
  swipes = [],
  selectedPositions = ['RB', 'WR', 'TE', 'QB', 'FLEX'],
  includedOpponentTeams,
  seed = 'trade_horny_deck_seed',
}: GenerateDeckItemsOptions): DeckItem[] {
  if (!userTeam) return [];

  const isTargetTwoPlayers = tradeType === '1-for-2' || tradeType === '2-for-2';
  const activeOfferedIds = Array.isArray(offeredPlayerIds) ? offeredPlayerIds : [];
  const safeSwipes = Array.isArray(swipes) ? swipes : [];

  // Robust fallback: if includedOpponentTeams is not passed, derive from league
  // Also strictly exclude userTeam if accidentally included in includedOpponentTeams
  const candidateTeams = Array.isArray(includedOpponentTeams)
    ? includedOpponentTeams.filter((t) => t && t.id !== userTeam.id)
    : league && Array.isArray(league.teams)
    ? league.teams.filter((t) => t && t.id !== userTeam.id)
    : [];

  const existingSwipeKeys = new Set(
    safeSwipes
      .filter((s) => s && s.teamId === userTeam.id && s.tradeType === tradeType)
      .map((s) => generateSwipeKey(s.tradeType, s.offeredPlayerIds || [], s.targetPlayerIds || []))
  );

  const rawItems: DeckItem[] = [];

  if (!isTargetTwoPlayers) {
    // SINGLE TARGET (1-for-1 or 2-for-1)
    candidateTeams.forEach((team) => {
      const roster = Array.isArray(team.roster) ? team.roster : [];
      roster.forEach((player) => {
        if (!player || !player.id) return;
        // Never include user's offered player in the candidate target deck
        if (activeOfferedIds.includes(player.id)) return;
        if (!matchesPositionFilter(player.position, selectedPositions)) return;

        const key = generateSwipeKey(tradeType, activeOfferedIds, [player.id]);
        if (!existingSwipeKeys.has(key)) {
          rawItems.push({
            id: `item_${player.id}`,
            ownerTeam: team,
            players: [player],
          });
        }
      });
    });
  } else {
    // TWO TARGETS IN A PACKAGE (1-for-2 or 2-for-2)
    // Generate pairs from the same opponent team
    candidateTeams.forEach((team) => {
      const roster = Array.isArray(team.roster) ? team.roster : [];
      for (let i = 0; i < roster.length; i++) {
        for (let j = i + 1; j < roster.length; j++) {
          const p1 = roster[i];
          const p2 = roster[j];
          if (!p1 || !p1.id || !p2 || !p2.id) continue;

          // Never include user's offered player in the candidate target package
          if (activeOfferedIds.includes(p1.id) || activeOfferedIds.includes(p2.id)) continue;

          if (
            !matchesPositionFilter(p1.position, selectedPositions) ||
            !matchesPositionFilter(p2.position, selectedPositions)
          ) {
            continue;
          }

          // Canonical sorting of player pair IDs ensures immutability against roster ordering changes
          const [firstPlayer, secondPlayer] = p1.id < p2.id ? [p1, p2] : [p2, p1];
          const key = generateSwipeKey(tradeType, activeOfferedIds, [firstPlayer.id, secondPlayer.id]);
          if (!existingSwipeKeys.has(key)) {
            rawItems.push({
              id: `pkg_${team.id}_${firstPlayer.id}_${secondPlayer.id}`,
              ownerTeam: team,
              players: [firstPlayer, secondPlayer],
            });
          }
        }
      }
    });
  }

  return shuffleDeckItems(rawItems, seed);
}

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
  if (!newSwipe.isInterested || !newSwipe.teamId || !newSwipe.targetTeamId) {
    return null;
  }

  // Prevent a team from matching with itself
  if (newSwipe.teamId === newSwipe.targetTeamId) {
    return null;
  }

  // Find complementary swipe from the target team directed specifically back at this team
  const complementarySwipe = allSwipes.find((s) => {
    if (!s.isInterested || s.id === newSwipe.id) return false;
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

  const canonicalTradeType =
    newSwipe.tradeType === '1-for-2' ? '2-for-1' : newSwipe.tradeType;

  return {
    id: `match_${teamA.id}_${teamB.id}_${Date.now()}`,
    leagueId: league.id,
    tradeType: canonicalTradeType,
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
