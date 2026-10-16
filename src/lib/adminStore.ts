export interface AdminUserSummary {
  id: string;
  username: string;
  claimedTeams: Record<string, string>;
  isSuperUser?: boolean;
  createdAt: string;
}

export interface AdminTeamSummary {
  id: string;
  espnTeamId?: string;
  name: string;
  logoUrl?: string | null;
  ownerName?: string;
  isClaimed: boolean;
  claimedBy?: string;
  claimedByUserId?: string;
  rosterCount: number;
}

export interface AdminLeagueSummary {
  id: string;
  espnLeagueId: string;
  name: string;
  seasonId?: string;
  isPrivate?: boolean;
  teamsCount: number;
  swipesCount: number;
  matchesCount: number;
  claimedCount: number;
  lastSyncedAt?: string;
  teams: AdminTeamSummary[];
}

export interface AdminOverviewResponse {
  success: boolean;
  users: AdminUserSummary[];
  leagues: AdminLeagueSummary[];
  error?: string;
}

export async function fetchAdminOverview(token: string): Promise<AdminOverviewResponse> {
  const res = await fetch('/api/admin', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to load admin overview.');
  }

  return data;
}

export async function adminDeleteUser(userId: string, token: string): Promise<void> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'delete_user',
      userId,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete user.');
  }
}

export async function adminDeleteLeague(leagueId: string, token: string): Promise<void> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'delete_league',
      leagueId,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete league.');
  }
}

export async function adminAssignTeam(
  leagueId: string,
  teamId: string,
  userId: string,
  token: string
): Promise<void> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'assign_team',
      leagueId,
      teamId,
      userId,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to assign user to team.');
  }
}

export async function adminUnassignTeam(
  leagueId: string,
  teamId: string,
  token: string
): Promise<void> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'unassign_team',
      leagueId,
      teamId,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to unassign team.');
  }
}
