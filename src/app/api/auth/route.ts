import { NextRequest, NextResponse } from 'next/server';
import {
  createUser,
  loginUser,
  getUserByToken,
  getUserById,
  linkUserTeamClaim,
  unlinkUserTeamClaim,
  logoutUser,
} from '@/lib/serverUserStore';

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
      user,
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
      const result = createUser(username, password);
      return NextResponse.json({
        success: true,
        user: result.user,
        token: result.token,
      });
    }

    if (action === 'login') {
      const { username, password } = body;
      const result = loginUser(username, password);
      return NextResponse.json({
        success: true,
        user: result.user,
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
        user,
      });
    }

    if (action === 'link_claim') {
      const { userId, leagueId, teamId } = body;
      if (!userId || !leagueId || !teamId) {
        return NextResponse.json(
          { success: false, error: 'userId, leagueId, and teamId are required' },
          { status: 400 }
        );
      }
      const updatedUser = linkUserTeamClaim(userId, leagueId, teamId);
      if (!updatedUser) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        user: updatedUser,
      });
    }

    if (action === 'unlink_claim') {
      const { userId, leagueId } = body;
      if (!userId || !leagueId) {
        return NextResponse.json(
          { success: false, error: 'userId and leagueId are required' },
          { status: 400 }
        );
      }
      const updatedUser = unlinkUserTeamClaim(userId, leagueId);
      return NextResponse.json({
        success: true,
        user: updatedUser,
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
