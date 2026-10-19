import { League, Team, Player, Position, InjuryStatus } from '@/types/fantasy';

// ESPN API position mapping
export const ESPN_POSITION_MAP: Record<number, Position> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DEF',
};

// Official ESPN Pro Team ID to NFL Team Abbreviation mapping
export const NFL_PRO_TEAMS: Record<number, string> = {
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WSH',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
};

// Client / Server Unified ESPN League Loader
export function normalizeEspnCookies(espnS2Raw?: string, swidRaw?: string): { espnS2?: string; swid?: string } {
  let s2 = String(espnS2Raw ?? '').replace(/[\r\n\t]+/g, '').trim();
  let sw = String(swidRaw ?? '').replace(/[\r\n\t]+/g, '').trim();

  // 1. Detect if the user pasted a combined cookie string into either field
  const combined = `${s2}; ${sw}`.trim();
  const s2Match = combined.match(/(?:^|[;\s])espn_s2\s*[:=]\s*([^;\s]+)/i);
  const swidMatch = combined.match(/(?:^|[;\s])SWID\s*[:=]\s*([^;\s]+)/i);

  if (s2Match) {
    s2 = s2Match[1].trim();
  }
  if (swidMatch) {
    sw = swidMatch[1].trim();
  }

  // 2. Clean espn_s2 (and strip any trailing `; Path=/; HttpOnly` attributes)
  s2 = s2.replace(/^espn_s2\s*[:=]\s*/i, '').trim();
  s2 = s2.split(';')[0].replace(/^["']+|["']+$/g, '').trim();

  // 3. Clean SWID (and strip any trailing `; Path=/` attributes)
  sw = sw.replace(/^SWID\s*[:=]\s*/i, '').trim();
  sw = sw.split(';')[0].replace(/^["']+|["']+$/g, '').trim();

  // 4. Auto-detect if user accidentally swapped the two inputs
  // SWID is a ~36 character GUID (e.g. {1234-abcd...}); espn_s2 is a long token (100+ chars)
  const isS2ActuallySwid = s2.length < 50 && (s2.includes('-') || s2.startsWith('{'));
  const isSwActuallyS2 = sw.length > 80;
  if (isS2ActuallySwid && isSwActuallyS2) {
    const temp = s2;
    s2 = sw;
    sw = temp;
  }

  try {
    if (sw.includes('%')) {
      sw = decodeURIComponent(sw);
    }
  } catch {}
  sw = sw.replace(/^\{+/, '').replace(/\}+$/, '').trim();
  if (sw) {
    sw = `{${sw}}`;
  }

  return {
    espnS2: s2 || undefined,
    swid: sw || undefined,
  };
}

export async function fetchEspnLeague(params: {
  leagueId: string;
  seasonId?: string;
  espnS2?: string;
  swid?: string;
  forceRefresh?: boolean;
}): Promise<League> {
  const isBrowser = typeof window !== 'undefined';

  if (isBrowser) {
    const res = await fetch('/api/espn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `Failed to fetch ESPN league (HTTP ${res.status})`);
      (err as any).isPrivate = data.isPrivate;
      (err as any).isNotFound = data.isNotFound;
      throw err;
    }
    return data.league;
  }

  return fetchEspnLeagueServer(params);
}

export function getCurrentNFLSeason(): string {
  const now = new Date();
  let year = now.getFullYear();
  // An NFL season spans from September to February of the subsequent calendar year.
  // In Jan - June, the active/completed fantasy season corresponds to year - 1.
  if (now.getMonth() < 6) {
    year -= 1;
  }
  return String(year);
}

// Server-side direct fetch implementation (used by /api/espn route and SSR)
export async function fetchEspnLeagueServer(params: {
  leagueId: string;
  seasonId?: string;
  espnS2?: string;
  swid?: string;
}): Promise<League> {
  const cookies = normalizeEspnCookies(params.espnS2, params.swid);
  const primarySeason = params.seasonId?.trim() || getCurrentNFLSeason();
  const safeLeagueId = encodeURIComponent(params.leagueId.trim());

  const baseHeaders: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'espn-api/0.38.0',
    'x-fantasy-source': 'kona',
    'x-fantasy-platform': 'kona-PROD',
  };

  // Build candidate cookie header variations to ensure compatibility
  // Standard format used by Python espn-api: espn_s2=...; SWID={...}
  const cookieHeadersToTry: string[] = [];
  if (cookies.espnS2 && cookies.swid) {
    const s2 = cookies.espnS2;
    const sw = cookies.swid;
    const swNoBraces = sw.replace(/^\{+/, '').replace(/\}+$/, '');

    // 1. Standard: espn_s2 + SWID with curly braces
    cookieHeadersToTry.push(`espn_s2=${s2}; SWID=${sw}`);

    // 2. Decode URL encoding if % present (or encode if not)
    if (s2.includes('%')) {
      try {
        cookieHeadersToTry.push(`espn_s2=${decodeURIComponent(s2)}; SWID=${sw}`);
      } catch {}
    } else if (s2.includes('=') || s2.includes('/')) {
      try {
        cookieHeadersToTry.push(`espn_s2=${encodeURIComponent(s2)}; SWID=${sw}`);
      } catch {}
    }

    // 3. SWID without curly braces fallback
    cookieHeadersToTry.push(`espn_s2=${s2}; SWID=${swNoBraces}`);
  }

  // Dedicated ESPN fantasy API read host
  const baseHost = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

  // Seasons to try: user requested / current season first (e.g. 2026), then recent active seasons
  const currentSeason = getCurrentNFLSeason();
  const seasonsToTry = Array.from(new Set([primarySeason, currentSeason, '2026', '2025', '2024', '2023']));

  let sawAuthError = false;
  let sawNotFound = false;

  async function executeEspnFetch(url: string, cookieHeader?: string) {
    const reqHeaders = { ...baseHeaders };
    if (cookieHeader) {
      reqHeaders['Cookie'] = cookieHeader;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        headers: reqHeaders,
        cache: 'no-store',
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';

      if (res.status === 401 || res.status === 403) {
        sawAuthError = true;
        return { success: false, status: res.status };
      }

      if (res.status === 404) {
        sawNotFound = true;
        return { success: false, status: 404 };
      }

      if (!res.ok || contentType.includes('text/html')) {
        return { success: false, status: res.status };
      }

      const rawText = await res.text();
      if (!rawText || rawText.trim().startsWith('<')) {
        return { success: false, status: res.status };
      }

      let data = JSON.parse(rawText);
      // Historical seasons return an array of leagues: [ { teams: [...] } ]
      if (Array.isArray(data)) {
        data = data.length > 0 ? data[0] : null;
      }

      if (!data) {
        sawNotFound = true;
        return { success: false, status: 404 };
      }

      if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        sawAuthError = true;
        return { success: false, status: 401, error: String(data.messages[0]) };
      }

      return { success: true, data };
    } catch {
      return { success: false, status: 500 };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let resultData: any = null;
  let resolvedSeason = primarySeason;

  const cookieList = cookieHeadersToTry.length > 0 ? cookieHeadersToTry : [undefined];

  for (const season of seasonsToTry) {
    if (resultData) break;

    let standardSeasonNotFound = false;
    let historySeasonNotFound = false;

    for (const cookieHeader of cookieList) {
      if (!standardSeasonNotFound) {
        const standardUrl = `${baseHost}/seasons/${encodeURIComponent(season)}/segments/0/leagues/${safeLeagueId}?view=mRoster&view=mTeam&view=mSettings&view=mMatchupScore`;
        const res = await executeEspnFetch(standardUrl, cookieHeader);
        if (res.success && res.data) {
          resultData = res.data;
          resolvedSeason = season;
          break;
        }
        if (res.status === 404) {
          standardSeasonNotFound = true;
        }
      }

      if (!historySeasonNotFound) {
        const historyUrl = `${baseHost}/leagueHistory/${safeLeagueId}?seasonId=${encodeURIComponent(season)}&view=mRoster&view=mTeam&view=mSettings&view=mMatchupScore`;
        const resHistory = await executeEspnFetch(historyUrl, cookieHeader);
        if (resHistory.success && resHistory.data) {
          resultData = resHistory.data;
          resolvedSeason = season;
          break;
        }
        if (resHistory.status === 404) {
          historySeasonNotFound = true;
        }
      }

      // If both endpoints returned 404 for this season, no need to retry other cookie formats on this season
      if (standardSeasonNotFound && historySeasonNotFound) {
        break;
      }
    }
  }

  if (!resultData) {
    const hadCookies = Boolean(cookies.espnS2 && cookies.swid);
    if (!sawAuthError && sawNotFound) {
      const err = new Error(
        `ESPN League #${params.leagueId} was not found. Please double-check your League ID.`
      );
      (err as any).isNotFound = true;
      throw err;
    }

    if (hadCookies) {
      const err = new Error(
        `ESPN rejected the credentials for League #${params.leagueId}. Please double-check your espn_s2 and SWID cookies, and ensure this league is active.`
      );
      (err as any).isPrivate = true;
      throw err;
    } else {
      const err = new Error(
        `League #${params.leagueId} is private. Please provide your ESPN espn_s2 and SWID cookies below to sync your league.`
      );
      (err as any).isPrivate = true;
      throw err;
    }
  }

  const isPrivateLeague =
    resultData?.settings?.isPublic === false || Boolean(cookies.espnS2 && cookies.swid);
  return normalizeEspnData(resultData, params.leagueId, resolvedSeason, isPrivateLeague);
}

// Transform raw ESPN JSON into our clean TypeScript schema
export function normalizeEspnData(
  rawInput: any,
  leagueId: string,
  seasonId: string,
  isPrivate = false
): League {
  const raw = rawInput && typeof rawInput === 'object' ? rawInput : {};

  // Map members (managers) to their display names
  const memberMap = new Map<string, string>();
  if (Array.isArray(raw.members)) {
    for (const m of raw.members) {
      if (!m || typeof m !== 'object') continue;
      const name =
        m.displayName ||
        `${m.firstName || ''} ${m.lastName || ''}`.trim() ||
        'Manager';
      memberMap.set(String(m.id), name);
    }
  }

  const teams: Team[] = (Array.isArray(raw.teams) ? raw.teams : []).map((t: any, teamIdx: number) => {
    const rawRoster = Array.isArray(t?.roster?.entries) ? t.roster.entries : [];
    const roster: Player[] = rawRoster.map((entry: any, entryIdx: number) => {
      const p = entry?.playerPoolEntry?.player || {};
      const posId = p.defaultPositionId || 0;
      const position = ESPN_POSITION_MAP[posId] || 'FLEX';

      // Map healthy statuses: ESPN uses "NORMAL" for uninjured players
      let injuryStatus: InjuryStatus = 'ACTIVE';
      if (p.injuryStatus && p.injuryStatus !== 'NORMAL' && p.injuryStatus !== 'ACTIVE') {
        const rawStatus = String(p.injuryStatus).toUpperCase();
        if (rawStatus === 'QUESTIONABLE') injuryStatus = 'QUESTIONABLE';
        else if (rawStatus === 'DOUBTFUL') injuryStatus = 'DOUBTFUL';
        else if (rawStatus === 'OUT') injuryStatus = 'OUT';
        else if (rawStatus === 'IR' || rawStatus === 'INJURY_RESERVE') injuryStatus = 'IR';
        else injuryStatus = 'QUESTIONABLE';
      }

      const headshot = p.id
        ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${p.id}.png&w=350&h=254`
        : 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/default.png';

      // Use nullish coalescing to avoid replacing 0.0-point projections with 12.5
      const appliedStat = entry?.playerPoolEntry?.appliedStatTotal;
      const projectedPoints =
        typeof appliedStat === 'number' && Number.isFinite(appliedStat)
          ? Number(appliedStat.toFixed(1))
          : 0.0;

      // Extract real season stats if present in playerPoolEntry
      const statEntries = Array.isArray(p.stats) ? p.stats : [];
      const seasonAvgEntry = statEntries.find(
        (s: any) => s && s.statSourceId === 0 && s.statSplitTypeId === 0
      );
      const seasonAvgPoints =
        typeof seasonAvgEntry?.appliedAverage === 'number' &&
        Number.isFinite(seasonAvgEntry.appliedAverage)
          ? Number(seasonAvgEntry.appliedAverage.toFixed(1))
          : projectedPoints;

      // Real NFL Team
      const proTeamId = Number(p.proTeamId);
      const nflTeam = NFL_PRO_TEAMS[proTeamId] || (proTeamId ? `NFL-${proTeamId}` : 'FA');

      // Preserve jersey 0 correctly while guarding against NaN
      const parsedJersey = Number(p.jersey);
      const jerseyNumber =
        p.jersey != null && String(p.jersey).trim() !== '' && Number.isFinite(parsedJersey)
          ? parsedJersey
          : undefined;

      const parsedBye = Number(p.byeWeek);
      const byeWeek = Number.isFinite(parsedBye) && parsedBye > 0 ? parsedBye : (7 + (posId % 6));

      const deterministicId = p.id
        ? `espn_${p.id}`
        : `espn_t${t?.id ?? teamIdx}_p${entry?.playerId ?? entryIdx}`;

      return {
        id: deterministicId,
        espnPlayerId: String(p.id || entry?.playerId || ''),
        fullName: p.fullName || 'Unknown Player',
        position,
        nflTeam,
        jerseyNumber,
        headshotUrl: headshot,
        projectedPoints,
        seasonAvgPoints,
        opponentDifficulty: ('normal' as const),
        nextOpponent: '',
        byeWeek,
        injuryStatus,
      };
    });

    // Sort roster descending by star value: Math.max(projectedPoints, seasonAvgPoints)
    roster.sort((a, b) => {
      const valA = Math.max(Number(a.projectedPoints) || 0, Number(a.seasonAvgPoints) || 0);
      const valB = Math.max(Number(b.projectedPoints) || 0, Number(b.seasonAvgPoints) || 0);
      if (valB !== valA) return valB - valA;
      return (Number(b.projectedPoints) || 0) - (Number(a.projectedPoints) || 0);
    });

    // Resolve owner name
    const primaryOwnerId = String(
      t.primaryOwner || (Array.isArray(t.owners) && t.owners.length > 0 ? t.owners[0] : '')
    );
    const resolvedOwner =
      memberMap.get(primaryOwnerId) ||
      t.nickname ||
      `Manager ${t.id}`;

    const location = t.location || '';
    const nickname = t.nickname || '';
    const defaultTeamName = `${location} ${nickname}`.trim() || `Team ${t.id}`;

    return {
      id: `team_${t.id}`,
      espnTeamId: String(t.id),
      name: t.name || defaultTeamName,
      ownerName: resolvedOwner,
      logoUrl: t.logo,
      roster,
    };
  });

  return {
    id: `league_${leagueId}`,
    espnLeagueId: leagueId,
    seasonId,
    name: raw.settings?.name || `ESPN Fantasy League #${leagueId}`,
    isPrivate,
    teams,
    lastSyncedAt: new Date().toISOString(),
  };
}

// High-fidelity Mock League for instant testing & development
export function createMockLeague(): League {
  const mockPlayersTeam1: Player[] = [
    {
      id: 'p_jj',
      espnPlayerId: '4262921',
      fullName: 'Justin Jefferson',
      position: 'WR',
      nflTeam: 'MIN',
      jerseyNumber: 18,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4262921.png&w=350&h=254',
      projectedPoints: 18.6,
      seasonAvgPoints: 17.8,
      opponentDifficulty: 'normal',
      nextOpponent: '@ GB',
      byeWeek: 6,
      injuryStatus: 'ACTIVE',
      stats: { targets: 10, receptions: 7, receivingYards: 112, touchdowns: 1, snapSharePercent: 96 },
    },
    {
      id: 'p_saquon',
      espnPlayerId: '3929630',
      fullName: 'Saquon Barkley',
      position: 'RB',
      nflTeam: 'PHI',
      jerseyNumber: 26,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3929630.png&w=350&h=254',
      projectedPoints: 19.4,
      seasonAvgPoints: 20.2,
      opponentDifficulty: 'easy',
      nextOpponent: 'vs CLE',
      byeWeek: 5,
      injuryStatus: 'ACTIVE',
      stats: { targets: 4, rushingYards: 108, receivingYards: 32, touchdowns: 2, snapSharePercent: 84 },
    },
    {
      id: 'p_mahomes',
      espnPlayerId: '3139477',
      fullName: 'Patrick Mahomes',
      position: 'QB',
      nflTeam: 'KC',
      jerseyNumber: 15,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3139477.png&w=350&h=254',
      projectedPoints: 21.2,
      seasonAvgPoints: 19.5,
      opponentDifficulty: 'normal',
      nextOpponent: '@ SF',
      byeWeek: 6,
      injuryStatus: 'ACTIVE',
      stats: { passingYards: 275, touchdowns: 2, snapSharePercent: 100 },
    },
    {
      id: 'p_kittle',
      espnPlayerId: '3040151',
      fullName: 'George Kittle',
      position: 'TE',
      nflTeam: 'SF',
      jerseyNumber: 85,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3040151.png&w=350&h=254',
      projectedPoints: 13.8,
      seasonAvgPoints: 14.2,
      opponentDifficulty: 'hard',
      nextOpponent: 'vs KC',
      byeWeek: 9,
      injuryStatus: 'ACTIVE',
      stats: { targets: 7, receptions: 5, receivingYards: 68, touchdowns: 1, snapSharePercent: 91 },
    },
    {
      id: 'p_deebo',
      espnPlayerId: '3126486',
      fullName: 'Deebo Samuel',
      position: 'WR',
      nflTeam: 'SF',
      jerseyNumber: 1,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3126486.png&w=350&h=254',
      projectedPoints: 14.5,
      seasonAvgPoints: 13.9,
      opponentDifficulty: 'hard',
      nextOpponent: 'vs KC',
      byeWeek: 9,
      injuryStatus: 'QUESTIONABLE',
      stats: { targets: 6, receptions: 4, receivingYards: 55, rushingYards: 18, touchdowns: 0, snapSharePercent: 78 },
    },
  ];

  const mockPlayersTeam2: Player[] = [
    {
      id: 'p_breece',
      espnPlayerId: '4427366',
      fullName: 'Breece Hall',
      position: 'RB',
      nflTeam: 'NYJ',
      jerseyNumber: 20,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4427366.png&w=350&h=254',
      projectedPoints: 18.2,
      seasonAvgPoints: 16.7,
      opponentDifficulty: 'easy',
      nextOpponent: 'vs PIT',
      byeWeek: 12,
      injuryStatus: 'ACTIVE',
      stats: { targets: 6, rushingYards: 84, receivingYards: 45, touchdowns: 1, snapSharePercent: 82 },
    },
    {
      id: 'p_ceedee',
      espnPlayerId: '4241389',
      fullName: 'CeeDee Lamb',
      position: 'WR',
      nflTeam: 'DAL',
      jerseyNumber: 88,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4241389.png&w=350&h=254',
      projectedPoints: 19.8,
      seasonAvgPoints: 18.9,
      opponentDifficulty: 'normal',
      nextOpponent: '@ SF',
      byeWeek: 7,
      injuryStatus: 'ACTIVE',
      stats: { targets: 11, receptions: 8, receivingYards: 98, touchdowns: 1, snapSharePercent: 95 },
    },
    {
      id: 'p_henry',
      espnPlayerId: '3043078',
      fullName: 'Derrick Henry',
      position: 'RB',
      nflTeam: 'BAL',
      jerseyNumber: 22,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3043078.png&w=350&h=254',
      projectedPoints: 19.5,
      seasonAvgPoints: 21.0,
      opponentDifficulty: 'easy',
      nextOpponent: '@ TB',
      byeWeek: 14,
      injuryStatus: 'ACTIVE',
      stats: { rushingYards: 132, touchdowns: 2, snapSharePercent: 68 },
    },
    {
      id: 'p_kelce',
      espnPlayerId: '15847',
      fullName: 'Travis Kelce',
      position: 'TE',
      nflTeam: 'KC',
      jerseyNumber: 87,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/15847.png&w=350&h=254',
      projectedPoints: 13.2,
      seasonAvgPoints: 12.4,
      opponentDifficulty: 'normal',
      nextOpponent: '@ SF',
      byeWeek: 6,
      injuryStatus: 'ACTIVE',
      stats: { targets: 8, receptions: 6, receivingYards: 62, touchdowns: 0, snapSharePercent: 88 },
    },
  ];

  const mockPlayersTeam3: Player[] = [
    {
      id: 'p_chase',
      espnPlayerId: '4362628',
      fullName: "Ja'Marr Chase",
      position: 'WR',
      nflTeam: 'CIN',
      jerseyNumber: 1,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4362628.png&w=350&h=254',
      projectedPoints: 20.4,
      seasonAvgPoints: 19.7,
      opponentDifficulty: 'normal',
      nextOpponent: '@ CLE',
      byeWeek: 12,
      injuryStatus: 'ACTIVE',
      stats: { targets: 10, receptions: 7, receivingYards: 125, touchdowns: 2, snapSharePercent: 93 },
    },
    {
      id: 'p_bijan',
      espnPlayerId: '4430807',
      fullName: 'Bijan Robinson',
      position: 'RB',
      nflTeam: 'ATL',
      jerseyNumber: 7,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4430807.png&w=350&h=254',
      projectedPoints: 17.9,
      seasonAvgPoints: 17.1,
      opponentDifficulty: 'easy',
      nextOpponent: 'vs SEA',
      byeWeek: 12,
      injuryStatus: 'ACTIVE',
      stats: { targets: 5, rushingYards: 95, receivingYards: 35, touchdowns: 1, snapSharePercent: 79 },
    },
    {
      id: 'p_allen',
      espnPlayerId: '3918298',
      fullName: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      jerseyNumber: 17,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3918298.png&w=350&h=254',
      projectedPoints: 23.5,
      seasonAvgPoints: 22.8,
      opponentDifficulty: 'easy',
      nextOpponent: 'vs TEN',
      byeWeek: 12,
      injuryStatus: 'ACTIVE',
      stats: { passingYards: 240, rushingYards: 45, touchdowns: 3, snapSharePercent: 100 },
    },
    {
      id: 'p_amonra',
      espnPlayerId: '4374302',
      fullName: 'Amon-Ra St. Brown',
      position: 'WR',
      nflTeam: 'DET',
      jerseyNumber: 14,
      headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4374302.png&w=350&h=254',
      projectedPoints: 18.1,
      seasonAvgPoints: 17.5,
      opponentDifficulty: 'normal',
      nextOpponent: '@ MIN',
      byeWeek: 5,
      injuryStatus: 'ACTIVE',
      stats: { targets: 9, receptions: 7, receivingYards: 88, touchdowns: 1, snapSharePercent: 92 },
    },
  ];

  return {
    id: 'league_mock_123',
    espnLeagueId: '12345678',
    seasonId: '2024',
    name: 'The Gridiron Champions League',
    isPrivate: false,
    lastSyncedAt: new Date().toISOString(),
    teams: [
      {
        id: 'team_1',
        espnTeamId: '1',
        name: 'The Touchdown Savants',
        ownerName: 'You (Manager)',
        logoUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=100&h=100&fit=crop',
        roster: mockPlayersTeam1,
      },
      {
        id: 'team_2',
        espnTeamId: '2',
        name: 'Gridiron Gladiators',
        ownerName: 'Dave Miller',
        logoUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&h=100&fit=crop',
        roster: mockPlayersTeam2,
      },
      {
        id: 'team_3',
        espnTeamId: '3',
        name: 'Endzone Dynasty',
        ownerName: 'Sarah Jenkins',
        logoUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=100&h=100&fit=crop',
        roster: mockPlayersTeam3,
      },
    ],
  };
}
