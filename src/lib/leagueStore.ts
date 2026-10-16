import { League, Swipe, Match, TradeType, ClientLeagueView } from '@/types/fantasy';
import { createMockLeague } from './espn';

// In-memory persistent registry for leagues during runtime
const leaguesRegistry = new Map<string, League>();

// Initialize with Demo League
const demoLeague = createMockLeague();
demoLeague.teams[1].isClaimed = true;
demoLeague.teams[1].claimedBy = 'Dave Miller';
demoLeague.teams[2].isClaimed = true;
demoLeague.teams[2].claimedBy = 'Sarah Jenkins';
leaguesRegistry.set(demoLeague.espnLeagueId.trim(), demoLeague);

const LEAGUE_STORAGE_PREFIX = 'tradehorny_league_';
const LEGACY_LEAGUE_STORAGE_PREFIXES = ['tradehonry_league_', 'tradehorney_league_', 'workballs_league_'];
const CLAIM_STORAGE_PREFIX = 'tradehorny_claim_';
const LEGACY_CLAIM_STORAGE_PREFIXES = ['tradehonry_claim_', 'tradehorney_claim_', 'workballs_claim_'];
const SWIPES_STORAGE_PREFIX = 'tradehorny_swipes_';
const MATCHES_STORAGE_PREFIX = 'tradehorny_matches_';
const DELETED_MATCHES_STORAGE_PREFIX = 'tradehorny_deleted_matches_';
const EXCLUDED_TEAMS_STORAGE_PREFIX = 'tradehorny_excluded_teams_';

export function getLeagueById(espnLeagueId: string): League | undefined {
  const cleanId = espnLeagueId.trim();
  const inMemory = leaguesRegistry.get(cleanId);
  if (inMemory) return inMemory;

  // Fallback to browser localStorage if available
  if (typeof window !== 'undefined') {
    try {
      let stored = localStorage.getItem(LEAGUE_STORAGE_PREFIX + cleanId);
      if (!stored) {
        for (const prefix of LEGACY_LEAGUE_STORAGE_PREFIXES) {
          const legacy = localStorage.getItem(prefix + cleanId);
          if (legacy) {
            stored = legacy;
            break;
          }
        }
      }
      if (stored) {
        const parsed = JSON.parse(stored) as League;
        leaguesRegistry.set(cleanId, parsed);
        return parsed;
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  return undefined;
}

export function saveLeague(league: League): League {
  const cleanId = league.espnLeagueId.trim();
  const normalized: League = {
    ...league,
    espnLeagueId: cleanId,
    inviteCode: league.inviteCode || cleanId,
  };

  leaguesRegistry.set(cleanId, normalized);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LEAGUE_STORAGE_PREFIX + cleanId, JSON.stringify(normalized));
    } catch {
      // Ignore localStorage quotas
    }
  }

  return normalized;
}

export function claimTeam(
  espnLeagueId: string,
  teamId: string,
  claimantName: string,
  previousTeamId?: string | null
): League | null {
  const cleanId = espnLeagueId.trim();
  const league = getLeagueById(cleanId);
  if (!league) return null;

  const priorTeamId = previousTeamId ?? getStoredUserClaim(cleanId);

  const updatedTeams = league.teams.map((t) => {
    if (priorTeamId && priorTeamId !== teamId && t.id === priorTeamId) {
      return {
        ...t,
        isClaimed: false,
        claimedBy: undefined,
      };
    }
    if (t.id === teamId) {
      return {
        ...t,
        isClaimed: true,
        claimedBy: claimantName.trim() || t.ownerName,
      };
    }
    return t;
  });

  const updatedLeague: League = {
    ...league,
    teams: updatedTeams,
  };

  leaguesRegistry.set(cleanId, updatedLeague);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LEAGUE_STORAGE_PREFIX + cleanId, JSON.stringify(updatedLeague));
      localStorage.setItem(CLAIM_STORAGE_PREFIX + cleanId, teamId);
    } catch {
      // Ignore localStorage errors
    }
  }

  return updatedLeague;
}

