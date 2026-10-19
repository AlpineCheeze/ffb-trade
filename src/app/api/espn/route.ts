import { NextRequest, NextResponse } from 'next/server';
import { fetchEspnLeagueServer, normalizeEspnCookies, createMockLeague } from '@/lib/espn';
import {
  getServerLeagueSnapshot,
  saveServerLeagueSnapshot,
  sanitizeLeagueId,
  leagueLock,
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
    const mergedLeague = await leagueLock.acquire(cleanId, async () => {
      return saveServerLeagueSnapshot(freshLeague, cleanId);
    });
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
    const { leagueId: rawLeagueId, seasonId, espnS2, swid, forceRefresh } = body || {};

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

    // Handle Demo League refresh cleanly without hitting live ESPN
    if (cleanId === '12345678') {
      const mergedDemo = await leagueLock.acquire('12345678', async () => {
        return saveServerLeagueSnapshot(createMockLeague(), '12345678');
      });
      return NextResponse.json({ success: true, league: mergedDemo });
    }

    // Normalize cookies first so combined cookie strings pasted into a single field are detected
    const normCookies = normalizeEspnCookies(espnS2, swid);
    const hasCookies = Boolean(normCookies.espnS2 && normCookies.swid);

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
      espnS2: normCookies.espnS2,
      swid: normCookies.swid,
    });

    // Save snapshot on server (preserving existing team claims and valid swipes/matches)
    const mergedLeague = await leagueLock.acquire(cleanId, async () => {
      return saveServerLeagueSnapshot(freshLeague, cleanId);
    });

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
