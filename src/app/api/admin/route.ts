import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByToken,
  getUserById,
  getAllUsers,
  deleteUser,
  linkUserTeamClaim,
  unlinkUserTeamClaim,
  unlinkAllUserClaimsForLeague,
  ensureSuperUserAccount,
  userLock,
} from '@/lib/serverUserStore';
import {
  getAllServerLeagues,
  superDeleteLeague,
  superAssignTeam,
  superUnassignTeam,
  unclaimAllTeamsForUser,
  leagueLock,
} from '@/lib/serverLeagueStore';

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

function verifySuperUser(req: NextRequest, body?: any) {
  ensureSuperUserAccount();
  const token = extractToken(req, body);
  if (!token) {
    return { authorized: false, error: 'Authentication required. No session token provided.' };
  }

  const user = getUserByToken(token);
  if (!user) {
    return { authorized: false, error: 'Invalid session token. Please log in again.' };
  }

  const isSuper = user.isSuperUser || user.username.toLowerCase() === 'superu';
  if (!isSuper) {
    return { authorized: false, error: 'Forbidden: Superuser access required.' };
  }

  return { authorized: true, user };
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = verifySuperUser(req);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { success: false, error: authCheck.error },
        { status: 403 }
      );
    }

    const users = getAllUsers();
    const rawLeagues = getAllServerLeagues();

    const leagues = rawLeagues.map((s) => ({
      id: s.league.id,
      espnLeagueId: s.league.espnLeagueId,
      name: s.league.name,
      seasonId: s.league.seasonId,
      isPrivate: s.league.isPrivate,
      teamsCount: s.league.teams.length,
      swipesCount: s.swipes.length,
      matchesCount: s.matches.length,
      claimedCount: s.league.teams.filter((t) => t.isClaimed).length,
      lastSyncedAt: s.league.lastSyncedAt,
      teams: s.league.teams.map((t) => ({
        id: t.id,
        espnTeamId: t.espnTeamId,
        name: t.name,
        logoUrl: t.logoUrl,
        ownerName: t.ownerName,
        isClaimed: Boolean(t.isClaimed),
        claimedBy: t.claimedBy,
        claimedByUserId: t.claimedByUserId,
        rosterCount: t.roster?.length || 0,
      })),
    }));

    return NextResponse.json({
      success: true,
      currentUser: authCheck.user,
      users,
      leagues,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const authCheck = verifySuperUser(req, body);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { success: false, error: authCheck.error },
        { status: 403 }
      );
    }

    const action = String(body.action ?? '').toLowerCase().trim();

    // 1. DELETE USER
    if (action === 'delete_user') {
      const targetUserId = String(body.userId ?? '').trim();
      if (!targetUserId) {
        return NextResponse.json(
          { success: false, error: 'Missing userId to delete.' },
          { status: 400 }
        );
      }

      return await userLock.acquire(targetUserId, async () => {
        return await leagueLock.acquire(targetUserId, async () => {
          // Unclaim all teams held by this user across all leagues
          unclaimAllTeamsForUser(targetUserId);

          // Delete the user from store
          const deleted = deleteUser(targetUserId);
          if (!deleted) {
            return NextResponse.json(
              { success: false, error: 'User not found or could not be deleted.' },
              { status: 404 }
            );
          }

          return NextResponse.json({
            success: true,
            message: `User ${targetUserId} successfully deleted and unassigned from all teams.`,
          });
        });
      });
    }

    // 2. DELETE LEAGUE
    if (action === 'delete_league') {
      const targetLeagueId = String(body.leagueId ?? '').trim();
      if (!targetLeagueId) {
        return NextResponse.json(
          { success: false, error: 'Missing leagueId to delete.' },
          { status: 400 }
        );
      }

      return await leagueLock.acquire(targetLeagueId, async () => {
        return await userLock.acquire(targetLeagueId, async () => {
          // Unlink team claims for this league from all users
          unlinkAllUserClaimsForLeague(targetLeagueId);

          // Delete the league
          const deleted = superDeleteLeague(targetLeagueId);
          if (!deleted) {
            return NextResponse.json(
              { success: false, error: 'League could not be deleted.' },
              { status: 400 }
            );
          }

          return NextResponse.json({
            success: true,
            message: `League #${targetLeagueId} successfully deleted.`,
          });
        });
      });
    }

    // 3. ASSIGN USER TO TEAM
    if (action === 'assign_team') {
      const leagueId = String(body.leagueId ?? '').trim();
      const teamId = String(body.teamId ?? '').trim();
      const userId = String(body.userId ?? '').trim();

      if (!leagueId || !teamId || !userId) {
        return NextResponse.json(
          { success: false, error: 'Missing leagueId, teamId, or userId.' },
          { status: 400 }
        );
      }

      return await leagueLock.acquire(leagueId, async () => {
        return await userLock.acquire(userId, async () => {
          const targetUser = getUserById(userId);
          if (!targetUser) {
            return NextResponse.json(
              { success: false, error: `User ID "${userId}" not found.` },
              { status: 404 }
            );
          }

          const updatedState = superAssignTeam(leagueId, teamId, targetUser.id, targetUser.username);
          if (!updatedState) {
            return NextResponse.json(
              { success: false, error: 'Failed to assign user to team. Check league and team IDs.' },
              { status: 400 }
            );
          }

          // Link team claim in user store
          linkUserTeamClaim(targetUser.id, leagueId, teamId);

          return NextResponse.json({
            success: true,
            message: `User @${targetUser.username} successfully assigned to team ${teamId} in league #${leagueId}.`,
          });
        });
      });
    }

    // 4. UNASSIGN USER FROM TEAM
    if (action === 'unassign_team') {
      const leagueId = String(body.leagueId ?? '').trim();
      const teamId = String(body.teamId ?? '').trim();

      if (!leagueId || !teamId) {
        return NextResponse.json(
          { success: false, error: 'Missing leagueId or teamId.' },
          { status: 400 }
        );
      }

      return await leagueLock.acquire(leagueId, async () => {
        const { state: updatedState, previousUserId } = superUnassignTeam(leagueId, teamId);
        if (!updatedState) {
          return NextResponse.json(
            { success: false, error: 'Failed to unassign team. Check league and team IDs.' },
            { status: 400 }
          );
        }

        if (previousUserId) {
          await userLock.acquire(previousUserId, async () => {
            unlinkUserTeamClaim(previousUserId, leagueId);
          });
        }

        return NextResponse.json({
          success: true,
          message: `Team ${teamId} in league #${leagueId} is now unassigned.`,
        });
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: "${action}"` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Error in POST /api/admin:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