export function getStoredUserClaim(espnLeagueId: string): string | null {
  if (typeof window !== 'undefined') {
    try {
      const clean = espnLeagueId.trim();
      const current = localStorage.getItem(CLAIM_STORAGE_PREFIX + clean);
      if (current) return current;
      for (const prefix of LEGACY_CLAIM_STORAGE_PREFIXES) {
        const legacy = localStorage.getItem(prefix + clean);
        if (legacy) return legacy;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export function getLocalSwipes(espnLeagueId: string): Swipe[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SWIPES_STORAGE_PREFIX + espnLeagueId.trim());
    return raw ? (JSON.parse(raw) as Swipe[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalSwipes(espnLeagueId: string, swipes: Swipe[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SWIPES_STORAGE_PREFIX + espnLeagueId.trim(), JSON.stringify(swipes));
  } catch {
    // Ignore localStorage errors
  }
}

export function getLocalMatches(espnLeagueId: string): Match[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MATCHES_STORAGE_PREFIX + espnLeagueId.trim());
    return raw ? (JSON.parse(raw) as Match[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalMatches(espnLeagueId: string, matches: Match[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MATCHES_STORAGE_PREFIX + espnLeagueId.trim(), JSON.stringify(matches));
  } catch {
    // Ignore localStorage errors
  }
}

export function getLocalDeletedMatches(espnLeagueId: string): Match[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_MATCHES_STORAGE_PREFIX + espnLeagueId.trim());
    return raw ? (JSON.parse(raw) as Match[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalDeletedMatches(espnLeagueId: string, deletedMatches: Match[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      DELETED_MATCHES_STORAGE_PREFIX + espnLeagueId.trim(),
      JSON.stringify(deletedMatches)
    );
  } catch {
    // Ignore localStorage errors
  }
}

export function getLocalExcludedTeamIds(espnLeagueId: string, userTeamId?: string | null): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = userTeamId
      ? `${EXCLUDED_TEAMS_STORAGE_PREFIX}${espnLeagueId.trim()}_${userTeamId.trim()}`
      : `${EXCLUDED_TEAMS_STORAGE_PREFIX}${espnLeagueId.trim()}`;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalExcludedTeamIds(
  espnLeagueId: string,
  excludedIds: string[],
  userTeamId?: string | null
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = userTeamId
      ? `${EXCLUDED_TEAMS_STORAGE_PREFIX}${espnLeagueId.trim()}_${userTeamId.trim()}`
      : `${EXCLUDED_TEAMS_STORAGE_PREFIX}${espnLeagueId.trim()}`;
    localStorage.setItem(key, JSON.stringify(excludedIds));
  } catch {
    // Ignore localStorage errors
  }
}

export function getAllRegisteredLeagues(): League[] {
  return Array.from(leaguesRegistry.values());
}

export function getSavedLeagues(): League[] {
  const leagues: League[] = [];
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith(LEAGUE_STORAGE_PREFIX) ||
            LEGACY_LEAGUE_STORAGE_PREFIXES.some((p) => key.startsWith(p)))
        ) {
          const item = localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item) as League;
            if (
              parsed &&
              parsed.espnLeagueId &&
              parsed.id !== 'league_mock_123' &&
              parsed.espnLeagueId !== '12345678'
            ) {
              if (!leagues.some((l) => l.espnLeagueId === parsed.espnLeagueId)) {
                leagues.push(parsed);
              }
            }
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }
  return leagues;
}

/**
 * Synchronizes league state (team claims, user's swipes, confirmed matches, and deleted matches) with the backend server.
 */
export async function syncLeagueStateWithServer(
  league: League,
  teamId?: string | null
): Promise<ClientLeagueView | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_state',
        leagueId: league.espnLeagueId,
        teamId: teamId || undefined,
        fallbackLeague: league,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.league) {
      saveLeague(data.league);
      if (Array.isArray(data.mySwipes)) saveLocalSwipes(league.espnLeagueId, data.mySwipes);
      if (Array.isArray(data.matches)) saveLocalMatches(league.espnLeagueId, data.matches);
      if (Array.isArray(data.deletedMatches)) {
        saveLocalDeletedMatches(league.espnLeagueId, data.deletedMatches);
      }
      return {
        league: data.league,
        mySwipes: data.mySwipes || [],
        matches: data.matches || [],
        deletedMatches: data.deletedMatches || [],
      };
    }
  } catch {
    // Fallback to local state if offline
  }
  return null;
}

/**
 * Claims a team on both local storage and the backend server so all leaguemates see it.
 */
export async function claimTeamOnServer(
  espnLeagueId: string,
  teamId: string,
  claimantName: string,
  fallbackLeague?: League,
  previousTeamId?: string | null
): Promise<ClientLeagueView | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'claim',
        leagueId: espnLeagueId,
        teamId,
        claimantName,
        previousTeamId: previousTeamId || undefined,
        fallbackLeague,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.league) {
      saveLeague(data.league);
      if (Array.isArray(data.mySwipes)) saveLocalSwipes(espnLeagueId, data.mySwipes);
      if (Array.isArray(data.matches)) saveLocalMatches(espnLeagueId, data.matches);
      if (Array.isArray(data.deletedMatches)) {
        saveLocalDeletedMatches(espnLeagueId, data.deletedMatches);
      }
      return {
        league: data.league,
        mySwipes: data.mySwipes || [],
        matches: data.matches || [],
        deletedMatches: data.deletedMatches || [],
      };
    }
  } catch {
    // Fallback to local state if offline
  }
  return null;
}

