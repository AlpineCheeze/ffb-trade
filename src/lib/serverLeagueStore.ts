import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  League,
  Swipe,
  Match,
  TradeType,
  InternalEloRecord,
  ServerLeagueState,
  ClientLeagueView,
} from '@/types/fantasy';
import { checkForMutualMatch, arraysEqualIgnoreOrder, createSeedOpponentSwipes } from './matchmaking';
import { createMockLeague } from './espn';

// Global in-memory store across Next.js hot reloads and warm serverless invocations
declare global {
  // eslint-disable-next-line no-var
  var __tradeHornyServerStore: Map<string, ServerLeagueState> | undefined;
  // eslint-disable-next-line no-var
  var __tradeHornyWritableDir: string | null | undefined;
}

const memoryStore: Map<string, ServerLeagueState> =
  globalThis.__tradeHornyServerStore || new Map<string, ServerLeagueState>();
globalThis.__tradeHornyServerStore = memoryStore;

/**
 * Strictly sanitize leagueId to prevent path traversal and injection.
 */
export function sanitizeLeagueId(rawId: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32);
  if (!cleaned) {
    throw new Error('Invalid ESPN League ID');
  }
  return cleaned;
}

/**
 * Resolves a writable directory for persistence.
 * Uses `.data/leagues` locally, and automatically falls back to `os.tmpdir()`
 * on read-only serverless filesystems (e.g. Vercel / AWS Lambda).
 */
function getWritableDataDir(): string | null {
  if (globalThis.__tradeHornyWritableDir !== undefined) {
    return globalThis.__tradeHornyWritableDir;
  }

  const candidates = [
    path.join(process.cwd(), '.data', 'leagues'),
    path.join(os.tmpdir(), 'trade-horny', 'leagues'),
  ];

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Verify write access
      const probeFile = path.join(dir, `.write_probe_${process.pid}`);
      fs.writeFileSync(probeFile, 'ok', 'utf-8');
      fs.unlinkSync(probeFile);
      globalThis.__tradeHornyWritableDir = dir;
      return dir;
    } catch {
      // Try next candidate
    }
  }

  globalThis.__tradeHornyWritableDir = null;
  return null;
}

function createInitialServerState(league: League): ServerLeagueState {
  const cleanId = sanitizeLeagueId(league.espnLeagueId);
  const isMock = league.id === 'league_mock_123' || cleanId === '12345678';
  const normalizedLeague: League = {
    ...league,
    espnLeagueId: cleanId,
    inviteCode: league.inviteCode || cleanId,
  };

  if (isMock && normalizedLeague.teams.length >= 3) {
    normalizedLeague.teams[1].isClaimed = true;
    normalizedLeague.teams[1].claimedBy = normalizedLeague.teams[1].claimedBy || 'Dave Miller';
    normalizedLeague.teams[2].isClaimed = true;
    normalizedLeague.teams[2].claimedBy = normalizedLeague.teams[2].claimedBy || 'Sarah Jenkins';
  }

  return {
    league: normalizedLeague,
    swipes: createSeedOpponentSwipes(normalizedLeague),
    matches: [],
    elo: {},
    updatedAt: new Date().toISOString(),
  };
}

function readStateFromDisk(cleanId: string): ServerLeagueState | null {
  const dir = getWritableDataDir();
  if (!dir) return null;

  try {
    const filePath = path.join(dir, `${cleanId}.json`);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Upgrade legacy raw League snapshot if needed
    if (parsed && parsed.espnLeagueId && Array.isArray(parsed.teams) && !parsed.league) {
      const upgraded = createInitialServerState(parsed as League);
      writeStateToDisk(cleanId, upgraded);
      return upgraded;
    }

    if (parsed && parsed.league && Array.isArray(parsed.swipes)) {
      return parsed as ServerLeagueState;
    }
  } catch (err) {
    console.error(`Failed to read server state for league ${cleanId}:`, err);
  }
  return null;
}

