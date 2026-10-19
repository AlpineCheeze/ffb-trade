import {
  Swipe,
  Match,
  League,
  Player,
  Team,
  TradeType,
  Position,
  IncomingActivityHints,
  WarmTradeLead,
} from '@/types/fantasy';

export interface DeckItem {
  id: string;
  ownerTeam: Team;
  players: Player[];
}

export const VALID_TRADE_TYPES: TradeType[] = [
  '1-for-1',
  '1-for-2',
  '1-for-3',
  '2-for-1',
  '2-for-2',
  '2-for-3',
  '3-for-1',
  '3-for-2',
  '3-for-3',
];

export function isValidTradeType(val: any): val is TradeType {
  return typeof val === 'string' && VALID_TRADE_TYPES.includes(val as TradeType);
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
  priorityTargetKeys?: string[];
}

/**
 * Generates and randomizes the candidate player/package pool for the swiping deck.
 * Ensures players from different teams are thoroughly shuffled together, while maintaining
 * rock-solid stability across swipes and background polling cycles.
 * If priorityTargetKeys are provided (or derived from opponent interested swipes),
 * candidate cards that would complete an opponent's existing interested swipe are
 * deterministically interleaved near the top of the deck so they remain blind.
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
  priorityTargetKeys,
}: GenerateDeckItemsOptions): DeckItem[] {
  if (!userTeam) return [];

  const targetCount =
    typeof tradeType === 'string' && tradeType.includes('-for-')
      ? parseInt(tradeType.split('-for-')[1], 10)
      : 1;
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

  // Build priority target keys set from explicit priorityTargetKeys AND any opponent swipes in safeSwipes
  const priorityKeysSet = new Set<string>(Array.isArray(priorityTargetKeys) ? priorityTargetKeys : []);
  for (const s of safeSwipes) {
    if (
      s &&
      s.isInterested &&
      s.targetTeamId === userTeam.id &&
      s.teamId !== userTeam.id &&
      isReciprocalTradeType(tradeType, s.tradeType) &&
      arraysEqualIgnoreOrder(s.targetPlayerIds || [], activeOfferedIds)
    ) {
      priorityKeysSet.add(
        generateSwipeKey(tradeType, activeOfferedIds, s.offeredPlayerIds || [])
      );
    }
  }

  const rawItems: DeckItem[] = [];

  if (targetCount === 1) {
    // SINGLE TARGET (1-for-1, 2-for-1, 3-for-1)
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
  } else if (targetCount === 2) {
    // TWO TARGETS IN A PACKAGE (1-for-2, 2-for-2, 3-for-2)
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
  } else if (targetCount === 3) {
    // THREE TARGETS IN A PACKAGE (1-for-3, 2-for-3, 3-for-3)
    // Generate triplets from the same opponent team
    candidateTeams.forEach((team) => {
      const roster = Array.isArray(team.roster) ? team.roster : [];
      for (let i = 0; i < roster.length; i++) {
        for (let j = i + 1; j < roster.length; j++) {
          for (let k = j + 1; k < roster.length; k++) {
            const p1 = roster[i];
            const p2 = roster[j];
            const p3 = roster[k];
            if (!p1 || !p1.id || !p2 || !p2.id || !p3 || !p3.id) continue;

            // Never include user's offered player in the candidate target package
            if (
              activeOfferedIds.includes(p1.id) ||
              activeOfferedIds.includes(p2.id) ||
              activeOfferedIds.includes(p3.id)
            ) {
              continue;
            }

            if (
              !matchesPositionFilter(p1.position, selectedPositions) ||
              !matchesPositionFilter(p2.position, selectedPositions) ||
              !matchesPositionFilter(p3.position, selectedPositions)
            ) {
              continue;
            }

            // Canonical sorting of player triplet IDs ensures immutability against roster ordering changes
            const sortedPlayers = [p1, p2, p3].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            const key = generateSwipeKey(
              tradeType,
              activeOfferedIds,
              sortedPlayers.map((p) => p.id)
            );
            if (!existingSwipeKeys.has(key)) {
              rawItems.push({
                id: `pkg_${team.id}_${sortedPlayers[0].id}_${sortedPlayers[1].id}_${sortedPlayers[2].id}`,
                ownerTeam: team,
                players: sortedPlayers,
              });
            }
          }
        }
      }
    });
  }

  const shuffled = shuffleDeckItems(rawItems, seed);

  if (priorityKeysSet.size === 0 || shuffled.length <= 1) {
    return shuffled;
  }

  const priorityItems: DeckItem[] = [];
  const regularItems: DeckItem[] = [];

  for (const item of shuffled) {
    const itemKey = generateSwipeKey(
      tradeType,
      activeOfferedIds,
      item.players.map((p) => p.id)
    );
    if (priorityKeysSet.has(itemKey)) {
      priorityItems.push(item);
    } else {
      regularItems.push(item);
    }
  }

  if (priorityItems.length === 0) {
    return shuffled;
  }

  // Deterministically interleave priority items near the top of the deck (within first few cards)
  // so they appear early without always being strictly index 0 (preserving blind secrecy)
  const result = [...regularItems];
  priorityItems.forEach((pItem, idx) => {
    const slotOffset = hashDeckSeed(`${String(seed)}::prio_slot::${pItem.id}`) % 2; // 0 or 1
    const targetIdx = Math.min(idx * 2 + slotOffset, result.length);
    result.splice(targetIdx, 0, pItem);
  });

  return result;
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
 * Returns the reciprocal trade type for a given trade type.
 * e.g., '3-for-1' -> '1-for-3', '2-for-3' -> '3-for-2', '3-for-3' -> '3-for-3'.
 */
