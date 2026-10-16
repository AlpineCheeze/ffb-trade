'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  X,
  Users,
  Trophy,
  Trash2,
  UserCheck,
  UserX,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Crown,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  fetchAdminOverview,
  adminDeleteUser,
  adminDeleteLeague,
  adminAssignTeam,
  adminUnassignTeam,
  AdminUserSummary,
  AdminLeagueSummary,
  AdminTeamSummary,
} from '@/lib/adminStore';
import { getStoredToken } from '@/lib/authStore';

interface SuperUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshAppState?: () => void;
}

export const SuperUserModal: React.FC<SuperUserModalProps> = ({
  isOpen,
  onClose,
  onRefreshAppState,
}) => {
  const [activeTab, setActiveTab] = useState<'leagues' | 'users'>('leagues');
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [leagues, setLeagues] = useState<AdminLeagueSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & filter states
  const [leagueSearch, setLeagueSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [expandedLeagueId, setExpandedLeagueId] = useState<string | null>(null);

  // In-flight action states
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [confirmDeleteLeagueId, setConfirmDeleteLeagueId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Assign user modal/dropdown selection per team
  const [assigningTeamKey, setAssigningTeamKey] = useState<string | null>(null); // `${leagueId}_${teamId}`
  const [selectedAssignUserId, setSelectedAssignUserId] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setError('No session token available. Please log in as superu.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOverview(token);
      setUsers(res.users);
      setLeagues(res.leagues);
      if (res.leagues.length > 0) {
        setExpandedLeagueId((prev) => prev || res.leagues[0].espnLeagueId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load superuser console data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handlers
  const handleDeleteLeague = async (leagueId: string) => {
    const token = getStoredToken();
    if (!token) return;

    setBusyActionKey(`del_league_${leagueId}`);
    try {
      await adminDeleteLeague(leagueId, token);
      showToast(`League #${leagueId} deleted successfully.`);
      setConfirmDeleteLeagueId(null);
      await loadData();
      onRefreshAppState?.();
    } catch (err: any) {
      setError(err.message || 'Failed to delete league.');
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    const token = getStoredToken();
    if (!token) return;

    setBusyActionKey(`del_user_${userId}`);
    try {
      await adminDeleteUser(userId, token);
      showToast(`User @${username} deleted and unassigned from all teams.`);
      setConfirmDeleteUserId(null);
      await loadData();
      onRefreshAppState?.();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleAssignTeam = async (leagueId: string, teamId: string, userId: string) => {
    const token = getStoredToken();
    if (!token || !userId) return;

    const userObj = users.find((u) => u.id === userId);
    setBusyActionKey(`assign_${leagueId}_${teamId}`);
    try {
      await adminAssignTeam(leagueId, teamId, userId, token);
      showToast(`Assigned @${userObj?.username || userId} to team ${teamId}.`);
      setAssigningTeamKey(null);
      setSelectedAssignUserId('');
      await loadData();
      onRefreshAppState?.();
    } catch (err: any) {
      setError(err.message || 'Failed to assign team.');
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleUnassignTeam = async (leagueId: string, teamId: string) => {
    const token = getStoredToken();
    if (!token) return;

    setBusyActionKey(`unassign_${leagueId}_${teamId}`);
    try {
      await adminUnassignTeam(leagueId, teamId, token);
      showToast(`Team ${teamId} is now unassigned.`);
      await loadData();
      onRefreshAppState?.();
    } catch (err: any) {
      setError(err.message || 'Failed to unassign team.');
    } finally {
      setBusyActionKey(null);
    }
  };

  // Filtered lists
  const filteredLeagues = useMemo(() => {
    const q = leagueSearch.trim().toLowerCase();
    if (!q) return leagues;
    return leagues.filter(
      (l) => l.name.toLowerCase().includes(q) || l.espnLeagueId.includes(q)
    );
  }, [leagues, leagueSearch]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.username.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-purple-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-left">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Super User Console
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Root Admin
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Manage all leagues, registered users, and team ownership assignments
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50"
              title="Refresh console data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-emerald-500/90 text-white text-xs font-bold shadow-xl flex items-center gap-2 backdrop-blur-md animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="px-5 py-2.5 bg-rose-500/10 border-b border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs text-rose-300 hover:text-white underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-800 flex items-center gap-2 flex-shrink-0 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('leagues')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'leagues'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Leagues & Teams</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950/60">
              {leagues.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'users'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users Directory</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950/60">
              {users.length}
            </span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* ================================================================= */}
          {/* TAB 1: LEAGUES & TEAMS MANAGEMENT */}
          {/* ================================================================= */}
          {activeTab === 'leagues' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search leagues by name or ESPN ID..."
                  value={leagueSearch}
                  onChange={(e) => setLeagueSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-purple-500 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>

              {filteredLeagues.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No leagues found matching your search.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeagues.map((league) => {
                    const isExpanded = expandedLeagueId === league.espnLeagueId;
                    const isDeletingThis = busyActionKey === `del_league_${league.espnLeagueId}`;

                    return (
                      <div
                        key={league.espnLeagueId}
                        className="rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition overflow-hidden"
                      >
                        {/* League Header Card */}
                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                ESPN #{league.espnLeagueId}
                              </span>
                              {league.seasonId && (
                                <span className="text-[10px] text-slate-500">
                                  Season {league.seasonId}
                                </span>
                              )}
                              {league.isPrivate && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  Private
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm sm:text-base font-bold text-white truncate mt-1">
                              {league.name}
                            </h3>

                            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                              <span><strong>{league.teamsCount}</strong> Teams</span>
                              <span>•</span>
                              <span className="text-emerald-400">
                                <strong>{league.claimedCount}</strong> Claimed
                              </span>
                              <span>•</span>
                              <span><strong>{league.matchesCount}</strong> Matches</span>
                              <span>•</span>
                              <span><strong>{league.swipesCount}</strong> Swipes</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {confirmDeleteLeagueId === league.espnLeagueId ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-rose-400 font-bold">
                                  Delete all data?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLeague(league.espnLeagueId)}
                                  disabled={isDeletingThis}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-50"
                                >
                                  {isDeletingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteLeagueId(null)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteLeagueId(league.espnLeagueId)}
                                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-600/20 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                                title="Delete this league from database"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Delete League</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLeagueId(isExpanded ? null : league.espnLeagueId)
                              }
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
                            >
                              <span>Teams</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Teams & Claims List */}
                        {isExpanded && (
                          <div className="p-4 pt-1 border-t border-slate-800/80 bg-slate-900/40 space-y-2 animate-in fade-in duration-150">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                              Roster Teams ({league.teams.length})
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                              {league.teams.map((team: AdminTeamSummary) => {
                                const teamAssignKey = `${league.espnLeagueId}_${team.id}`;
                                const isAssigningThis = assigningTeamKey === teamAssignKey;
                                const isActionBusy =
                                  busyActionKey === `assign_${league.espnLeagueId}_${team.id}` ||
                                  busyActionKey === `unassign_${league.espnLeagueId}_${team.id}`;

                                return (
                                  <div
                                    key={team.id}
                                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {team.logoUrl ? (
                                        <img
                                          src={team.logoUrl}
                                          alt={team.name}
                                          className="w-8 h-8 rounded-lg object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-black text-xs flex items-center justify-center flex-shrink-0">
                                          {team.name.slice(0, 2).toUpperCase()}
                                        </div>
                                      )}

                                      <div className="min-w-0">
                                        <div className="text-xs font-bold text-white truncate">
                                          {team.name}
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                                          <span>Owner: {team.ownerName}</span>
                                          <span>•</span>
                                          <span>{team.rosterCount} Players</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Claim Status & Actions */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {team.isClaimed ? (
                                        <>
                                          <div className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
                                            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                            <span>
                                              Claimed: <strong>@{team.claimedBy}</strong>
                                            </span>
                                          </div>

                                          <button
                                            type="button"
                                            disabled={isActionBusy}
                                            onClick={() => handleUnassignTeam(league.espnLeagueId, team.id)}
                                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-rose-600/20 border border-slate-800 hover:border-rose-500/40 text-rose-400 text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50"
                                            title="Unassign user from this team"
                                          >
                                            {isActionBusy ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <>
                                                <UserX className="w-3 h-3" />
                                                <span>Unassign</span>
                                              </>
                                            )}
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-[11px] text-slate-500 font-medium">
                                            Unclaimed
                                          </span>

                                          {isAssigningThis ? (
                                            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-purple-500/40">
                                              <select
                                                value={selectedAssignUserId}
                                                onChange={(e) => setSelectedAssignUserId(e.target.value)}
                                                className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white outline-none"
                                              >
                                                <option value="">Select User...</option>
                                                {users.map((u) => (
                                                  <option key={u.id} value={u.id}>
                                                    @{u.username}
                                                  </option>
                                                ))}
                                              </select>

                                              <button
                                                type="button"
                                                disabled={!selectedAssignUserId || isActionBusy}
                                                onClick={() =>
                                                  handleAssignTeam(
                                                    league.espnLeagueId,
                                                    team.id,
                                                    selectedAssignUserId
                                                  )
                                                }
                                                className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold transition"
                                              >
                                                {isActionBusy ? (
                                                  <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  'Assign'
                                                )}
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setAssigningTeamKey(null);
                                                  setSelectedAssignUserId('');
                                                }}
                                                className="px-1.5 py-1 text-slate-400 hover:text-white text-xs"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setAssigningTeamKey(teamAssignKey);
                                                setSelectedAssignUserId(users[0]?.id || '');
                                              }}
                                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-purple-600/20 border border-slate-800 hover:border-purple-500/40 text-purple-300 text-xs font-semibold flex items-center gap-1 transition"
                                            >
                                              <UserCheck className="w-3 h-3 text-purple-400" />
                                              <span>Assign User</span>
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: USERS DIRECTORY & MANAGEMENT */}
          {/* ================================================================= */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search users by username or ID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-purple-500 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>

              {filteredUsers.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No users found matching your search.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredUsers.map((user) => {
                    const isRootSuper =
                      user.username.toLowerCase() === 'superu' || user.isSuperUser;
                    const isDeletingThis = busyActionKey === `del_user_${user.id}`;
                    const claimedKeys = Object.entries(user.claimedTeams || {});

                    return (
                      <div
                        key={user.id}
                        className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left ${
                          isRootSuper
                            ? 'bg-purple-950/20 border-purple-500/40'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white">
                              @{user.username}
                            </span>
                            {isRootSuper && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                                <Crown className="w-3 h-3 text-amber-400" />
                                <span>Super User</span>
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-500">
                              {user.id}
                            </span>
                          </div>

                          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                            <span>
                              Joined:{' '}
                              {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString()
                                : 'Active'}
                            </span>
                            <span>•</span>
                            <span>
                              <strong>{claimedKeys.length}</strong> Claimed Team{claimedKeys.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          {/* Claimed Teams chips */}
                          {claimedKeys.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {claimedKeys.map(([leagueId, teamId]) => (
                                <span
                                  key={leagueId}
                                  className="px-2 py-0.5 rounded-lg text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-300"
                                >
                                  League #{leagueId} &rarr; Team {teamId}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {isRootSuper ? (
                            <span className="text-[10px] font-bold text-purple-400/80 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20">
                              Protected Root Account
                            </span>
                          ) : confirmDeleteUserId === user.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-rose-400 font-bold">
                                Delete user?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                disabled={isDeletingThis}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-50"
                              >
                                {isDeletingThis ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  'Confirm'
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUserId(null)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUserId(user.id)}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-600/20 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                              title="Delete user account"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete User</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
