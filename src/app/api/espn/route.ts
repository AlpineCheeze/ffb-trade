import { NextRequest, NextResponse } from 'next/server';
import { fetchEspnLeagueServer, normalizeEspnCookies, createMockLeague } from '@/lib/espn';
import {
  getServerLeagueSnapshot,
  getServerLeagueState,
  saveServerLeagueSnapshot,
  sanitizeLeagueId,
  leagueLock,
} from '@/lib/serverLeagueStore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawLeagueId = searchParams.get('leagueId');
  const seasonId = searchParams.get('seasonId') || undefined;
  const forceRefresh = searchParams.get('forceRefresh') === 'true';

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

  const existingState = getServerLeagueState(cleanId);
  const existingSnapshot = existingState?.league || getServerLeagueSnapshot(cleanId);

  // 1. Check if a synced league snapshot exists on the server (and not forcing refresh)
  if (existingSnapshot && !forceRefresh) {
    return NextResponse.json({ success: true, league: existingSnapshot, cached: true });
  }

  // 2. Otherwise try fetching from ESPN (using stored credentials if private)
  try {
    const freshLeague = await fetchEspnLeagueServer({
      leagueId: cleanId,
      seasonId,
      espnS2: existingState?.espnCredentials?.espnS2,
      swid: existingState?.espnCredentials?.swid,
    });
    const mergedLeague = await leagueLock.acquire(cleanId, async () => {
      return saveServerLeagueSnapshot(freshLeague, cleanId, existingState?.espnCredentials);
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
    const existingState = getServerLeagueState(cleanId);

    // If cookies were not supplied in request, automatically fallback to server-stored credentials!
    const effectiveS2 = normCookies.espnS2 || existingState?.espnCredentials?.espnS2;
    const effectiveSwid = normCookies.swid || existingState?.espnCredentials?.swid;
    const hasCookies = Boolean(effectiveS2 && effectiveSwid);

    // If no new cookies provided and not forcing a refresh, serve existing server snapshot if present
    const hasSuppliedCookies = Boolean(normCookies.espnS2 && normCookies.swid);
    if (!hasSuppliedCookies && !forceRefresh) {
      const existing = getServerLeagueSnapshot(cleanId);
      if (existing) {
        return NextResponse.json({ success: true, league: existing, cached: true });
      }
    }

    const freshLeague = await fetchEspnLeagueServer({
      leagueId: cleanId,
      seasonId: seasonId ? String(seasonId).trim() : undefined,
      espnS2: effectiveS2,
      swid: effectiveSwid,
    });

    // Save snapshot on server (preserving existing team claims, valid swipes/matches, and credentials)
    const mergedLeague = await leagueLock.acquire(cleanId, async () => {
      return saveServerLeagueSnapshot(freshLeague, cleanId, {
        espnS2: effectiveS2,
        swid: effectiveSwid,
      });
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