export function getReciprocalTradeType(tradeType: TradeType): TradeType {
  if (!tradeType || typeof tradeType !== 'string' || !tradeType.includes('-for-')) {
    return '1-for-1';
  }
  const [send, get] = tradeType.split('-for-');
  return `${get}-for-${send}` as TradeType;
}

/**
 * Checks if two trade types are reciprocals of each other.
 */
export function isReciprocalTradeType(typeA: TradeType, typeB: TradeType): boolean {
  if (!typeA || !typeB) return false;
  return getReciprocalTradeType(typeA) === typeB;
}

/**
 * Checks if a newly recorded swipe triggers a mutual trade match across all 9 trade combinations.
 */
export function checkForMutualMatch(
  newSwipe: Swipe,
  allSwipes: Swipe[],
  league: League
): Match | null {
  if (
    !newSwipe ||
    !newSwipe.isInterested ||
    !newSwipe.teamId ||
    !newSwipe.targetTeamId ||
    !newSwipe.tradeType ||
    typeof newSwipe.tradeType !== 'string' ||
    !newSwipe.tradeType.includes('-for-') ||
    !Array.isArray(newSwipe.offeredPlayerIds) ||
    !Array.isArray(newSwipe.targetPlayerIds) ||
    !league ||
    !Array.isArray(league.teams)
  ) {
    return null;
  }

  // Prevent a team from matching with itself
  if (newSwipe.teamId === newSwipe.targetTeamId) {
    return null;
  }

  // Find complementary swipe from the target team directed specifically back at this team
  const complementarySwipe = (Array.isArray(allSwipes) ? allSwipes : []).find((s) => {
    if (!s || !s.isInterested || s.id === newSwipe.id) return false;
    // Both teams must specifically target each other
    if (s.teamId !== newSwipe.targetTeamId || s.targetTeamId !== newSwipe.teamId) return false;

    // Check trade type reciprocity (e.g. 3-for-1 matches 1-for-3, 2-for-3 matches 3-for-2)
    const isReciprocalType = isReciprocalTradeType(newSwipe.tradeType, s.tradeType);
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
  const teamA = league.teams.find((t) => t && t.id === newSwipe.teamId);
  const teamB = league.teams.find((t) => t && t.id === newSwipe.targetTeamId);
  if (!teamA || !teamB || !Array.isArray(teamA.roster) || !Array.isArray(teamB.roster)) {
    return null;
  }

  const teamAPlayers = teamA.roster.filter((p) => p && newSwipe.offeredPlayerIds.includes(p.id));
  const teamBPlayers = teamB.roster.filter((p) => p && newSwipe.targetPlayerIds.includes(p.id));

  // Strict cardinality validation matching the exact expected package sizes
  const [expectedAStr, expectedBStr] = newSwipe.tradeType.split('-for-');
  const expectedA = parseInt(expectedAStr, 10);
  const expectedB = parseInt(expectedBStr, 10);

  if (
    newSwipe.offeredPlayerIds.length !== expectedA ||
    newSwipe.targetPlayerIds.length !== expectedB ||
    teamAPlayers.length !== expectedA ||
    teamBPlayers.length !== expectedB
  ) {
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
 * Reciprocal match checking aliases
 */
export const checkReciprocalMatch = checkForMutualMatch;
export const findReciprocalMatch = checkForMutualMatch;

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

  // Sarah Jenkins (Team 3): 3-for-2 Blockbuster Package
  // Offers Ja'Marr Chase, Bijan Robinson & Amon-Ra St. Brown for Justin Jefferson & Saquon Barkley
  seeds.push({
    id: 'seed_swipe_4',
    teamId: 'team_3',
    tradeType: '3-for-2',
    offeredPlayerIds: ['p_chase', 'p_bijan', 'p_amonra'],
    targetPlayerIds: ['p_jj', 'p_saquon'],
    targetTeamId: 'team_1',
    isInterested: true,
    createdAt: new Date(Date.now() - 900000).toISOString(),
  });

  return seeds;
}

/**
 * Checks if the user has already responded with a reciprocal Want or Pass to an incoming swipe.
 */
export function hasUserRespondedToIncomingSwipe(
  incomingSwipe: Swipe,
  allSwipes: Swipe[],
  userTeamId: string
): boolean {
  if (!incomingSwipe || !incomingSwipe.tradeType) return false;
  const reciprocalType = getReciprocalTradeType(incomingSwipe.tradeType);
  return allSwipes.some(
    (r) =>
      r &&
      r.teamId === userTeamId &&
      r.targetTeamId === incomingSwipe.teamId &&
      r.tradeType === reciprocalType &&
      arraysEqualIgnoreOrder(r.offeredPlayerIds || [], incomingSwipe.targetPlayerIds || []) &&
      arraysEqualIgnoreOrder(r.targetPlayerIds || [], incomingSwipe.offeredPlayerIds || [])
  );
}

/**
 * Computes blind-safe incoming activity hints for `userTeamId`.
 * Reveals which user-perspective trade types (e.g. '1-for-2' if an opponent swiped '2-for-1' on user)
 * and which of the user's own roster player IDs have incoming `isInterested: true` swipes from opponents,
 * without leaking which opponent swiped or which opponent players were offered.
 * Excludes incoming swipes where the user has already responded with a reciprocal Want or Pass.
 */
export function computeIncomingActivityHints(
  allSwipes: Swipe[],
  userTeamId?: string | null
): IncomingActivityHints {
  if (!userTeamId || !Array.isArray(allSwipes)) {
    return {
      interestedTradeTypes: [],
      targetedPlayerIds: [],
      totalIncomingCount: 0,
    };
  }

  const incomingSwipes = allSwipes.filter(
    (s) =>
      s &&
      s.isInterested &&
      s.targetTeamId === userTeamId &&
      s.teamId !== userTeamId &&
      !hasUserRespondedToIncomingSwipe(s, allSwipes, userTeamId)
  );

  const tradeTypeSet = new Set<TradeType>();
  const targetedPlayerIdSet = new Set<string>();

  for (const s of incomingSwipes) {
    if (s.tradeType) {
      tradeTypeSet.add(getReciprocalTradeType(s.tradeType));
    }
    if (Array.isArray(s.targetPlayerIds)) {
      for (const pid of s.targetPlayerIds) {
        if (pid) targetedPlayerIdSet.add(pid);
      }
    }
  }

  return {
    interestedTradeTypes: Array.from(tradeTypeSet),
    targetedPlayerIds: Array.from(targetedPlayerIdSet),
    totalIncomingCount: incomingSwipes.length,
  };
}

/**
 * Computes composite swipe keys (`tradeType|sortedUserOfferedIds|sortedOpponentOfferedIds`)
 * for all opponent `isInterested: true` swipes targeting `userTeamId`.
 * Used for blind priority deck injection so candidate cards that complete an existing opponent
 * swipe appear near the top of the deck.
 * Excludes incoming swipes where the user has already responded with a reciprocal Want or Pass.
 */
export function computePriorityTargetKeys(
  allSwipes: Swipe[],
  userTeamId?: string | null
): string[] {
  if (!userTeamId || !Array.isArray(allSwipes)) return [];

  const keys = new Set<string>();
  for (const s of allSwipes) {
    if (
      s &&
      s.isInterested &&
      s.targetTeamId === userTeamId &&
      s.teamId !== userTeamId &&
      s.tradeType &&
      !hasUserRespondedToIncomingSwipe(s, allSwipes, userTeamId)
    ) {
      const userTradeType = getReciprocalTradeType(s.tradeType);
      const key = generateSwipeKey(
        userTradeType,
        s.targetPlayerIds || [],
        s.offeredPlayerIds || []
      );
      keys.add(key);
    }
  }

  return Array.from(keys);
}

/**
 * Computes "Warm Trade Leads" (Mutual Player Interest) when Manager A (`userTeamId`) has swiped
 * `Want` (`isInterested: true`) on a package containing Player Y from Team B, AND Team B has also
 * swiped `Want` (`isInterested: true`) on a package containing Player X from Manager A,
 * even if their trade types or secondary throw-in players differed so an exact match didn't trigger.
 */
export function computeWarmTradeLeads(
  allSwipes: Swipe[],
  matches: Match[],
  league: League,
  userTeamId?: string | null
): WarmTradeLead[] {
  if (
    !userTeamId ||
    !Array.isArray(allSwipes) ||
    !league ||
    !Array.isArray(league.teams)
  ) {
    return [];
  }

  const userTeam = league.teams.find((t) => t && t.id === userTeamId);
  if (!userTeam) return [];

  const safeMatches = Array.isArray(matches) ? matches : [];

  const myWantSwipes = allSwipes.filter(
    (s) => s && s.isInterested && s.teamId === userTeamId && s.targetTeamId !== userTeamId
  );
  const incomingWantSwipes = allSwipes.filter(
    (s) => s && s.isInterested && s.targetTeamId === userTeamId && s.teamId !== userTeamId
  );

  if (myWantSwipes.length === 0 || incomingWantSwipes.length === 0) {
    return [];
  }

  const leads: WarmTradeLead[] = [];
  const seenLeadKeys = new Set<string>();

  for (const mySwipe of myWantSwipes) {
    const partnerTeamId = mySwipe.targetTeamId;
    const partnerTeam = league.teams.find((t) => t && t.id === partnerTeamId);
    if (!partnerTeam) continue;

    const partnerSwipesForMe = incomingWantSwipes.filter(
      (s) => s.teamId === partnerTeamId
    );
    if (partnerSwipesForMe.length === 0) continue;

    for (const partnerSwipe of partnerSwipesForMe) {
      // Skip if this exact swipe pair already forms an exact reciprocal match
      const isExactReciprocal =
        isReciprocalTradeType(mySwipe.tradeType, partnerSwipe.tradeType) &&
        arraysEqualIgnoreOrder(mySwipe.offeredPlayerIds || [], partnerSwipe.targetPlayerIds || []) &&
        arraysEqualIgnoreOrder(mySwipe.targetPlayerIds || [], partnerSwipe.offeredPlayerIds || []);

      if (isExactReciprocal) continue;

      // Require player overlap between the user's swipe and the partner's swipe
      const myOverlap = (mySwipe.offeredPlayerIds || []).filter((id) =>
        (partnerSwipe.targetPlayerIds || []).includes(id)
      );
      const partnerOverlap = (mySwipe.targetPlayerIds || []).filter((id) =>
        (partnerSwipe.offeredPlayerIds || []).includes(id)
      );
      if (myOverlap.length === 0 && partnerOverlap.length === 0) {
        continue;
      }

      // If both sides have specific overlapping players, focus on those overlapping players;
      // otherwise, construct around partner's actual incoming offer
      const myCandidateIds =
        myOverlap.length > 0
          ? myOverlap
          : (Array.isArray(partnerSwipe.targetPlayerIds) && partnerSwipe.targetPlayerIds.length > 0
              ? partnerSwipe.targetPlayerIds
              : mySwipe.offeredPlayerIds || []);

      const partnerCandidateIds =
        partnerOverlap.length > 0
          ? partnerOverlap
          : (Array.isArray(partnerSwipe.offeredPlayerIds) && partnerSwipe.offeredPlayerIds.length > 0
              ? partnerSwipe.offeredPlayerIds
              : mySwipe.targetPlayerIds || []);

      const myPlayers = (userTeam.roster || [])
        .filter((p) => p && myCandidateIds.includes(p.id))
        .slice(0, 3);
      const partnerPlayers = (partnerTeam.roster || [])
        .filter((p) => p && partnerCandidateIds.includes(p.id))
        .slice(0, 3);

      if (myPlayers.length === 0 || partnerPlayers.length === 0) continue;

      const myPlayerIdsSorted = myPlayers.map((p) => p.id).sort();
      const partnerPlayerIdsSorted = partnerPlayers.map((p) => p.id).sort();

      const suggestedTradeType = `${myPlayers.length}-for-${partnerPlayers.length}` as TradeType;
      if (!isValidTradeType(suggestedTradeType)) continue;

      // Exclude any candidate combinations that the user has already swiped on (excluding this trigger swipe)
      const alreadySwiped = allSwipes.some(
        (s) =>
          s &&
          s.teamId === userTeamId &&
          s.targetTeamId === partnerTeamId &&
          s.tradeType === suggestedTradeType &&
          s.id !== mySwipe.id &&
          arraysEqualIgnoreOrder(s.offeredPlayerIds || [], myPlayerIdsSorted) &&
          arraysEqualIgnoreOrder(s.targetPlayerIds || [], partnerPlayerIdsSorted)
      );
      if (alreadySwiped) continue;

      const userPassed = allSwipes.some(
        (s) =>
          s &&
          s.teamId === userTeamId &&
          s.targetTeamId === partnerTeamId &&
          s.tradeType === suggestedTradeType &&
          !s.isInterested &&
          arraysEqualIgnoreOrder(s.offeredPlayerIds || [], myPlayerIdsSorted) &&
          arraysEqualIgnoreOrder(s.targetPlayerIds || [], partnerPlayerIdsSorted)
      );
      if (userPassed) continue;

      // Skip if an active confirmed match already exists with these exact players
      const alreadyMatched = safeMatches.some((m) => {
        const mPlayersA = m.teamAPlayers.map((p) => p.id);
        const mPlayersB = m.teamBPlayers.map((p) => p.id);
        const sameDir =
          m.teamAId === userTeamId &&
          m.teamBId === partnerTeamId &&
          arraysEqualIgnoreOrder(mPlayersA, myPlayerIdsSorted) &&
          arraysEqualIgnoreOrder(mPlayersB, partnerPlayerIdsSorted);
        const revDir =
          m.teamBId === userTeamId &&
          m.teamAId === partnerTeamId &&
          arraysEqualIgnoreOrder(mPlayersB, myPlayerIdsSorted) &&
          arraysEqualIgnoreOrder(mPlayersA, partnerPlayerIdsSorted);
        return sameDir || revDir;
      });
      if (alreadyMatched) continue;

      const leadKey = `${partnerTeamId}|${myPlayerIdsSorted.join(',')}|${partnerPlayerIdsSorted.join(',')}`;
      if (seenLeadKeys.has(leadKey)) continue;
      seenLeadKeys.add(leadKey);

      leads.push({
        id: `lead_${userTeamId}_${partnerTeamId}_${myPlayerIdsSorted.join('_')}_${partnerPlayerIdsSorted.join('_')}`,
        partnerTeamId: partnerTeam.id,
        partnerTeamName: partnerTeam.name,
        partnerOwnerName: partnerTeam.claimedBy || partnerTeam.ownerName || 'Opponent',
        myOfferedPlayers: myPlayers,
        partnerOfferedPlayers: partnerPlayers,
        suggestedTradeType,
        myOriginalTradeType: mySwipe.tradeType,
        partnerOriginalTradeType: partnerSwipe.tradeType,
      });
    }
  }

  return leads;
}
