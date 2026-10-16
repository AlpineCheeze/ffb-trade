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
import { clearAllServerUsers } from './serverUserStore';

// Global in-memory store across Next.js hot reloads and warm serverless invocations
declare global {
  // eslint-disable-next-line no-var
  var __tradeHornyServerStore: Map<string, ServerLeagueState> | undefined;
  // eslint-disable-next-line no-var
  var __tradeHornyWritableDir: string | null | undefined;
  // eslint-disable-next-line no-var
  var __tradeHornyCleanSlateV1Run: boolean | undefined;
}

const memoryStore: Map<string, ServerLeagueState> =
  globalThis.__tradeHornyServerStore || new Map<string, ServerLeagueState>();
globalThis.__tradeHornyServerStore = memoryStore;

/**
 * Strictly validate leagueId to prevent path traversal and injection.
 * Rejects any string containing characters outside [a-zA-Z0-9_-].
 */
export function sanitizeLeagueId(rawId: string): string {
  const trimmed = String(rawId ?? '').trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]{1,32}$/.test(trimmed)) {
    throw new Error('Invalid ESPN League ID');
  }
  return trimmed;
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
    // Optional override for hosted deployments with a persistent volume (e.g. DATA_DIR=/data)
    ...(process.env.DATA_DIR ? [path.join(process.env.DATA_DIR, 'leagues')] : []),
    path.join(process.cwd(), '.data', 'leagues'),
    path.join(os.tmpdir(), 'trade-horny', 'leagues'),
  ];

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
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

