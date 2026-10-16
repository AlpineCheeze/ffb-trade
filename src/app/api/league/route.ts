import { NextRequest, NextResponse } from 'next/server';
import {
  getServerLeagueState,
  saveServerLeagueSnapshot,
  claimServerTeam,
  recordServerSwipe,
  undoServerSwipe,
  deleteServerMatch,
  deleteAllServerMatches,
  resetServerLeagueSwipes,
  toClientLeagueView,
  sanitizeLeagueId,
  sanitizeTeamId,
  leagueLock,
} from '@/lib/serverLeagueStore';
import { fetchEspnLeagueServer } from '@/lib/espn';
import { linkUserTeamClaim, getUserByToken, userLock } from '@/lib/serverUserStore';
import { Swipe, TradeType, Match, UserAccount, ServerLeagueState } from '@/types/fantasy';

function extractToken(req: NextRequest, body?: any): string | null {
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const queryToken = req.nextUrl.searchParams.get('token');
  if (queryToken && queryToken.trim()) {
    return queryToken.trim();
  }
  if (body && typeof body.token === 'string' && body.token.trim()) {
    return body.token.trim();
  }
  return null;
}

function canViewPrivateTeamSwipes(
  user: UserAccount | null,
  cleanLeagueId: string,
  teamId: string,
  state: ServerLeagueState
): boolean {
  if (!user) return false;
  if (user.isSuperUser) return true;
  if (user.claimedTeams && user.claimedTeams[cleanLeagueId] === teamId) {
    return true;
  }
  const team = state.league.teams.find((t) => t.id === teamId);
  if (team && team.claimedByUserId === user.id) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawLeagueId = searchParams.get('leagueId');
  const rawTeamId = searchParams.get('teamId');

  if (!rawLeagueId || !rawLeagueId.trim()) {
    return NextResponse.json(
      { error: 'Valid ESPN League ID is required' },
      { status: 400 }
    );
  }

  let cleanId: string;
  try {
    cleanId = sanitizeLeagueId(rawLeagueId);
  } catch {
    return NextResponse.json(
      { error: 'Invalid ESPN League ID format' },
      { status: 400 }
    );
  }

  let cleanTeamId: string | null = null;
  if (rawTeamId) {
    try {
      cleanTeamId = sanitizeTeamId(rawTeamId);
    } catch {
      return NextResponse.json(
        { error: 'Invalid Team ID format' },
        { status: 400 }
      );
    }
  }

  let state = getServerLeagueState(cleanId);

  // If no state on server yet, try fetching public league from ESPN
  if (!state) {
    try {
      const fetched = await fetchEspnLeagueServer({ leagueId: cleanId });
      saveServerLeagueSnapshot(fetched, cleanId);
      state = getServerLeagueState(cleanId);
    } catch {
      return NextResponse.json(
        { error: `League #${cleanId} not found in server store` },
        { status: 404 }
      );
    }
  }

  if (!state) {
    return NextResponse.json(
      { error: `League #${cleanId} not found` },
      { status: 404 }
    );
  }

  // Enforce privacy: only the authenticated owner of cleanTeamId (or superuser) receives private swipes
  const token = extractToken(req);
  const authUser = token ? getUserByToken(token) : null;
  const isAuthorized = cleanTeamId
    ? canViewPrivateTeamSwipes(authUser, cleanId, cleanTeamId, state)
    : false;

  const view = toClientLeagueView(state, isAuthorized ? cleanTeamId : null);
  return NextResponse.json({
    success: true,
    ...view,
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  try {
    const { action, leagueId: rawLeagueId } = body || {};

    // SEC-01: Remove unauthenticated clear_all_data action from public league route
    if (action === 'clear_all_data' || action === 'admin_clear') {
      return NextResponse.json(
        {
          error:
            'Unsupported action: Data clearing is restricted to authenticated /api/admin/clear endpoint.',
        },
        { status: 400 }
      );
    }

    if (!rawLeagueId || !String(rawLeagueId).trim()) {
      return NextResponse.json(
        { error: 'Valid ESPN League ID is required' },
        { status: 400 }
      );
    }

    let cleanId: string;
    try {
      cleanId = sanitizeLeagueId(String(rawLeagueId));
    } catch {
      return NextResponse.json(
        { error: 'Invalid ESPN League ID format' },
        { status: 400 }
      );
    }

    const token = extractToken(req, body);
    const authUser = token ? getUserByToken(token) : null;

    if (action === 'claim') {
      return await leagueLock.acquire(cleanId, async () => {
        const { teamId: rawTeamId, claimantName, fallbackLeague, previousTeamId, userId } = body;
        if (!rawTeamId || typeof rawTeamId !== 'string') {
          return NextResponse.json(
            { error: 'Valid teamId is required to claim a team' },
            { status: 400 }
          );
        }

        let teamId: string;
        try {
          teamId = sanitizeTeamId(rawTeamId);
        } catch {
          return NextResponse.json(
            { error: 'Invalid teamId format' },
            { status: 400 }
          );
        }

        const safeName = String(claimantName || '').trim().slice(0, 50);
        const safePrevTeamId =
          typeof previousTeamId === 'string' && previousTeamId.trim()
            ? sanitizeTeamId(previousTeamId)
            : undefined;

        // Derive authenticated userId strictly from session token (or target userId if superuser)
        const safeUserId = authUser?.isSuperUser && typeof userId === 'string' && userId.trim()
          ? userId.trim()
          : authUser?.id;

        // Pre-claim conflict verification: if team is already claimed by another user, return 409 Conflict
        const currentState = getServerLeagueState(cleanId);
        if (currentState) {
          const targetTeam = currentState.league.teams.find((t) => t.id === teamId);
          if (targetTeam && targetTeam.isClaimed) {
            const isCurrentOwner = safeUserId
              ? targetTeam.claimedByUserId === safeUserId
              : (!targetTeam.claimedByUserId && targetTeam.claimedBy?.toLowerCase() === safeName.toLowerCase());
            if (!isCurrentOwner) {
              return NextResponse.json(
                { error: 'Team is already claimed by another manager' },
                { status: 409 }
              );
            }
          }
        }

        const updatedState = claimServerTeam(
          cleanId,
          teamId,
          safeName,
          fallbackLeague,
          safePrevTeamId,
          safeUserId
        );
        if (!updatedState) {
          return NextResponse.json(
            { error: 'League or team not found on server' },
            { status: 404 }
          );
        }

        // ARCH-01: Ensure claim was actually granted to safeUserId before linking to user account
        const targetAfter = updatedState.league.teams.find((t) => t.id === teamId);
        const claimGranted = safeUserId
          ? targetAfter?.claimedByUserId === safeUserId
          : targetAfter?.claimedBy === safeName;

        if (!claimGranted) {
          return NextResponse.json(
            { error: 'Team is already claimed by another manager' },
            { status: 409 }
          );
        }

        if (safeUserId) {
          await userLock.acquire(safeUserId, async () => {
            linkUserTeamClaim(safeUserId, cleanId, teamId);
          });
        }

        const view = toClientLeagueView(updatedState, teamId);
        return NextResponse.json({
          success: true,
          ...view,
        });
      });
    }

    if (action === 'swipe') {
      return await leagueLock.acquire(cleanId, async () => {
        const { swipe, fallbackLeague } = body as { swipe: Swipe; fallbackLeague?: any };
        if (
          !swipe ||
          typeof swipe.teamId !== 'string' ||
          !swipe.teamId.trim() ||
          typeof swipe.targetTeamId !== 'string' ||
          !swipe.targetTeamId.trim() ||
          !Array.isArray(swipe.offeredPlayerIds) ||
          swipe.offeredPlayerIds.length === 0 ||
          !Array.isArray(swipe.targetPlayerIds) ||
          swipe.targetPlayerIds.length === 0
        ) {
          return NextResponse.json(
            { error: 'Invalid swipe payload' },
            { status: 400 }
          );
        }

        const safeTeamId = sanitizeTeamId(swipe.teamId);
        const safeTargetTeamId = sanitizeTeamId(swipe.targetTeamId);

        if (safeTeamId === safeTargetTeamId) {
          return NextResponse.json(
            { error: 'Cannot swipe on your own team' },
            { status: 400 }
          );
        }

        // Authorization check: Ensure user owns safeTeamId if team is claimed
        const currentState = getServerLeagueState(cleanId);
        const teamObj = currentState?.league.teams.find((t) => t.id === safeTeamId);

        if (teamObj?.claimedByUserId) {
          if (!token) {
            return NextResponse.json(
              { error: 'Authentication required to swipe for this claimed team' },
              { status: 401 }
            );
          }
          if (!authUser) {
            return NextResponse.json(
              { error: 'Invalid or expired session token' },
              { status: 401 }
            );
          }
          if (
            !authUser.isSuperUser &&
            authUser.id !== teamObj.claimedByUserId &&
            authUser.claimedTeams?.[cleanId] !== safeTeamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        } else if (authUser) {
          if (
            !authUser.isSuperUser &&
            authUser.claimedTeams?.[cleanId] &&
            authUser.claimedTeams[cleanId] !== safeTeamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        }

        const sanitizedSwipe: Swipe = {
          ...swipe,
          teamId: safeTeamId,
          targetTeamId: safeTargetTeamId,
        };

        const result = recordServerSwipe(cleanId, sanitizedSwipe, fallbackLeague);
        if (!result) {
          return NextResponse.json(
            { error: 'League not found on server' },
            { status: 404 }
          );
        }

        const view = toClientLeagueView(result.state, safeTeamId, result.matchFound);
        return NextResponse.json({
          success: true,
          ...view,
        });
      });
    }

    if (action === 'undo') {
      return await leagueLock.acquire(cleanId, async () => {
        const { teamId: rawTeamId, tradeType, offeredPlayerIds } = body as {
          teamId: string;
          tradeType: TradeType;
          offeredPlayerIds: string[];
        };

        if (!rawTeamId || !tradeType || !Array.isArray(offeredPlayerIds)) {
          return NextResponse.json(
            { error: 'Invalid undo payload' },
            { status: 400 }
          );
        }

        const teamId = sanitizeTeamId(rawTeamId);
        const currentState = getServerLeagueState(cleanId);
        const teamObj = currentState?.league.teams.find((t) => t.id === teamId);

        if (teamObj?.claimedByUserId) {
          if (!token) {
            return NextResponse.json(
              { error: 'Authentication required' },
              { status: 401 }
            );
          }
          if (!authUser) {
            return NextResponse.json(
              { error: 'Invalid or expired session' },
              { status: 401 }
            );
          }
          if (
            !authUser.isSuperUser &&
            authUser.id !== teamObj.claimedByUserId &&
            authUser.claimedTeams?.[cleanId] !== teamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        } else if (authUser) {
          if (
            !authUser.isSuperUser &&
            authUser.claimedTeams?.[cleanId] &&
            authUser.claimedTeams[cleanId] !== teamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        }

        const updatedState = undoServerSwipe(cleanId, teamId, tradeType, offeredPlayerIds);
        if (!updatedState) {
          return NextResponse.json(
            { error: 'League not found on server' },
            { status: 404 }
          );
        }

        const view = toClientLeagueView(updatedState, teamId);
        return NextResponse.json({
          success: true,
          ...view,
        });
      });
    }

    if (action === 'delete_match') {
      return await leagueLock.acquire(cleanId, async () => {
        const { teamId: rawTeamId, matchId, fallbackLeague, matchSnapshot } = body as {
          teamId: string;
          matchId: string;
          fallbackLeague?: any;
          matchSnapshot?: Match;
        };

        if (!rawTeamId || typeof rawTeamId !== 'string' || !matchId || typeof matchId !== 'string') {
          return NextResponse.json(
            { error: 'Valid teamId and matchId are required to delete a match' },
            { status: 400 }
          );
        }

        const teamId = sanitizeTeamId(rawTeamId);
        const currentState = getServerLeagueState(cleanId);
        const teamObj = currentState?.league.teams.find((t) => t.id === teamId);

        if (teamObj?.claimedByUserId) {
          if (!token) {
            return NextResponse.json(
              { error: 'Authentication required' },
              { status: 401 }
            );
          }
          if (!authUser) {
            return NextResponse.json(
              { error: 'Invalid or expired session' },
              { status: 401 }
            );
          }
          if (
            !authUser.isSuperUser &&
            authUser.id !== teamObj.claimedByUserId &&
            authUser.claimedTeams?.[cleanId] !== teamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        } else if (authUser) {
          if (
            !authUser.isSuperUser &&
            authUser.claimedTeams?.[cleanId] &&
            authUser.claimedTeams[cleanId] !== teamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        }

        const updatedState = deleteServerMatch(
          cleanId,
          teamId,
          matchId,
          fallbackLeague,
          matchSnapshot
        );
        if (!updatedState) {
          return NextResponse.json(
            { error: 'League not found on server' },
            { status: 404 }
          );
        }

        const view = toClientLeagueView(updatedState, teamId);
        return NextResponse.json({
          success: true,
          ...view,
        });
      });
    }

    if (action === 'delete_all_matches') {
      return await leagueLock.acquire(cleanId, async () => {
        const { teamId: rawTeamId, fallbackLeague, clientMatches } = body as {
          teamId: string;
          fallbackLeague?: any;
          clientMatches?: Match[];
        };

        if (!rawTeamId || typeof rawTeamId !== 'string') {
          return NextResponse.json(
            { error: 'Valid teamId is required to delete all matches' },
            { status: 400 }
          );
        }

        const teamId = sanitizeTeamId(rawTeamId);
        const currentState = getServerLeagueState(cleanId);
        const teamObj = currentState?.league.teams.find((t) => t.id === teamId);

        if (teamObj?.claimedByUserId) {
          if (!token) {
            return NextResponse.json(
              { error: 'Authentication required' },
              { status: 401 }
            );
          }
          if (!authUser) {
            return NextResponse.json(
              { error: 'Invalid or expired session' },
              { status: 401 }
            );
          }
          if (
            !authUser.isSuperUser &&
            authUser.id !== teamObj.claimedByUserId &&
            authUser.claimedTeams?.[cleanId] !== teamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        } else if (authUser) {
          if (
            !authUser.isSuperUser &&
            authUser.claimedTeams?.[cleanId] &&
            authUser.claimedTeams[cleanId] !== teamId
          ) {
            return NextResponse.json(
              { error: 'Forbidden: You do not own this team' },
              { status: 403 }
            );
          }
        }

        const updatedState = deleteAllServerMatches(
          cleanId,
          teamId,
          fallbackLeague,
          clientMatches
        );
        if (!updatedState) {
          return NextResponse.json(
            { error: 'League not found on server' },
            { status: 404 }
          );
        }

        const view = toClientLeagueView(updatedState, teamId);
        return NextResponse.json({
          success: true,
          ...view,
        });
      });
    }

    if (action === 'reset_swipes' || action === 'reset_league_swipes') {
      return await leagueLock.acquire(cleanId, async () => {
        const { teamId: rawTeamId, fallbackLeague } = body;
        const cleanTeamId = rawTeamId ? sanitizeTeamId(rawTeamId) : undefined;

        const updatedState = resetServerLeagueSwipes(cleanId, fallbackLeague);
        if (!updatedState) {
          return NextResponse.json(
            { error: 'League not found on server' },
            { status: 404 }
          );
        }

        const view = toClientLeagueView(updatedState, cleanTeamId);
        return NextResponse.json({
          success: true,
          ...view,
        });
      });
    }

    if (action === 'sync_state') {
      const { teamId: rawTeamId } = body;
      const cleanTeamId = rawTeamId ? sanitizeTeamId(rawTeamId) : null;
      const state = getServerLeagueState(cleanId);
      if (!state) {
        return NextResponse.json(
          { error: 'League not found on server' },
          { status: 404 }
        );
      }

      // Enforce privacy: only return private swipes if user is authorized for cleanTeamId
      const isAuthorized = cleanTeamId
        ? canViewPrivateTeamSwipes(authUser, cleanId, cleanTeamId, state)
        : false;

      const view = toClientLeagueView(state, isAuthorized ? cleanTeamId : null);
      return NextResponse.json({
        success: true,
        ...view,
      });
    }

    return NextResponse.json(
      { error: `Unsupported action: ${String(action)}` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
