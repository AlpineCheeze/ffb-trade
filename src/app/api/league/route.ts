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
  clearAllServerLeagues,
  toClientLeagueView,
  sanitizeLeagueId,
} from '@/lib/serverLeagueStore';
import { fetchEspnLeagueServer } from '@/lib/espn';
import { linkUserTeamClaim, clearAllServerUsers } from '@/lib/serverUserStore';
import { Swipe, TradeType, Match } from '@/types/fantasy';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawLeagueId = searchParams.get('leagueId');
  const teamId = searchParams.get('teamId');

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

  const view = toClientLeagueView(state, teamId);
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

    if (action === 'clear_all_data' || action === 'admin_clear') {
      const leagueResult = clearAllServerLeagues();
      const userResult = clearAllServerUsers();
      return NextResponse.json({
        success: true,
        message: 'All league and user testing data cleared. Clean slate initialized.',
        leaguesDeleted: leagueResult.deletedLeagues,
        demoReseeded: leagueResult.demoReseeded,
        usersDeletedCount: userResult.deletedUsers,
      });
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

    if (action === 'claim') {
      const { teamId, claimantName, fallbackLeague, previousTeamId, userId } = body;
      if (!teamId || typeof teamId !== 'string') {
        return NextResponse.json(
          { error: 'Valid teamId is required to claim a team' },
          { status: 400 }
        );
      }

      const safeName = String(claimantName || '').trim().slice(0, 50);
      const safePrevTeamId =
        typeof previousTeamId === 'string' && previousTeamId.trim()
          ? previousTeamId.trim()
          : undefined;
      const safeUserId =
        typeof userId === 'string' && userId.trim() ? userId.trim() : undefined;

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

      if (safeUserId) {
        linkUserTeamClaim(safeUserId, cleanId, teamId);
      }

      const view = toClientLeagueView(updatedState, teamId);
      return NextResponse.json({
        success: true,
        ...view,
      });
    }

    if (action === 'swipe') {
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

      if (swipe.teamId === swipe.targetTeamId) {
        return NextResponse.json(
          { error: 'Cannot swipe on your own team' },
          { status: 400 }
        );
      }

      const result = recordServerSwipe(cleanId, swipe, fallbackLeague);
      if (!result) {
        return NextResponse.json(
          { error: 'League not found on server' },
          { status: 404 }
        );
      }

      const view = toClientLeagueView(result.state, swipe.teamId, result.matchFound);
      return NextResponse.json({
        success: true,
        ...view,
      });
    }

    if (action === 'undo') {
      const { teamId, tradeType, offeredPlayerIds } = body as {
        teamId: string;
        tradeType: TradeType;
        offeredPlayerIds: string[];
      };

      if (!teamId || !tradeType || !Array.isArray(offeredPlayerIds)) {
        return NextResponse.json(
          { error: 'Invalid undo payload' },
          { status: 400 }
        );
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
    }

    if (action === 'delete_match') {
      const { teamId, matchId, fallbackLeague, matchSnapshot } = body as {
        teamId: string;
        matchId: string;
        fallbackLeague?: any;
        matchSnapshot?: Match;
      };

      if (!teamId || typeof teamId !== 'string' || !matchId || typeof matchId !== 'string') {
        return NextResponse.json(
          { error: 'Valid teamId and matchId are required to delete a match' },
          { status: 400 }
        );
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
    }

    if (action === 'delete_all_matches') {
      const { teamId, fallbackLeague, clientMatches } = body as {
        teamId: string;
        fallbackLeague?: any;
        clientMatches?: Match[];
      };

      if (!teamId || typeof teamId !== 'string') {
        return NextResponse.json(
          { error: 'Valid teamId is required to delete all matches' },
          { status: 400 }
        );
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
    }

    if (action === 'reset_swipes' || action === 'reset_league_swipes') {
      const { teamId, fallbackLeague } = body;
      const updatedState = resetServerLeagueSwipes(cleanId, fallbackLeague);
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
    }

    if (action === 'sync_state') {
      const { teamId } = body;
      const state = getServerLeagueState(cleanId);
      if (!state) {
        return NextResponse.json(
          { error: 'League not found on server' },
          { status: 404 }
        );
      }

      const view = toClientLeagueView(state, teamId);
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