function writeStateToDisk(cleanId: string, state: ServerLeagueState): void {
  const dir = getWritableDataDir();
  if (!dir) return;

  try {
    const filePath = path.join(dir, `${cleanId}.json`);
    const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Failed to write server state for league ${cleanId}:`, err);
  }
}

/**
 * Retrieves the full ServerLeagueState (including all swipes, matches, and claims).
 */
export function getServerLeagueState(espnLeagueId: string): ServerLeagueState | null {
  let cleanId: string;
  try {
    cleanId = sanitizeLeagueId(espnLeagueId);
  } catch {
    return null;
  }

  // Always check disk first if available so multi-worker processes stay synchronized
  const diskState = readStateFromDisk(cleanId);
  if (diskState) {
    memoryStore.set(cleanId, diskState);
    return diskState;
  }

  const memState = memoryStore.get(cleanId);
  if (memState) {
    return memState;
  }

  // Auto-seed demo league if requested
  if (cleanId === '12345678') {
    const demoState = createInitialServerState(createMockLeague());
    memoryStore.set(cleanId, demoState);
    writeStateToDisk(cleanId, demoState);
    return demoState;
  }

  return null;
}

export function saveServerLeagueState(state: ServerLeagueState): ServerLeagueState {
  const cleanId = sanitizeLeagueId(state.league.espnLeagueId);
  state.updatedAt = new Date().toISOString();
  memoryStore.set(cleanId, state);
  writeStateToDisk(cleanId, state);
  return state;
}

/**
 * Saves or updates a League snapshot on the server while preserving existing
 * team claims (`isClaimed`, `claimedBy`), active swipes, matches, and Elo ratings.
 */
export function saveServerLeagueSnapshot(freshLeague: League): League {
  const cleanId = sanitizeLeagueId(freshLeague.espnLeagueId);
  const existingState = getServerLeagueState(cleanId);

  if (!existingState) {
    const initial = createInitialServerState(freshLeague);
    saveServerLeagueState(initial);
    return initial.league;
  }

  // Merge team claims onto freshly fetched ESPN teams
  const mergedTeams = freshLeague.teams.map((ft) => {
    const prevTeam = existingState.league.teams.find(
      (pt) => pt.id === ft.id || pt.espnTeamId === ft.espnTeamId
    );
    if (prevTeam && prevTeam.isClaimed) {
      return {
        ...ft,
        isClaimed: true,
        claimedBy: prevTeam.claimedBy,
      };
    }
    return ft;
  });

  const mergedLeague: League = {
    ...freshLeague,
    espnLeagueId: cleanId,
    inviteCode: freshLeague.inviteCode || existingState.league.inviteCode || cleanId,
    teams: mergedTeams,
    lastSyncedAt: new Date().toISOString(),
  };

  // Build lookup of current valid player IDs per team to prune stale swipes after real-life drops/trades
  const teamRosterPlayerIds = new Map<string, Set<string>>();
  for (const team of mergedTeams) {
    teamRosterPlayerIds.set(team.id, new Set(team.roster.map((p) => p.id)));
  }

  const validSwipes = existingState.swipes.filter((s) => {
    const offeringRoster = teamRosterPlayerIds.get(s.teamId);
    const targetRoster = teamRosterPlayerIds.get(s.targetTeamId);
    if (!offeringRoster || !targetRoster) return false;
    const hasAllOffered = s.offeredPlayerIds.every((id) => offeringRoster.has(id));
    const hasAllTarget = s.targetPlayerIds.every((id) => targetRoster.has(id));
    return hasAllOffered && hasAllTarget;
  });

  const updatedState: ServerLeagueState = {
    ...existingState,
    league: mergedLeague,
    swipes: validSwipes,
    updatedAt: new Date().toISOString(),
  };

  saveServerLeagueState(updatedState);
  return mergedLeague;
}

/**
 * Legacy helper returning just the League object from the server snapshot.
 */
export function getServerLeagueSnapshot(espnLeagueId: string): League | null {
  const state = getServerLeagueState(espnLeagueId);
  return state ? state.league : null;
}

/**
 * Atomically claims a team for a manager on the server.
 */
export function claimServerTeam(
  espnLeagueId: string,
  teamId: string,
  claimantName: string,
  fallbackLeague?: League
): ServerLeagueState | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  let state = getServerLeagueState(cleanId);

  if (!state && fallbackLeague) {
    state = createInitialServerState(fallbackLeague);
  }
  if (!state) return null;

  const updatedTeams = state.league.teams.map((t) => {
    if (t.id === teamId) {
      return {
        ...t,
        isClaimed: true,
        claimedBy: claimantName.trim() || t.ownerName || 'Manager',
      };
    }
    return t;
  });

  state.league = {
    ...state.league,
    teams: updatedTeams,
  };

  return saveServerLeagueState(state);
}

/**
 * Updates server-side Elo ratings for a swipe event.
 */
function updateServerElo(
  eloMap: Record<string, InternalEloRecord>,
  offeredPlayerIds: string[],
  targetPlayerIds: string[],
  isInterested: boolean
): void {
  const DEFAULT_ELO = 1500;
  const DEFAULT_K = 32;

  const getRecord = (playerId: string): InternalEloRecord => {
    return (
      eloMap[playerId] || {
        playerId,
        rating: DEFAULT_ELO,
        matchesCount: 0,
        lastUpdated: new Date().toISOString(),
      }
    );
  };

  for (const offeredId of offeredPlayerIds) {
    for (const targetId of targetPlayerIds) {
      const offered = getRecord(offeredId);
      const target = getRecord(targetId);

      const scoreTarget = isInterested ? 1.0 : 0.0;
      const scoreOffered = isInterested ? 0.0 : 1.0;

      const expectedTarget = 1 / (1 + Math.pow(10, (offered.rating - target.rating) / 400));
      const expectedOffered = 1 / (1 + Math.pow(10, (target.rating - offered.rating) / 400));

      const kTarget = target.matchesCount < 10 ? 40 : DEFAULT_K;
      const kOffered = offered.matchesCount < 10 ? 40 : DEFAULT_K;

      eloMap[targetId] = {
        playerId: targetId,
        rating: Math.round(target.rating + kTarget * (scoreTarget - expectedTarget)),
        matchesCount: target.matchesCount + 1,
        lastUpdated: new Date().toISOString(),
      };

      eloMap[offeredId] = {
        playerId: offeredId,
        rating: Math.round(offered.rating + kOffered * (scoreOffered - expectedOffered)),
        matchesCount: offered.matchesCount + 1,
        lastUpdated: new Date().toISOString(),
      };
    }
  }
}

/**
 * Records a swipe on the server, updates internal Elo, and checks for a blind mutual match
 * across all managers' swipes in the league.
 */
export function recordServerSwipe(
  espnLeagueId: string,
  newSwipe: Swipe,
  fallbackLeague?: League
): { state: ServerLeagueState; matchFound: Match | null } | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  let state = getServerLeagueState(cleanId);

  if (!state && fallbackLeague) {
    state = createInitialServerState(fallbackLeague);
  }
  if (!state) return null;

  // Remove any previous identical swipe by this team for the exact same package & target
  state.swipes = state.swipes.filter(
    (s) =>
      !(
        s.teamId === newSwipe.teamId &&
        s.targetTeamId === newSwipe.targetTeamId &&
        s.tradeType === newSwipe.tradeType &&
        arraysEqualIgnoreOrder(s.offeredPlayerIds, newSwipe.offeredPlayerIds) &&
        arraysEqualIgnoreOrder(s.targetPlayerIds, newSwipe.targetPlayerIds)
      )
  );

  state.swipes.push(newSwipe);

  // Update server-side Elo ratings
  updateServerElo(
    state.elo,
    newSwipe.offeredPlayerIds,
    newSwipe.targetPlayerIds,
    newSwipe.isInterested
  );

  // Check for mutual match against all swipes in the league
  let matchFound: Match | null = null;
  if (newSwipe.isInterested) {
    const candidateMatch = checkForMutualMatch(newSwipe, state.swipes, state.league);
    if (candidateMatch) {
      // Avoid duplicate match entries for the same player packages between these two teams
      const alreadyExists = state.matches.some((m) => {
        const mPlayersA = m.teamAPlayers.map((p) => p.id);
        const mPlayersB = m.teamBPlayers.map((p) => p.id);
        const cPlayersA = candidateMatch.teamAPlayers.map((p) => p.id);
        const cPlayersB = candidateMatch.teamBPlayers.map((p) => p.id);

        const sameDirection =
          m.teamAId === candidateMatch.teamAId &&
          m.teamBId === candidateMatch.teamBId &&
          arraysEqualIgnoreOrder(mPlayersA, cPlayersA) &&
          arraysEqualIgnoreOrder(mPlayersB, cPlayersB);

        const reverseDirection =
          m.teamAId === candidateMatch.teamBId &&
          m.teamBId === candidateMatch.teamAId &&
          arraysEqualIgnoreOrder(mPlayersA, cPlayersB) &&
          arraysEqualIgnoreOrder(mPlayersB, cPlayersA);

        return sameDirection || reverseDirection;
      });

      if (!alreadyExists) {
        state.matches = [candidateMatch, ...state.matches];
        matchFound = candidateMatch;
      } else {
        matchFound =
          state.matches.find((m) => {
            const mPlayersA = m.teamAPlayers.map((p) => p.id);
            const mPlayersB = m.teamBPlayers.map((p) => p.id);
            const cPlayersA = candidateMatch.teamAPlayers.map((p) => p.id);
            const cPlayersB = candidateMatch.teamBPlayers.map((p) => p.id);
            return (
              (m.teamAId === candidateMatch.teamAId &&
                m.teamBId === candidateMatch.teamBId &&
                arraysEqualIgnoreOrder(mPlayersA, cPlayersA) &&
                arraysEqualIgnoreOrder(mPlayersB, cPlayersB)) ||
              (m.teamAId === candidateMatch.teamBId &&
                m.teamBId === candidateMatch.teamAId &&
                arraysEqualIgnoreOrder(mPlayersA, cPlayersB) &&
                arraysEqualIgnoreOrder(mPlayersB, cPlayersA))
            );
          }) || candidateMatch;
      }
    }
  }

  saveServerLeagueState(state);
  return { state, matchFound };
}

/**
 * Undoes the most recent swipe for a team & package on the server,
 * and reverts any mutual match it created.
 */
export function undoServerSwipe(
  espnLeagueId: string,
  teamId: string,
  tradeType: TradeType,
  offeredPlayerIds: string[]
): ServerLeagueState | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  const state = getServerLeagueState(cleanId);
  if (!state) return null;

  const matchingSwipes = state.swipes.filter(
    (s) =>
      s.teamId === teamId &&
      s.tradeType === tradeType &&
      arraysEqualIgnoreOrder(s.offeredPlayerIds, offeredPlayerIds)
  );

  if (matchingSwipes.length === 0) {
    return state;
  }

  const lastSwipe = matchingSwipes[matchingSwipes.length - 1];
  state.swipes = state.swipes.filter((s) => s.id !== lastSwipe.id);

  if (lastSwipe.isInterested) {
    state.matches = state.matches.filter((m) => {
      const mTeamAPlayerIds = m.teamAPlayers.map((p) => p.id);
      const mTeamBPlayerIds = m.teamBPlayers.map((p) => p.id);

      const isForwardMatch =
        m.teamAId === lastSwipe.teamId &&
        m.teamBId === lastSwipe.targetTeamId &&
        arraysEqualIgnoreOrder(mTeamAPlayerIds, lastSwipe.offeredPlayerIds) &&
        arraysEqualIgnoreOrder(mTeamBPlayerIds, lastSwipe.targetPlayerIds);

      const isReverseMatch =
        m.teamBId === lastSwipe.teamId &&
        m.teamAId === lastSwipe.targetTeamId &&
        arraysEqualIgnoreOrder(mTeamBPlayerIds, lastSwipe.offeredPlayerIds) &&
        arraysEqualIgnoreOrder(mTeamAPlayerIds, lastSwipe.targetPlayerIds);

      return !(isForwardMatch || isReverseMatch);
    });
  }

  return saveServerLeagueState(state);
}

/**
 * Builds a privacy-safe ClientLeagueView for a specific team.
 * Unreciprocated swipes from other teams are NEVER exposed to the client.
 */
export function toClientLeagueView(
  state: ServerLeagueState,
  teamId?: string | null,
  matchFound?: Match | null
): ClientLeagueView {
  const mySwipes = teamId ? state.swipes.filter((s) => s.teamId === teamId) : [];
  return {
    league: state.league,
    mySwipes,
    matches: state.matches,
    matchFound: matchFound ?? null,
  };
}
