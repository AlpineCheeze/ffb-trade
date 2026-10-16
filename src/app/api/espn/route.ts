import { NextRequest, NextResponse } from 'next/server';
import { fetchEspnLeagueServer } from '@/lib/espn';
import {
  getServerLeagueSnapshot,
  saveServerLeagueSnapshot,
  sanitizeLeagueId,
} from '@/lib/serverLeagueStore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawLeagueId = searchParams.get('leagueId');
  const seasonId = searchParams.get('seasonId') || undefined;

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

  // 1. Check if a synced league snapshot exists on the server (e.g. synced by commissioner)
  const existingSnapshot = getServerLeagueSnapshot(cleanId);
  if (existingSnapshot) {
    return NextResponse.json({ success: true, league: existingSnapshot, cached: true });
  }

  // 2. Otherwise try fetching from ESPN (works if public league)
  try {
    const freshLeague = await fetchEspnLeagueServer({
      leagueId: cleanId,
      seasonId,
    });
    const mergedLeague = saveServerLeagueSnapshot(freshLeague);
    return NextResponse.json({ success: true, league: mergedLeague });
  } catch (err: any) {
    const isNotFound = Boolean(err.isNotFound);
    const isPrivate =
      !isNotFound &&
      Boolean(
        err.isPrivate ||
          err.message?.toLowerCase().includes('private') ||
          err.message?.toLowerCase().includes('cookie') ||
          err.message?.includes('401') ||
          err.message?.includes('403')
      );

    return NextResponse.json(
      {
        error: err.message || 'Failed to fetch ESPN league',
        isPrivate,
        isNotFound,
      },
      { status: isNotFound ? 404 : isPrivate ? 401 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leagueId: rawLeagueId, seasonId, espnS2, swid, forceRefresh } = body;

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

    const hasCookies = Boolean(espnS2 && swid);

    // If no cookies provided and not forcing a refresh, serve existing server snapshot if present
    if (!hasCookies && !forceRefresh) {
      const existing = getServerLeagueSnapshot(cleanId);
      if (existing) {
        return NextResponse.json({ success: true, league: existing, cached: true });
      }
    }

    const freshLeague = await fetchEspnLeagueServer({
      leagueId: cleanId,
      seasonId: seasonId ? String(seasonId).trim() : undefined,
      espnS2: espnS2 ? String(espnS2).trim() : undefined,
      swid: swid ? String(swid).trim() : undefined,
    });

    // Save snapshot on server (preserving existing team claims and swipes)
    const mergedLeague = saveServerLeagueSnapshot(freshLeague);

    return NextResponse.json({ success: true, league: mergedLeague });
  } catch (err: any) {
    const isNotFound = Boolean(err.isNotFound);
    const isPrivate =
      !isNotFound &&
      Boolean(
        err.isPrivate ||
          err.message?.toLowerCase().includes('private') ||
          err.message?.toLowerCase().includes('cookie') ||
          err.message?.includes('401') ||
          err.message?.includes('403')
      );

    return NextResponse.json(
      {
        error: err.message || 'Failed to fetch ESPN league',
        isPrivate,
        isNotFound,
      },
      { status: isNotFound ? 404 : isPrivate ? 401 : 500 }
    );
  }
}
