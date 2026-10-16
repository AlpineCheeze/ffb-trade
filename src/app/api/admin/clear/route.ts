import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { clearAllServerLeagues } from '@/lib/serverLeagueStore';
import { clearAllServerUsers, getUserByToken } from '@/lib/serverUserStore';

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

function verifyAdminOrSuperUser(req: NextRequest, body?: any): boolean {
  // 1. Check ADMIN_SECRET if configured or if provided
  const adminSecret = process.env.ADMIN_SECRET;
  const providedKey =
    req.headers.get('x-admin-key') ||
    req.nextUrl.searchParams.get('adminKey') ||
    body?.adminKey;

  if (adminSecret && typeof providedKey === 'string') {
    try {
      const bufExpected = Buffer.from(adminSecret);
      const bufProvided = Buffer.from(providedKey);
      if (bufExpected.length === bufProvided.length && crypto.timingSafeEqual(bufExpected, bufProvided)) {
        return true;
      }
    } catch {
      // Continue to check superuser token
    }
  }

  // 2. Check superuser session token
  const token = extractToken(req, body);
  if (token) {
    const user = getUserByToken(token);
    if (user && user.isSuperUser) {
      return true;
    }
  }

  return false;
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    if (!verifyAdminOrSuperUser(req, body)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Valid admin key or superuser token required' },
        { status: 401 }
      );
    }

    const leagueResult = clearAllServerLeagues();
    const userResult = clearAllServerUsers();

    return NextResponse.json({
      success: true,
      message: 'All league and user testing data cleared successfully. Clean slate initialized.',
      leaguesDeleted: leagueResult.deletedLeagues,
      demoReseeded: leagueResult.demoReseeded,
      usersDeletedCount: userResult.deletedUsers,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to clear data' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method Not Allowed. Use authenticated POST.' },
    { status: 405 }
  );
}