function createInitialServerState(league: League, forcedCleanId?: string): ServerLeagueState {
  const cleanId = forcedCleanId || sanitizeLeagueId(league.espnLeagueId);
  const isMock = league.id === 'league_mock_123' || cleanId === '12345678';
  const normalizedLeague: League = {
    ...league,
    id: isMock ? 'league_mock_123' : `league_${cleanId}`,
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
    deletedMatches: [],
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
      const upgraded = createInitialServerState(parsed as League, cleanId);
      writeStateToDisk(cleanId, upgraded);
      return upgraded;
    }

    if (parsed && parsed.league && Array.isArray(parsed.swipes)) {
      if (!Array.isArray(parsed.deletedMatches)) {
        parsed.deletedMatches = [];
      }
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
  ensureCleanSlateMigration();

  let cleanId: string;
  try {
    cleanId = sanitizeLeagueId(espnLeagueId);
  } catch {
    return null;
  }

  const writableDir = getWritableDataDir();
  if (writableDir) {
    const diskState = readStateFromDisk(cleanId);
    if (diskState) {
      memoryStore.set(cleanId, diskState);
      return diskState;
    }
    // If disk directory is active and file does not exist on disk, evict any stale memory entry
    memoryStore.delete(cleanId);
  } else {
    const memState = memoryStore.get(cleanId);
    if (memState) {
      return memState;
    }
  }

  // Auto-seed demo league if requested
  if (cleanId === '12345678') {
    const demoState = createInitialServerState(createMockLeague(), '12345678');
    memoryStore.set(cleanId, demoState);
    writeStateToDisk(cleanId, demoState);
    return demoState;
  }

  return null;
}

export function saveServerLeagueState(state: ServerLeagueState): ServerLeagueState {
  const cleanId = sanitizeLeagueId(state.league.espnLeagueId);
  state.updatedAt = new Date().toISOString();
  if (!Array.isArray(state.deletedMatches)) {
    state.deletedMatches = [];
  }
  memoryStore.set(cleanId, state);
  writeStateToDisk(cleanId, state);
  return state;
}

/**
 * Saves or updates a League snapshot on the server while preserving existing
 * team claims (`isClaimed`, `claimedBy`), active swipes, matches, and Elo ratings.
 * Prunes any stale swipes or matches whose players are no longer on those teams.
 */
export function saveServerLeagueSnapshot(freshLeague: League, forcedCleanId?: string): League {
  const cleanId = forcedCleanId ? sanitizeLeagueId(forcedCleanId) : sanitizeLeagueId(freshLeague.espnLeagueId);
  const safeFreshLeague: League = {
    ...freshLeague,
    espnLeagueId: cleanId,
  };
  const existingState = getServerLeagueState(cleanId);

  if (!existingState) {
    const initial = createInitialServerState(safeFreshLeague, cleanId);
    saveServerLeagueState(initial);
    return initial.league;
  }

  // Merge team claims onto freshly fetched ESPN teams
  const mergedTeams = safeFreshLeague.teams.map((ft) => {
    const prevTeam = existingState.league.teams.find(
      (pt) => pt.id === ft.id || pt.espnTeamId === ft.espnTeamId
    );
    if (prevTeam && prevTeam.isClaimed) {
      return {
        ...ft,
        isClaimed: true,
        claimedBy: prevTeam.claimedBy,
        claimedByUserId: prevTeam.claimedByUserId,
      };
    }
    return ft;
  });

  const mergedLeague: League = {
    ...safeFreshLeague,
    espnLeagueId: cleanId,
    inviteCode: safeFreshLeague.inviteCode || existingState.league.inviteCode || cleanId,
    teams: mergedTeams,
    lastSyncedAt: new Date().toISOString(),
  };

  // Build lookup of current valid player IDs per team to prune stale swipes & matches after real-life drops/trades
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

  const validMatches = existingState.matches.filter((m) => {
    const rosterA = teamRosterPlayerIds.get(m.teamAId);
    const rosterB = teamRosterPlayerIds.get(m.teamBId);
    if (!rosterA || !rosterB) return false;
    const hasAllA = m.teamAPlayers.every((p) => rosterA.has(p.id));
    const hasAllB = m.teamBPlayers.every((p) => rosterB.has(p.id));
    return hasAllA && hasAllB;
  });

  const updatedState: ServerLeagueState = {
    ...existingState,
    league: mergedLeague,
    swipes: validSwipes,
    matches: validMatches,
    deletedMatches: existingState.deletedMatches || [],
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
 * Atomically claims a team for a manager on the server, releasing their previous team claim if switching.
 */
export function claimServerTeam(
  espnLeagueId: string,
  teamId: string,
  claimantName: string,
  fallbackLeague?: League,
  previousTeamId?: string | null,
  userId?: string | null
): ServerLeagueState | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  let state = getServerLeagueState(cleanId);

  if (!state && fallbackLeague && Array.isArray(fallbackLeague.teams)) {
    state = createInitialServerState({ ...fallbackLeague, espnLeagueId: cleanId }, cleanId);
  }
  if (!state) return null;

  const targetTeam = state.league.teams.find((t) => t.id === teamId);
  if (!targetTeam) {
    return null;
  }

  const normalizedClaimant = claimantName.trim() || targetTeam.ownerName || 'Manager';
  const cleanUserId = userId ? String(userId).trim() : undefined;

  // Prevent overwriting a team already claimed by a different user account or manager
  if (targetTeam.isClaimed) {
    // Prevent unauthenticated requests from overwriting an authenticated claim
    if (!cleanUserId && targetTeam.claimedByUserId) {
      return state;
    }
    if (cleanUserId && targetTeam.claimedByUserId && targetTeam.claimedByUserId !== cleanUserId) {
      return state;
    }
    if (
      !targetTeam.claimedByUserId &&
      targetTeam.claimedBy &&
      targetTeam.claimedBy.trim().toLowerCase() !== normalizedClaimant.toLowerCase()
    ) {
      return state;
    }
  }

  const updatedTeams = state.league.teams.map((t) => {
    // Release previous team only if the manager is switching teams (by previousTeamId or same userId)
    const isPreviousTeam =
      t.id !== teamId &&
      Boolean(
        (previousTeamId && t.id === previousTeamId) ||
          (cleanUserId && t.claimedByUserId === cleanUserId)
      );

    if (isPreviousTeam) {
      return {
        ...t,
        isClaimed: false,
        claimedBy: undefined,
        claimedByUserId: undefined,
      };
    }
    if (t.id === teamId) {
      return {
        ...t,
        isClaimed: true,
        claimedBy: normalizedClaimant,
        claimedByUserId: cleanUserId || t.claimedByUserId,
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
 * Updates server-side Elo ratings symmetrically using package average ratings.
 */
function updateServerElo(
  eloMap: Record<string, InternalEloRecord>,
  offeredPlayerIds: string[],
  targetPlayerIds: string[],
  isInterested: boolean
): void {
  if (offeredPlayerIds.length === 0 || targetPlayerIds.length === 0) return;

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

  const offeredRecords = offeredPlayerIds.map(getRecord);
  const targetRecords = targetPlayerIds.map(getRecord);

  // Compare composite package averages so multi-player packages update symmetrically
  const avgOfferedRating =
    offeredRecords.reduce((sum, r) => sum + r.rating, 0) / offeredRecords.length;
  const avgTargetRating =
    targetRecords.reduce((sum, r) => sum + r.rating, 0) / targetRecords.length;

  const scoreTarget = isInterested ? 1.0 : 0.0;
  const scoreOffered = isInterested ? 0.0 : 1.0;

  const expectedTarget = 1 / (1 + Math.pow(10, (avgOfferedRating - avgTargetRating) / 400));
  const expectedOffered = 1 / (1 + Math.pow(10, (avgTargetRating - avgOfferedRating) / 400));

  const nowIso = new Date().toISOString();

  for (const rec of targetRecords) {
    const k = rec.matchesCount < 10 ? 40 : DEFAULT_K;
    eloMap[rec.playerId] = {
      playerId: rec.playerId,
      rating: Math.round(rec.rating + k * (scoreTarget - expectedTarget)),
      matchesCount: rec.matchesCount + 1,
      lastUpdated: nowIso,
    };
  }

  for (const rec of offeredRecords) {
    const k = rec.matchesCount < 10 ? 40 : DEFAULT_K;
    eloMap[rec.playerId] = {
      playerId: rec.playerId,
      rating: Math.round(rec.rating + k * (scoreOffered - expectedOffered)),
      matchesCount: rec.matchesCount + 1,
      lastUpdated: nowIso,
    };
  }
}

/**
 * Records a swipe on the server, updates internal Elo, and checks for a blind mutual match
 * across all managers' swipes in the league.
 */
export function recordServerSwipe(
  espnLeagueId: string,
  rawSwipe: Swipe,
  fallbackLeague?: League
): { state: ServerLeagueState; matchFound: Match | null } | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  let state = getServerLeagueState(cleanId);

  if (!state && fallbackLeague && Array.isArray(fallbackLeague.teams)) {
    state = createInitialServerState({ ...fallbackLeague, espnLeagueId: cleanId }, cleanId);
  }
  if (!state) return null;

  // Reject self-swipes
  if (rawSwipe.teamId === rawSwipe.targetTeamId) {
    return null;
  }

  // Ensure valid non-empty swipe ID
  const newSwipe: Swipe = {
    ...rawSwipe,
    id:
      typeof rawSwipe.id === 'string' && rawSwipe.id.trim()
        ? rawSwipe.id.trim()
        : `swipe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: rawSwipe.createdAt || new Date().toISOString(),
  };

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

  let matchFound: Match | null = null;
  if (newSwipe.isInterested) {
    const candidateMatch = checkForMutualMatch(newSwipe, state.swipes, state.league);
    if (candidateMatch) {
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
        // If this trade pair was previously deleted, remove its old deleted record now that both managers re-matched
        if (Array.isArray(state.deletedMatches)) {
          const cPlayersA = candidateMatch.teamAPlayers.map((p) => p.id);
          const cPlayersB = candidateMatch.teamBPlayers.map((p) => p.id);
          state.deletedMatches = state.deletedMatches.filter((dm) => {
            const dmPlayersA = dm.teamAPlayers.map((p) => p.id);
            const dmPlayersB = dm.teamBPlayers.map((p) => p.id);
            const sameDir =
              dm.teamAId === candidateMatch.teamAId &&
              dm.teamBId === candidateMatch.teamBId &&
              arraysEqualIgnoreOrder(dmPlayersA, cPlayersA) &&
              arraysEqualIgnoreOrder(dmPlayersB, cPlayersB);
            const revDir =
              dm.teamAId === candidateMatch.teamBId &&
              dm.teamBId === candidateMatch.teamAId &&
              arraysEqualIgnoreOrder(dmPlayersA, cPlayersB) &&
              arraysEqualIgnoreOrder(dmPlayersB, cPlayersA);
            return !(sameDir || revDir);
          });
        }
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
  } else {
    // If overwriting a previously interested swipe with a Pass (isInterested: false),
    // remove any match that depended on this swipe
    state.matches = state.matches.filter((m) => {
      const mTeamAPlayerIds = m.teamAPlayers.map((p) => p.id);
      const mTeamBPlayerIds = m.teamBPlayers.map((p) => p.id);

      const isForwardMatch =
        m.teamAId === newSwipe.teamId &&
        m.teamBId === newSwipe.targetTeamId &&
        arraysEqualIgnoreOrder(mTeamAPlayerIds, newSwipe.offeredPlayerIds) &&
        arraysEqualIgnoreOrder(mTeamBPlayerIds, newSwipe.targetPlayerIds);

      const isReverseMatch =
        m.teamBId === newSwipe.teamId &&
        m.teamAId === newSwipe.targetTeamId &&
        arraysEqualIgnoreOrder(mTeamBPlayerIds, newSwipe.offeredPlayerIds) &&
        arraysEqualIgnoreOrder(mTeamAPlayerIds, newSwipe.targetPlayerIds);

      return !(isForwardMatch || isReverseMatch);
    });
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

  let lastMatchIndex = -1;
  for (let i = state.swipes.length - 1; i >= 0; i--) {
    const s = state.swipes[i];
    if (
      s.teamId === teamId &&
      s.tradeType === tradeType &&
      arraysEqualIgnoreOrder(s.offeredPlayerIds, offeredPlayerIds)
    ) {
      lastMatchIndex = i;
      break;
    }
  }

  if (lastMatchIndex === -1) {
    return state;
  }

  const lastSwipe = state.swipes[lastMatchIndex];
  state.swipes.splice(lastMatchIndex, 1);

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

function isSameTradeMatch(a: Match, b: Match): boolean {
  if (a.id === b.id) return true;
  const aPlayersA = a.teamAPlayers.map((p) => p.id);
  const aPlayersB = a.teamBPlayers.map((p) => p.id);
  const bPlayersA = b.teamAPlayers.map((p) => p.id);
  const bPlayersB = b.teamBPlayers.map((p) => p.id);

  const sameDir =
    a.teamAId === b.teamAId &&
    a.teamBId === b.teamBId &&
    arraysEqualIgnoreOrder(aPlayersA, bPlayersA) &&
    arraysEqualIgnoreOrder(aPlayersB, bPlayersB);

  const revDir =
    a.teamAId === b.teamBId &&
    a.teamBId === b.teamAId &&
    arraysEqualIgnoreOrder(aPlayersA, bPlayersB) &&
    arraysEqualIgnoreOrder(aPlayersB, bPlayersA);

  return sameDir || revDir;
}

/**
 * Deletes a single match on behalf of `teamId`, removing it from active `matches` for both
 * involved teams, archiving it in `deletedMatches` for both teams, and marking `teamId`'s
 * corresponding swipe as passed (`isInterested: false`) so it doesn't auto-rematch.
 */
export function deleteServerMatch(
  espnLeagueId: string,
  teamId: string,
  matchId: string,
  fallbackLeague?: League,
  matchSnapshot?: Match
): ServerLeagueState | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  let state = getServerLeagueState(cleanId);

  if (!state && fallbackLeague && Array.isArray(fallbackLeague.teams)) {
    state = createInitialServerState({ ...fallbackLeague, espnLeagueId: cleanId }, cleanId);
  }
  if (!state) return null;

  let targetMatch = state.matches.find(
    (m) =>
      (m.id === matchId || (matchSnapshot && isSameTradeMatch(m, matchSnapshot))) &&
      (m.teamAId === teamId || m.teamBId === teamId)
  );

  if (
    !targetMatch &&
    matchSnapshot &&
    (matchSnapshot.teamAId === teamId || matchSnapshot.teamBId === teamId)
  ) {
    targetMatch = matchSnapshot;
  }

  if (!targetMatch) {
    return state;
  }

  const deletingTeam = state.league.teams.find((t) => t.id === teamId);
  const deletedByName = deletingTeam?.claimedBy || deletingTeam?.ownerName || 'Manager';
  const nowIso = new Date().toISOString();

  const archivedMatch: Match = {
    ...targetMatch,
    deletedAt: nowIso,
    deletedByTeamId: teamId,
    deletedByName,
  };

  // Remove from active matches for both teams
  state.matches = state.matches.filter((m) => !isSameTradeMatch(m, targetMatch!));

  // Add to deletedMatches archive (deduplicating any older archive of the same trade)
  const existingDeleted = Array.isArray(state.deletedMatches) ? state.deletedMatches : [];
  state.deletedMatches = [
    archivedMatch,
    ...existingDeleted.filter((dm) => !isSameTradeMatch(dm, archivedMatch)),
  ];

  // Mark deleting team's swipe for this trade as not interested so it won't auto-retrigger
  const isDeletingTeamA = targetMatch.teamAId === teamId;
  const myOfferedIds = (isDeletingTeamA ? targetMatch.teamAPlayers : targetMatch.teamBPlayers).map(
    (p) => p.id
  );
  const partnerTargetIds = (isDeletingTeamA ? targetMatch.teamBPlayers : targetMatch.teamAPlayers).map(
    (p) => p.id
  );
  const partnerTeamId = isDeletingTeamA ? targetMatch.teamBId : targetMatch.teamAId;

  state.swipes = state.swipes.map((s) => {
    if (
      s.teamId === teamId &&
      s.targetTeamId === partnerTeamId &&
      s.isInterested &&
      arraysEqualIgnoreOrder(s.offeredPlayerIds, myOfferedIds) &&
      arraysEqualIgnoreOrder(s.targetPlayerIds, partnerTargetIds)
    ) {
      return { ...s, isInterested: false };
    }
    return s;
  });

  return saveServerLeagueState(state);
}

/**
 * Deletes ALL active matches involving `teamId`, removing them from active `matches`
 * for both `teamId` and each matched partner, and archiving them under `deletedMatches`.
 */
export function deleteAllServerMatches(
  espnLeagueId: string,
  teamId: string,
  fallbackLeague?: League,
  clientMatches?: Match[]
): ServerLeagueState | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  let state = getServerLeagueState(cleanId);

  if (!state && fallbackLeague && Array.isArray(fallbackLeague.teams)) {
    state = createInitialServerState({ ...fallbackLeague, espnLeagueId: cleanId }, cleanId);
  }
  if (!state) return null;

  const serverTeamMatches = state.matches.filter(
    (m) => m.teamAId === teamId || m.teamBId === teamId
  );

  // Merge any client-provided matches (e.g. demo seed matches) that involve this team
  const combinedToDelete: Match[] = [...serverTeamMatches];
  if (Array.isArray(clientMatches)) {
    for (const cm of clientMatches) {
      if (
        cm &&
        (cm.teamAId === teamId || cm.teamBId === teamId) &&
        !combinedToDelete.some((existing) => isSameTradeMatch(existing, cm))
      ) {
        combinedToDelete.push(cm);
      }
    }
  }

  if (combinedToDelete.length === 0) {
    return state;
  }

  const deletingTeam = state.league.teams.find((t) => t.id === teamId);
  const deletedByName = deletingTeam?.claimedBy || deletingTeam?.ownerName || 'Manager';
  const nowIso = new Date().toISOString();

  const newlyArchived: Match[] = combinedToDelete.map((m) => ({
    ...m,
    deletedAt: nowIso,
    deletedByTeamId: teamId,
    deletedByName,
  }));

  // Remove all matches involving teamId from active matches
  state.matches = state.matches.filter(
    (m) => m.teamAId !== teamId && m.teamBId !== teamId
  );

  // Prepend newly archived matches to deletedMatches
  const existingDeleted = Array.isArray(state.deletedMatches) ? state.deletedMatches : [];
  const filteredExistingDeleted = existingDeleted.filter(
    (dm) => !newlyArchived.some((na) => isSameTradeMatch(dm, na))
  );
  state.deletedMatches = [...newlyArchived, ...filteredExistingDeleted];

  // Flip deleting user's swipes for all deleted matches to isInterested: false
  for (const m of combinedToDelete) {
    const isDeletingTeamA = m.teamAId === teamId;
    const myOfferedIds = (isDeletingTeamA ? m.teamAPlayers : m.teamBPlayers).map((p) => p.id);
    const partnerTargetIds = (isDeletingTeamA ? m.teamBPlayers : m.teamAPlayers).map((p) => p.id);
    const partnerTeamId = isDeletingTeamA ? m.teamBId : m.teamAId;

    state.swipes = state.swipes.map((s) => {
      if (
        s.teamId === teamId &&
        s.targetTeamId === partnerTeamId &&
        s.isInterested &&
        arraysEqualIgnoreOrder(s.offeredPlayerIds, myOfferedIds) &&
        arraysEqualIgnoreOrder(s.targetPlayerIds, partnerTargetIds)
      ) {
        return { ...s, isInterested: false };
      }
      return s;
    });
  }

  return saveServerLeagueState(state);
}

/**
 * Resets all recorded swipes and mutual matches for an entire league, starting fresh.
 * Preserves league metadata, rosters, and all team claims (isClaimed, claimedBy, claimedByUserId)
 * so leaguemates do not have to reclaim their teams.
 * For the mock demo league, restores initial seed opponent swipes so demo trades work;
 * for real leagues, sets swipes and matches to empty arrays.
 */
export function resetServerLeagueSwipes(
  espnLeagueId: string,
  fallbackLeague?: League
): ServerLeagueState | null {
  const cleanId = sanitizeLeagueId(espnLeagueId);
  let state = getServerLeagueState(cleanId);

  if (!state && fallbackLeague && Array.isArray(fallbackLeague.teams)) {
    state = createInitialServerState({ ...fallbackLeague, espnLeagueId: cleanId }, cleanId);
  }
  if (!state) return null;

  const isMock = state.league.id === 'league_mock_123' || cleanId === '12345678';

  state.swipes = isMock ? createSeedOpponentSwipes(state.league) : [];
  state.matches = [];
  state.deletedMatches = [];
  state.elo = {};
  state.updatedAt = new Date().toISOString();

  return saveServerLeagueState(state);
}

/**
 * Deletes a league state from memory and persistent disk (used for cleanup and testing).
 */
export function deleteServerLeagueState(espnLeagueId: string): boolean {
  try {
    const cleanId = sanitizeLeagueId(espnLeagueId);
    memoryStore.delete(cleanId);
    const dir = getWritableDataDir();
    if (dir) {
      const filePath = path.join(dir, `${cleanId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    return true;
  } catch {
    return false;
  }
}

const SENTINEL_FILE = '.clean_slate_20261016';

function getCandidateDataDirs(): string[] {
  return [
    ...(process.env.DATA_DIR ? [process.env.DATA_DIR] : []),
    path.join(process.cwd(), '.data'),
    path.join(os.tmpdir(), 'trade-horny'),
  ];
}

/**
 * Automatically executes a one-time clean-slate migration on server startup
 * (locally and when deployed to Railway production).
 * Purges any stale test leagues, users, swipes, and claims while re-seeding
 * the clean demo league (12345678).
 */
export function ensureCleanSlateMigration(): { executed: boolean } {
  if (globalThis.__tradeHornyCleanSlateV1Run) {
    return { executed: false };
  }
  globalThis.__tradeHornyCleanSlateV1Run = true;

  const candidateDirs = getCandidateDataDirs();
  let hasSentinel = false;

  for (const dir of candidateDirs) {
    const sentinelPath = path.join(dir, SENTINEL_FILE);
    if (fs.existsSync(sentinelPath)) {
      hasSentinel = true;
      break;
    }
  }

  if (hasSentinel) {
    return { executed: false };
  }

  console.log('[Migration] Clean slate marker not found. Running automatic one-time data purge...');
  try {
    clearAllServerLeagues();
    clearAllServerUsers();

    for (const dir of candidateDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(dir, SENTINEL_FILE),
          `Clean slate initialized at ${new Date().toISOString()}\n`,
          'utf-8'
        );
      } catch (err) {
        console.error(`[Migration] Failed to write sentinel in ${dir}:`, err);
      }
    }
    console.log('[Migration] Clean slate migration completed successfully.');
    return { executed: true };
  } catch (err) {
    console.error('[Migration] Error during clean slate migration:', err);
    return { executed: false };
  }
}

/**
 * Completely clears all stored league data from memory and disk across all candidates.
 * Wipes all user test leagues, active swipes, and matches.
 * Re-seeds the demo league (12345678) with a fresh, clean sandbox state.
 */
export function clearAllServerLeagues(): { deletedLeagues: string[]; demoReseeded: boolean } {
  const candidateDirs = [
    ...(process.env.DATA_DIR ? [path.join(process.env.DATA_DIR, 'leagues')] : []),
    path.join(process.cwd(), '.data', 'leagues'),
    path.join(os.tmpdir(), 'trade-horny', 'leagues'),
  ];
  const deletedSet = new Set<string>();
  memoryStore.clear();

  for (const dir of candidateDirs) {
    if (dir && fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if ((file.endsWith('.json') || file.includes('.tmp.')) && !file.startsWith('.')) {
            try {
              if (file.endsWith('.json')) {
                const leagueId = file.replace(/\.json$/, '');
                deletedSet.add(leagueId);
              }
              fs.unlinkSync(path.join(dir, file));
            } catch (e) {
              console.error(`Failed to delete league file ${file}:`, e);
            }
          }
        }
      } catch (e) {
        console.error('Failed to read leagues directory for clearing:', e);
      }
    }
  }

  // Re-seed demo league 12345678 with a clean initial state
  const demoState = getServerLeagueState('12345678');

  return {
    deletedLeagues: Array.from(deletedSet),
    demoReseeded: demoState !== null,
  };
}

/**
 * Builds a privacy-safe ClientLeagueView for a specific team.
 * Unreciprocated swipes AND matches belonging only to third-party teams are NEVER exposed.
 */
export function toClientLeagueView(
  state: ServerLeagueState,
  teamId?: string | null,
  matchFound?: Match | null
): ClientLeagueView {
  const mySwipes = teamId ? state.swipes.filter((s) => s.teamId === teamId) : [];
  const myMatches = teamId
    ? state.matches.filter((m) => m.teamAId === teamId || m.teamBId === teamId)
    : [];
  const myDeletedMatches = teamId
    ? (state.deletedMatches || []).filter((m) => m.teamAId === teamId || m.teamBId === teamId)
    : [];
  return {
    league: state.league,
    mySwipes,
    matches: myMatches,
    deletedMatches: myDeletedMatches,
    matchFound: matchFound ?? null,
  };
}
