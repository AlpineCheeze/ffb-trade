import { NextRequest, NextResponse } from 'next/server';
import {
  createUser,
  loginUser,
  getUserByToken,
  getUserById,
  linkUserTeamClaim,
  unlinkUserTeamClaim,
  logoutUser,
  userLock,
} from '@/lib/serverUserStore';
import { ensureCleanSlateMigration, getServerLeagueState } from '@/lib/serverLeagueStore';
import { UserAccount, UserClaimedLeagueSummary } from '@/types/fantasy';

function enrichUserWithClaimedLeagues(user: UserAccount): UserAccount {
  const claimedLeaguesDetails: UserClaimedLeagueSummary[] = [];
  const claimedEntries = Object.entries(user.claimedTeams || {});

  for (const [leagueId, teamId] of claimedEntries) {
    try {
      const state = getServerLeagueState(leagueId);
      if (state && state.league) {
        const team = state.league.teams.find((t) => t.id === teamId || t.espnTeamId === teamId);
        claimedLeaguesDetails.push({
          leagueId,
          leagueName: state.league.name || (leagueId === '12345678' ? 'The Gridiron Champions League (Demo)' : `ESPN League #${leagueId}`),
          seasonId: state.league.seasonId || '2024',
          teamId,
          teamName: team?.name || `Team ${teamId}`,
          teamLogo: team?.logoUrl || null,
          ownerName: team?.ownerName || user.username,
          starPlayers: team?.roster?.slice(0, 4) || [],
          totalTeams: state.league.teams.length,
          matchesCount: state.matches.filter((m) => m.teamAId === teamId || m.teamBId === teamId).length,
        });
      } else {
        claimedLeaguesDetails.push({
          leagueId,
          leagueName: leagueId === '12345678' ? 'The Gridiron Champions League (Demo)' : `ESPN League #${leagueId}`,
          seasonId: '2024',
          teamId,
          teamName: `Claimed Team`,
          teamLogo: null,
          ownerName: user.username,
          starPlayers: [],
          totalTeams: 0,
          matchesCount: 0,
        });
      }
    } catch {
      // Continue
    }
  }

  return {
    ...user,
    claimedLeaguesDetails,
  };
}

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

export async function GET(req: NextRequest) {
  ensureCleanSlateMigration();
  try {
    const token = extractToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication token required' },
        { status: 401 }
      );
    }

    const user = getUserByToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: enrichUserWithClaimedLeagues(user),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  const { action } = body || {};

  try {
    if (action === 'register') {
      const { username, password } = body;
      const cleanUsername = String(username || '').toLowerCase().trim();
      const result = await userLock.acquire(`register_${cleanUsername}`, async () => {
        return createUser(username, password);
      });
      return NextResponse.json({
        success: true,
        user: enrichUserWithClaimedLeagues(result.user),
        token: result.token,
      });
    }

    if (action === 'login') {
      const { username, password } = body;
      const cleanUsername = String(username || '').toLowerCase().trim();
      const result = await userLock.acquire(`login_${cleanUsername}`, async () => {
        return loginUser(username, password);
      });
      return NextResponse.json({
        success: true,
        user: enrichUserWithClaimedLeagues(result.user),
        token: result.token,
      });
    }

    if (action === 'logout') {
      const token = extractToken(req, body);
      if (token) {
        logoutUser(token);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'me') {
      const token = extractToken(req, body);
      if (!token) {
        return NextResponse.json(
          { success: false, error: 'No token provided' },
          { status: 401 }
        );
      }
      const user = getUserByToken(token);
      if (!user) {
        return NextResponse.json(
          { success: false, error: 'Session expired' },
          { status: 401 }
        );
      }
      return NextResponse.json({
        success: true,
        user: enrichUserWithClaimedLeagues(user),
      });
    }

    if (action === 'link_claim') {
      const token = extractToken(req, body);
      if (!token) {
        return NextResponse.json(
          { success: false, error: 'Authentication token required' },
          { status: 401 }
        );
      }
      const authUser = getUserByToken(token);
      if (!authUser) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired session' },
          { status: 401 }
        );
      }
      const { leagueId, teamId } = body;
      if (!leagueId || !teamId) {
        return NextResponse.json(
          { success: false, error: 'leagueId and teamId are required' },
          { status: 400 }
        );
      }
      // Derive userId strictly from session token unless superuser specifies a target userId
      const targetUserId = (authUser.isSuperUser && typeof body.userId === 'string' && body.userId.trim())
        ? body.userId.trim()
        : authUser.id;

      const updatedUser = await userLock.acquire(targetUserId, async () => {
        return linkUserTeamClaim(targetUserId, String(leagueId).trim(), String(teamId).trim());
      });
      if (!updatedUser) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        user: enrichUserWithClaimedLeagues(updatedUser),
      });
    }

    if (action === 'unlink_claim') {
      const token = extractToken(req, body);
      if (!token) {
        return NextResponse.json(
          { success: false, error: 'Authentication token required' },
          { status: 401 }
        );
      }
      const authUser = getUserByToken(token);
      if (!authUser) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired session' },
          { status: 401 }
        );
      }
      const { leagueId } = body;
      if (!leagueId) {
        return NextResponse.json(
          { success: false, error: 'leagueId is required' },
          { status: 400 }
        );
      }
      const targetUserId = (authUser.isSuperUser && typeof body.userId === 'string' && body.userId.trim())
        ? body.userId.trim()
        : authUser.id;

      const updatedUser = await userLock.acquire(targetUserId, async () => {
        return unlinkUserTeamClaim(targetUserId, String(leagueId).trim());
      });
      return NextResponse.json({
        success: true,
        user: updatedUser ? enrichUserWithClaimedLeagues(updatedUser) : null,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: ${String(action)}` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Operation failed' },
      { status: 400 }
    );
  }
}
