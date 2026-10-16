import { NextRequest, NextResponse } from 'next/server';
import { clearAllServerLeagues } from '@/lib/serverLeagueStore';
import { clearAllServerUsers } from '@/lib/serverUserStore';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    // Optional admin key check if ADMIN_SECRET is configured
    const adminSecret = process.env.ADMIN_SECRET;
    const providedKey =
      req.headers.get('x-admin-key') ||
      req.nextUrl.searchParams.get('adminKey') ||
      body?.adminKey;

    if (adminSecret && providedKey !== adminSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin key' },
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

export async function GET(req: NextRequest) {
  // Support GET invocation for easy browser/curl testing verification
  return POST(req);
}
