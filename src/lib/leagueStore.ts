import { League } from '@/types/fantasy';
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

export function claimTeam(espnLeagueId: string, teamId: string, claimantName: string): League | null {
  const cleanId = espnLeagueId.trim();
  const league = getLeagueById(cleanId);
  if (!league) return null;

  const updatedTeams = league.teams.map((t) => {
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