/**
 * Records a swipe on the backend server and checks for a blind mutual match across all leaguemates.
 */
export async function recordSwipeOnServer(
  espnLeagueId: string,
  swipe: Swipe,
  fallbackLeague?: League
): Promise<ClientLeagueView | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'swipe',
        leagueId: espnLeagueId,
        swipe,
        fallbackLeague,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.league) {
      saveLeague(data.league);
      if (Array.isArray(data.mySwipes)) saveLocalSwipes(espnLeagueId, data.mySwipes);
      if (Array.isArray(data.matches)) saveLocalMatches(espnLeagueId, data.matches);
      if (Array.isArray(data.deletedMatches)) {
        saveLocalDeletedMatches(espnLeagueId, data.deletedMatches);
      }
      return {
        league: data.league,
        mySwipes: data.mySwipes || [],
        matches: data.matches || [],
        deletedMatches: data.deletedMatches || [],
        matchFound: data.matchFound || null,
      };
    }
  } catch {
    // Fallback to local state if offline
  }
  return null;
}

/**
 * Undoes the most recent swipe on the backend server.
 */
export async function undoSwipeOnServer(
  espnLeagueId: string,
  teamId: string,
  tradeType: TradeType,
  offeredPlayerIds: string[]
): Promise<ClientLeagueView | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'undo',
        leagueId: espnLeagueId,
        teamId,
        tradeType,
        offeredPlayerIds,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.league) {
      saveLeague(data.league);
      if (Array.isArray(data.mySwipes)) saveLocalSwipes(espnLeagueId, data.mySwipes);
      if (Array.isArray(data.matches)) saveLocalMatches(espnLeagueId, data.matches);
      if (Array.isArray(data.deletedMatches)) {
        saveLocalDeletedMatches(espnLeagueId, data.deletedMatches);
      }
      return {
        league: data.league,
        mySwipes: data.mySwipes || [],
        matches: data.matches || [],
        deletedMatches: data.deletedMatches || [],
      };
    }
  } catch {
    // Fallback to local state if offline
  }
  return null;
}

/**
 * Deletes a single match on the backend server for both involved teams and archives it under deletedMatches.
 */
export async function deleteMatchOnServer(
  espnLeagueId: string,
  teamId: string,
  matchId: string,
  fallbackLeague?: League,
  matchSnapshot?: Match
): Promise<ClientLeagueView | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_match',
        leagueId: espnLeagueId,
        teamId,
        matchId,
        fallbackLeague,
        matchSnapshot,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.league) {
      saveLeague(data.league);
      if (Array.isArray(data.mySwipes)) saveLocalSwipes(espnLeagueId, data.mySwipes);
      if (Array.isArray(data.matches)) saveLocalMatches(espnLeagueId, data.matches);
      if (Array.isArray(data.deletedMatches)) {
        saveLocalDeletedMatches(espnLeagueId, data.deletedMatches);
      }
      return {
        league: data.league,
        mySwipes: data.mySwipes || [],
        matches: data.matches || [],
        deletedMatches: data.deletedMatches || [],
      };
    }
  } catch {
    // Fallback to local state if offline
  }
  return null;
}

/**
 * Deletes ALL active matches for `teamId` on the backend server (and for each matched partner)
 * and archives them under deletedMatches.
 */
export async function deleteAllMatchesOnServer(
  espnLeagueId: string,
  teamId: string,
  fallbackLeague?: League,
  clientMatches?: Match[]
): Promise<ClientLeagueView | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_all_matches',
        leagueId: espnLeagueId,
        teamId,
        fallbackLeague,
        clientMatches,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.league) {
      saveLeague(data.league);
      if (Array.isArray(data.mySwipes)) saveLocalSwipes(espnLeagueId, data.mySwipes);
      if (Array.isArray(data.matches)) saveLocalMatches(espnLeagueId, data.matches);
      if (Array.isArray(data.deletedMatches)) {
        saveLocalDeletedMatches(espnLeagueId, data.deletedMatches);
      }
      return {
        league: data.league,
        mySwipes: data.mySwipes || [],
        matches: data.matches || [],
        deletedMatches: data.deletedMatches || [],
      };
    }
  } catch {
    // Fallback to local state if offline
  }
  return null;
}
