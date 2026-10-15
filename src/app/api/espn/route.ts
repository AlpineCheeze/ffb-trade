import { NextRequest, NextResponse } from 'next/server';
import { fetchEspnLeagueServer } from '@/lib/espn';
import { getServerLeagueSnapshot, saveServerLeagueSnapshot } from '@/lib/serverLeagueStore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get('leagueId');
  const seasonId = searchParams.get('seasonId') || undefined;

  if (!leagueId || !leagueId.trim()) {
    return NextResponse.json(
      { error: 'Valid ESPN League ID is required' },
      { status: 400 }
    );
  }

  const cleanId = leagueId.trim();

  // 1. Check if a synced league snapshot exists on the server (e.g. synced by commissioner)
  const existingSnapshot = getServerLeagueSnapshot(cleanId);
  if (existingSnapshot) {
    return NextResponse.json({ success: true, league: existingSnapshot, cached: true });
  }

  // 2. Otherwise try fetching from ESPN (works if public league)
  try {
    const league = await fetchEspnLeagueServer({
      leagueId: cleanId,
      seasonId,
    });
    saveServerLeagueSnapshot(league);
    return NextResponse.json({ success: true, league });
  } catch (err: any) {
    const isPrivate =
      err.isPrivate ||
      err.message?.toLowerCase().includes('private') ||
      err.message?.toLowerCase().includes('cookie') ||
      err.message?.includes('401') ||
      err.message?.includes('403');

    return NextResponse.json(
      {
        error: err.message || 'Failed to fetch ESPN league',
        isPrivate: Boolean(isPrivate),
      },
      { status: isPrivate ? 401 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leagueId, seasonId, espnS2, swid, forceRefresh } = body;

    if (!leagueId || !String(leagueId).trim()) {
      return NextResponse.json(
        { error: 'Valid ESPN League ID is required' },
        { status: 400 }
      );
    }

    const cleanId = String(leagueId).trim();

    // If cookies were provided or fresh sync requested, fetch from ESPN
    const hasCookies = Boolean(espnS2 && swid);

    // If no cookies provided and not forcing a refresh, serve existing server snapshot if present
    if (!hasCookies && !forceRefresh) {
      const existing = getServerLeagueSnapshot(cleanId);
      if (existing) {
        return NextResponse.json({ success: true, league: existing, cached: true });
      }
    }

    const league = await fetchEspnLeagueServer({
      leagueId: cleanId,
      seasonId: seasonId ? String(seasonId).trim() : undefined,
      espnS2: espnS2 ? String(espnS2).trim() : undefined,
      swid: swid ? String(swid).trim() : undefined,
    });

    // Save snapshot on server so any member using invite link can access
    saveServerLeagueSnapshot(league);

    return NextResponse.json({ success: true, league });
  } catch (err: any) {
    const isPrivate =
      err.isPrivate ||
      err.message?.toLowerCase().includes('private') ||
      err.message?.toLowerCase().includes('cookie') ||
      err.message?.includes('401') ||
      err.message?.includes('403');

    return NextResponse.json(
      {
        error: err.message || 'Failed to fetch ESPN league',
        isPrivate: Boolean(isPrivate),
      },
      { status: isPrivate ? 401 : 500 }
    );
  }
}
