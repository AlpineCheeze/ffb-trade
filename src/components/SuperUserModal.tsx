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
  Flame,
  ArrowRight,
  ArrowLeftRight,
  Activity,
  Filter,
  Clock,
} from 'lucide-react';
import {
  fetchAdminOverview,
  fetchAdminLeagueSwipes,
  adminDeleteUser,
  adminDeleteLeague,
  adminAssignTeam,
  adminUnassignTeam,
  AdminUserSummary,
  AdminLeagueSummary,
  AdminTeamSummary,
  AdminSwipeDetail,
  AdminLeagueSwipesResponse,
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

  // Swipe activity view states per league
  const [leagueSubTab, setLeagueSubTab] = useState<Record<string, 'teams' | 'swipes'>>({});
  const [leagueSwipesData, setLeagueSwipesData] = useState<Record<string, AdminLeagueSwipesResponse>>({});
  const [loadingSwipesLeagueId, setLoadingSwipesLeagueId] = useState<string | null>(null);
  const [swipesTeamFilter, setSwipesTeamFilter] = useState<Record<string, string>>({});
  const [swipesActionFilter, setSwipesActionFilter] = useState<Record<string, 'all' | 'want' | 'pass' | 'matched'>>({});
  const [swipesSearch, setSwipesSearch] = useState<Record<string, string>>({});
  const [swipesSort, setSwipesSort] = useState<Record<string, 'newest' | 'oldest'>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadLeagueSwipes = useCallback(async (leagueId: string, forceRefresh = false) => {
    if (!forceRefresh && leagueSwipesData[leagueId]) {
      return;
    }
    const token = getStoredToken();
    if (!token) return;

    setLoadingSwipesLeagueId(leagueId);
    try {
      const data = await fetchAdminLeagueSwipes(leagueId, token);
      setLeagueSwipesData((prev) => ({ ...prev, [leagueId]: data }));
    } catch (err: any) {
      showToast(err.message || `Failed to load swipe activity for league #${leagueId}.`);
    } finally {
      setLoadingSwipesLeagueId(null);
    }
  }, [leagueSwipesData]);

  const handleOpenSwipes = (leagueId: string) => {
    setExpandedLeagueId(leagueId);
    setLeagueSubTab((prev) => ({ ...prev, [leagueId]: 'swipes' }));
    loadLeagueSwipes(leagueId);
  };

  const handleToggleTeams = (leagueId: string) => {
    if (expandedLeagueId === leagueId && leagueSubTab[leagueId] === 'teams') {
      setExpandedLeagueId(null);
    } else {
      setExpandedLeagueId(leagueId);
      setLeagueSubTab((prev) => ({ ...prev, [leagueId]: 'teams' }));
    }
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

                            {/* Swipe Activity Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenSwipes(league.espnLeagueId)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 border ${
                                isExpanded && leagueSubTab[league.espnLeagueId] === 'swipes'
                                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                              }`}
                              title="View all swipe activity for this league"
                            >
                              <Activity className="w-3.5 h-3.5 text-amber-400" />
                              <span>Swipes ({league.swipesCount})</span>
                            </button>

                            {/* Teams Toggle Button */}
                            <button
                              type="button"
                              onClick={() => handleToggleTeams(league.espnLeagueId)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border ${
                                isExpanded && leagueSubTab[league.espnLeagueId] !== 'swipes'
                                  ? 'bg-purple-600/20 border-purple-500/50 text-purple-200'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                              }`}
                            >
                              <Users className="w-3.5 h-3.5 text-purple-400" />
                              <span>Teams ({league.teamsCount})</span>
                              {isExpanded && leagueSubTab[league.espnLeagueId] !== 'swipes' ? (
                                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Content (Swipes Feed or Teams List) */}
                        {isExpanded && (
                          <div className="border-t border-slate-800/80 bg-slate-900/40 animate-in fade-in duration-150">
                            {/* Sub-tab Navigation */}
                            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800/60 bg-slate-950/40">
                              <button
                                type="button"
                                onClick={() => {
                                  setLeagueSubTab((prev) => ({ ...prev, [league.espnLeagueId]: 'swipes' }));
                                  loadLeagueSwipes(league.espnLeagueId);
                                }}
                                className={`px-3 py-2 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                                  leagueSubTab[league.espnLeagueId] === 'swipes'
                                    ? 'text-amber-400 border-amber-400 bg-amber-500/10'
                                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
                                }`}
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Swipe Activity ({league.swipesCount})</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setLeagueSubTab((prev) => ({ ...prev, [league.espnLeagueId]: 'teams' }))
                                }
                                className={`px-3 py-2 rounded-t-xl text-xs font-bold flex items-center gap-2 border-b-2 transition ${
                                  leagueSubTab[league.espnLeagueId] !== 'swipes'
                                    ? 'text-purple-300 border-purple-400 bg-purple-500/10'
                                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
                                }`}
                              >
                                <Users className="w-3.5 h-3.5" />
                                <span>Teams & Claims ({league.teams.length})</span>
                              </button>
                            </div>

                            {/* Sub-tab View 1: Swipe Activity */}
                            {leagueSubTab[league.espnLeagueId] === 'swipes' && (
                              <div className="p-4 space-y-3">
                                {(() => {
                                  const swipesResponse = leagueSwipesData[league.espnLeagueId];
                                  const isLoadingSwipes = loadingSwipesLeagueId === league.espnLeagueId;
                                  const teamFilter = swipesTeamFilter[league.espnLeagueId] || 'all';
                                  const actionFilter = swipesActionFilter[league.espnLeagueId] || 'all';
                                  const searchQuery = (swipesSearch[league.espnLeagueId] || '').toLowerCase().trim();
                                  const sortOrder = swipesSort[league.espnLeagueId] || 'newest';

                                  const allSwipes = swipesResponse?.swipes || [];

                                  const filteredSwipes = allSwipes
                                    .filter((s) => {
                                      if (
                                        teamFilter !== 'all' &&
                                        s.teamId !== teamFilter &&
                                        s.targetTeamId !== teamFilter
                                      ) {
                                        return false;
                                      }
                                      if (actionFilter === 'want' && !s.isInterested) return false;
                                      if (actionFilter === 'pass' && s.isInterested) return false;
                                      if (actionFilter === 'matched' && !s.isMatched) return false;

                                      if (searchQuery) {
                                        const matchInitiating =
                                          s.teamName.toLowerCase().includes(searchQuery) ||
                                          (s.claimedBy && s.claimedBy.toLowerCase().includes(searchQuery));
                                        const matchTarget =
                                          (s.targetTeamName &&
                                            s.targetTeamName.toLowerCase().includes(searchQuery)) ||
                                          (s.targetClaimedBy &&
                                            s.targetClaimedBy.toLowerCase().includes(searchQuery));
                                        const matchOffered = s.offeredPlayers.some((p) =>
                                          p.fullName.toLowerCase().includes(searchQuery)
                                        );
                                        const matchTargetPlayers = s.targetPlayers.some((p) =>
                                          p.fullName.toLowerCase().includes(searchQuery)
                                        );
                                        if (
                                          !matchInitiating &&
                                          !matchTarget &&
                                          !matchOffered &&
                                          !matchTargetPlayers
                                        ) {
                                          return false;
                                        }
                                      }
                                      return true;
                                    })
                                    .sort((a, b) => {
                                      const timeA = new Date(a.createdAt || 0).getTime();
                                      const timeB = new Date(b.createdAt || 0).getTime();
                                      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
                                    });

                                  const totalSwipes = swipesResponse?.totalSwipesCount ?? 0;
                                  const wants = swipesResponse?.wantsCount ?? 0;
                                  const passes = swipesResponse?.passesCount ?? 0;
                                  const matches = swipesResponse?.matchesCount ?? 0;
                                  const wantRate =
                                    swipesResponse?.wantRate ??
                                    (totalSwipes > 0 ? Math.round((wants / totalSwipes) * 100) : 0);

                                  return (
                                    <>
                                      {/* Metrics Banner */}
                                      {swipesResponse && (
                                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-center">
                                          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                                            <div className="text-[10px] uppercase font-bold text-slate-400">
                                              Total Swipes
                                            </div>
                                            <div className="text-base font-black text-white">
                                              {totalSwipes}
                                            </div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                            <div className="text-[10px] uppercase font-bold text-emerald-400">
                                              Wants
                                            </div>
                                            <div className="text-base font-black text-emerald-300">
                                              {wants}
                                            </div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                                            <div className="text-[10px] uppercase font-bold text-rose-400">
                                              Passes
                                            </div>
                                            <div className="text-base font-black text-rose-300">
                                              {passes}
                                            </div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                            <div className="text-[10px] uppercase font-bold text-amber-400">
                                              Want Rate
                                            </div>
                                            <div className="text-base font-black text-amber-300">
                                              {wantRate}%
                                            </div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 col-span-2 sm:col-span-1">
                                            <div className="text-[10px] uppercase font-bold text-purple-400">
                                              Matches
                                            </div>
                                            <div className="text-base font-black text-purple-300">
                                              {matches}
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Search & Filter Controls */}
                                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        <div className="relative flex-1">
                                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                          <input
                                            type="text"
                                            value={swipesSearch[league.espnLeagueId] || ''}
                                            onChange={(e) =>
                                              setSwipesSearch((prev) => ({
                                                ...prev,
                                                [league.espnLeagueId]: e.target.value,
                                              }))
                                            }
                                            placeholder="Search player, team, or @user..."
                                            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                                          />
                                        </div>

                                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                                          {/* Team Filter */}
                                          <select
                                            value={teamFilter}
                                            onChange={(e) =>
                                              setSwipesTeamFilter((prev) => ({
                                                ...prev,
                                                [league.espnLeagueId]: e.target.value,
                                              }))
                                            }
                                            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
                                          >
                                            <option value="all">All Teams</option>
                                            {league.teams.map((t) => (
                                              <option key={t.id} value={t.id}>
                                                {t.name}
                                              </option>
                                            ))}
                                          </select>

                                          {/* Action Filter */}
                                          <select
                                            value={actionFilter}
                                            onChange={(e) =>
                                              setSwipesActionFilter((prev) => ({
                                                ...prev,
                                                [league.espnLeagueId]: e.target.value as any,
                                              }))
                                            }
                                            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
                                          >
                                            <option value="all">All Actions</option>
                                            <option value="want">Wants Only</option>
                                            <option value="pass">Passes Only</option>
                                            <option value="matched">Mutual Matches Only</option>
                                          </select>

                                          {/* Sort Order */}
                                          <select
                                            value={sortOrder}
                                            onChange={(e) =>
                                              setSwipesSort((prev) => ({
                                                ...prev,
                                                [league.espnLeagueId]: e.target.value as any,
                                              }))
                                            }
                                            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
                                          >
                                            <option value="newest">Newest First</option>
                                            <option value="oldest">Oldest First</option>
                                          </select>

                                          {/* Refresh Button */}
                                          <button
                                            type="button"
                                            disabled={isLoadingSwipes}
                                            onClick={() => loadLeagueSwipes(league.espnLeagueId, true)}
                                            className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition flex-shrink-0 disabled:opacity-50"
                                            title="Refresh swipe records"
                                          >
                                            <RefreshCw
                                              className={`w-3.5 h-3.5 ${
                                                isLoadingSwipes ? 'animate-spin text-amber-400' : ''
                                              }`}
                                            />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Loading Spinner */}
                                      {isLoadingSwipes && !swipesResponse && (
                                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                                          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                                          <span>Loading swipe activity from server store...</span>
                                        </div>
                                      )}

                                      {/* Empty States */}
                                      {!isLoadingSwipes && allSwipes.length === 0 && (
                                        <div className="py-10 text-center rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-400 text-xs space-y-1">
                                          <Activity className="w-6 h-6 mx-auto text-slate-600 mb-1" />
                                          <div className="font-semibold text-slate-300">
                                            No Swipes Recorded Yet
                                          </div>
                                          <p className="text-[11px] text-slate-500">
                                            Managers in this league have not swiped on any trade packages yet.
                                          </p>
                                        </div>
                                      )}

                                      {!isLoadingSwipes &&
                                        allSwipes.length > 0 &&
                                        filteredSwipes.length === 0 && (
                                          <div className="py-8 text-center rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-400 text-xs space-y-1">
                                            <Filter className="w-5 h-5 mx-auto text-slate-600 mb-1" />
                                            <div className="font-semibold text-slate-300">
                                              No Swipes Match Filter
                                            </div>
                                            <p className="text-[11px] text-slate-500">
                                              Try clearing your search query or changing the team/action filters.
                                            </p>
                                          </div>
                                        )}

                                      {/* Swipes Feed */}
                                      {filteredSwipes.length > 0 && (
                                        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                                          {filteredSwipes.map((swipe) => {
                                            const formattedDate = swipe.createdAt
                                              ? new Date(swipe.createdAt).toLocaleString([], {
                                                  month: 'short',
                                                  day: 'numeric',
                                                  hour: 'numeric',
                                                  minute: '2-digit',
                                                })
                                              : 'Unknown time';

                                            return (
                                              <div
                                                key={swipe.id}
                                                className={`p-3.5 rounded-xl border transition text-left space-y-2.5 ${
                                                  swipe.isMatched
                                                    ? 'bg-purple-950/20 border-purple-500/40 hover:border-purple-500/60'
                                                    : swipe.isInterested
                                                    ? 'bg-slate-950 border-emerald-500/30 hover:border-emerald-500/50'
                                                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                                                }`}
                                              >
                                                {/* Header: Teams, Action, Reciprocity & Time */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                                                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                    {/* Initiating Team */}
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                      {swipe.teamLogoUrl ? (
                                                        <img
                                                          src={swipe.teamLogoUrl}
                                                          alt={swipe.teamName}
                                                          className="w-5 h-5 rounded-md object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                                                        />
                                                      ) : (
                                                        <div className="w-5 h-5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold text-[9px] flex items-center justify-center flex-shrink-0">
                                                          {swipe.teamName.slice(0, 2).toUpperCase()}
                                                        </div>
                                                      )}
                                                      <span className="text-xs font-bold text-white truncate max-w-[130px]">
                                                        {swipe.teamName}
                                                      </span>
                                                      {swipe.claimedBy && (
                                                        <span className="text-[10px] text-purple-300 font-medium">
                                                          (@{swipe.claimedBy})
                                                        </span>
                                                      )}
                                                    </div>

                                                    <ArrowRight className="w-3 h-3 text-slate-500 flex-shrink-0" />

                                                    {/* Target Team */}
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                      {swipe.targetTeamLogoUrl ? (
                                                        <img
                                                          src={swipe.targetTeamLogoUrl}
                                                          alt={swipe.targetTeamName || 'Opponent'}
                                                          className="w-5 h-5 rounded-md object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                                                        />
                                                      ) : (
                                                        <div className="w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[9px] flex items-center justify-center flex-shrink-0">
                                                          {(swipe.targetTeamName || 'OP').slice(0, 2).toUpperCase()}
                                                        </div>
                                                      )}
                                                      <span className="text-xs font-bold text-slate-200 truncate max-w-[130px]">
                                                        {swipe.targetTeamName || `Team #${swipe.targetTeamId}`}
                                                      </span>
                                                      {swipe.targetClaimedBy && (
                                                        <span className="text-[10px] text-purple-300 font-medium">
                                                          (@{swipe.targetClaimedBy})
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>

                                                  {/* Action Badge & Mutual Match Status */}
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    {swipe.isInterested ? (
                                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
                                                        <Flame className="w-2.5 h-2.5" />
                                                        WANT
                                                      </span>
                                                    ) : (
                                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center gap-1">
                                                        <X className="w-2.5 h-2.5" />
                                                        PASS
                                                      </span>
                                                    )}

                                                    {swipe.isMatched ? (
                                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center gap-1">
                                                        🤝 Confirmed Match
                                                      </span>
                                                    ) : swipe.targetResponse === 'want' ? (
                                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1">
                                                        🔥 Opponent Liked
                                                      </span>
                                                    ) : swipe.targetResponse === 'pass' ? (
                                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-400">
                                                        ✕ Opponent Passed
                                                      </span>
                                                    ) : (
                                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-900/80 border border-slate-800/80 text-slate-500 flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        Awaiting
                                                      </span>
                                                    )}

                                                    <span className="text-[10px] text-slate-500 font-mono pl-1">
                                                      {formattedDate}
                                                    </span>
                                                  </div>
                                                </div>

                                                {/* Trade Package Players Grid */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                                                  {/* Offered Players (Initiator Gives) */}
                                                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/70 space-y-1.5">
                                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                      <span>Offered by {swipe.teamName}</span>
                                                      <span className="text-slate-500 font-mono">
                                                        {swipe.tradeType.split('-for-')[0] ||
                                                          swipe.offeredPlayers.length}{' '}
                                                        Player
                                                        {swipe.offeredPlayers.length > 1 ? 's' : ''}
                                                      </span>
                                                    </div>

                                                    <div className="space-y-1">
                                                      {swipe.offeredPlayers.length > 0 ? (
                                                        swipe.offeredPlayers.map((player) => (
                                                          <div
                                                            key={player.id}
                                                            className="flex items-center justify-between p-1.5 rounded-md bg-slate-950/80 border border-slate-800/60"
                                                          >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                              {player.headshotUrl ? (
                                                                <img
                                                                  src={player.headshotUrl}
                                                                  alt={player.fullName}
                                                                  className="w-6 h-6 rounded-full object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                                                                />
                                                              ) : (
                                                                <div className="w-6 h-6 rounded-full bg-slate-800 text-[9px] font-bold text-slate-400 flex items-center justify-center flex-shrink-0">
                                                                  {player.position}
                                                                </div>
                                                             )}
                                                              <div className="min-w-0">
                                                                <div className="text-xs font-semibold text-white truncate">
                                                                  {player.fullName}
                                                                </div>
                                                                <div className="text-[9px] text-slate-400 flex items-center gap-1">
                                                                  <span className="font-bold text-amber-400">
                                                                    {player.position}
                                                                  </span>
                                                                  <span>•</span>
                                                                  <span>{player.nflTeam}</span>
                                                                </div>
                                                              </div>
                                                            </div>
                                                            <div className="text-[10px] font-bold text-emerald-400 font-mono ml-2">
                                                              {player.projectedPoints?.toFixed(1) || '0.0'} Proj
                                                            </div>
                                                          </div>
                                                        ))
                                                      ) : (
                                                        <div className="text-[10px] text-slate-500 italic p-1">
                                                          {swipe.offeredPlayerIds.join(', ') || 'No player IDs'}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>

                                                  {/* Requested Players (Target Gives) */}
                                                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/70 space-y-1.5">
                                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                      <span>Requested from {swipe.targetTeamName || 'Opponent'}</span>
                                                      <span className="text-slate-500 font-mono">
                                                        {swipe.tradeType.split('-for-')[1] ||
                                                          swipe.targetPlayers.length}{' '}
                                                        Player
                                                        {swipe.targetPlayers.length > 1 ? 's' : ''}
                                                      </span>
                                                    </div>

                                                    <div className="space-y-1">
                                                      {swipe.targetPlayers.length > 0 ? (
                                                        swipe.targetPlayers.map((player) => (
                                                          <div
                                                            key={player.id}
                                                            className="flex items-center justify-between p-1.5 rounded-md bg-slate-950/80 border border-slate-800/60"
                                                          >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                              {player.headshotUrl ? (
                                                                <img
                                                                  src={player.headshotUrl}
                                                                  alt={player.fullName}
                                                                  className="w-6 h-6 rounded-full object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                                                                />
                                                             ) : (
                                                                <div className="w-6 h-6 rounded-full bg-slate-800 text-[9px] font-bold text-slate-400 flex items-center justify-center flex-shrink-0">
                                                                  {player.position}
                                                                </div>
                                                              )}
                                                              <div className="min-w-0">
                                                                <div className="text-xs font-semibold text-white truncate">
                                                                  {player.fullName}
                                                                </div>
                                                                <div className="text-[9px] text-slate-400 flex items-center gap-1">
                                                                  <span className="font-bold text-amber-400">
                                                                    {player.position}
                                                                  </span>
                                                                  <span>•</span>
                                                                  <span>{player.nflTeam}</span>
                                                                </div>
                                                              </div>
                                                            </div>
                                                            <div className="text-[10px] font-bold text-emerald-400 font-mono ml-2">
                                                              {player.projectedPoints?.toFixed(1) || '0.0'} Proj
                                                            </div>
                                                          </div>
                                                        ))
                                                      ) : (
                                                        <div className="text-[10px] text-slate-500 italic p-1">
                                                          {swipe.targetPlayerIds.join(', ') || 'No player IDs'}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Sub-tab View 2: Teams & Claims */}
                            {leagueSubTab[league.espnLeagueId] !== 'swipes' && (
                              <div className="p-4 space-y-2">
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
