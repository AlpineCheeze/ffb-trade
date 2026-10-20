'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { fetchEspnLeague, normalizeEspnCookies } from '@/lib/espn';
import { getLeagueById, saveLeague, getSavedLeagues } from '@/lib/leagueStore';
import { registerAccount, loginAccount, logoutAccount } from '@/lib/authStore';
import { League, UserAccount, UserClaimedLeagueSummary } from '@/types/fantasy';
import {
  Search,
  Sparkles,
  ArrowRight,
  KeyRound,
  HelpCircle,
  Loader2,
  ShieldCheck,
  Users,
  Trophy,
  User,
  Lock,
  UserCheck,
  LogOut,
  UserPlus,
  LogIn,
  CheckCircle2,
  ChevronRight,
  Flame,
  Crown,
} from 'lucide-react';
import { UnicornLogo } from './UnicornLogo';

interface HomeHeroProps {
  currentUser: UserAccount | null;
  onUserChange: (user: UserAccount | null) => void;
  onSelectLeague: (league: League) => void;
  onSelectLeagueAndTeam?: (leagueId: string, teamId: string) => void;
  onOpenDemo?: () => void;
  pendingLeagueId?: string | null;
  onOpenSuperUser?: () => void;
}

export const HomeHero: React.FC<HomeHeroProps> = ({
  currentUser,
  onUserChange,
  onSelectLeague,
  onSelectLeagueAndTeam,
  onOpenDemo,
  pendingLeagueId,
  onOpenSuperUser,
}) => {
  // Account Form State
  const [authMode, setAuthMode] = useState<'register' | 'login'>('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);

  // League Search State
  const [leagueIdInput, setLeagueIdInput] = useState('');
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [showPrivateFields, setShowPrivateFields] = useState(false);
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLeagues, setSavedLeagues] = useState<League[]>([]);

  useEffect(() => {
    setSavedLeagues(getSavedLeagues());
  }, []);

  const handleEspnS2Change = (val: string) => {
    setEspnS2(val);
    if (val.includes('SWID=') || val.includes('espn_s2=')) {
      const norm = normalizeEspnCookies(val, swid);
      if (norm.espnS2) setEspnS2(norm.espnS2);
      if (norm.swid) setSwid(norm.swid);
    }
  };

  const handleSwidChange = (val: string) => {
    setSwid(val);
    if (val.includes('espn_s2=')) {
      const norm = normalizeEspnCookies(espnS2, val);
      if (norm.espnS2) setEspnS2(norm.espnS2);
      if (norm.swid) setSwid(norm.swid);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim();
    if (!cleanUser) {
      setAuthError('Please enter a username.');
      return;
    }
    if (!passwordInput) {
      setAuthError('Please enter a password.');
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMsg(null);

    try {
      let user: UserAccount;
      if (authMode === 'register') {
        user = await registerAccount(cleanUser, passwordInput);
        setAuthSuccessMsg(`Account created! Welcome, @${user.username}.`);
      } else {
        user = await loginAccount(cleanUser, passwordInput);
        setAuthSuccessMsg(`Welcome back, @${user.username}!`);
      }
      setIsAuthLoading(false);
      setUsernameInput('');
      setPasswordInput('');
      onUserChange(user);
      setTimeout(() => setAuthSuccessMsg(null), 3500);
    } catch (err: any) {
      setIsAuthLoading(false);
      setAuthError(err.message || 'Authentication failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    await logoutAccount();
    onUserChange(null);
  };

  const handleSearchOrRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = leagueIdInput.trim();
    if (!cleanId) {
      setError('Please enter your ESPN League ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const norm = normalizeEspnCookies(espnS2, swid);
      const hasCookies = Boolean(norm.espnS2 && norm.swid);

      if (!hasCookies) {
        const existing = getLeagueById(cleanId);
        if (existing) {
          setIsLoading(false);
          onSelectLeague(existing);
          return;
        }
      }

      const fetched = await fetchEspnLeague({
        leagueId: cleanId,
        espnS2: norm.espnS2,
        swid: norm.swid,
      });

      const saved = saveLeague(fetched);
      if (norm.espnS2 && norm.swid && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`espn_creds_${cleanId}`, JSON.stringify({ espnS2: norm.espnS2, swid: norm.swid }));
        } catch {}
      }
      setIsLoading(false);
      onSelectLeague(saved);
    } catch (err: any) {
      setIsLoading(false);
      setError(
        err.message || 'Could not find ESPN league. If it is a private league, please provide your ESPN session cookies.'
      );
      if (err.message?.toLowerCase().includes('private') || err.message?.toLowerCase().includes('cookie') || err.message?.toLowerCase().includes('credentials')) {
        setShowPrivateFields(true);
      }
    }
  };

  const claimedSummaries: UserClaimedLeagueSummary[] = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.claimedLeaguesDetails && currentUser.claimedLeaguesDetails.length > 0) {
      return currentUser.claimedLeaguesDetails;
    }
    const summaries: UserClaimedLeagueSummary[] = [];
    const entries = Object.entries(currentUser.claimedTeams || {});
    for (const [leagueId, teamId] of entries) {
      const local = getLeagueById(leagueId);
      if (local) {
        const team = local.teams.find((t) => t.id === teamId);
        summaries.push({
          leagueId,
          leagueName: local.name,
          seasonId: local.seasonId,
          teamId,
          teamName: team?.name || `Team ${teamId}`,
          teamLogo: team?.logoUrl || null,
          ownerName: team?.ownerName || currentUser.username,
          starPlayers: team?.roster?.slice(0, 4) || [],
          totalTeams: local.teams.length,
        });
      } else {
        summaries.push({
          leagueId,
          leagueName: leagueId === '12345678' ? 'The Gridiron Champions League (Demo)' : `ESPN League #${leagueId}`,
          teamId,
          teamName: 'Claimed Team',
          ownerName: currentUser.username,
        });
      }
    }
    return summaries;
  }, [currentUser]);

  // =========================================================================
  // SCREEN 1: USER IS NOT LOGGED IN -> DEDICATED LOGIN / CREATE ACCOUNT SCREEN
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="w-full max-w-lg mx-auto py-6 sm:py-10 px-4 flex flex-col items-center text-center animate-in fade-in duration-300">
        {/* Top Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 font-bold text-xs uppercase tracking-wider mb-5 shadow-sm">
          <UnicornLogo className="w-4 h-4 fill-blue-400" />
          Grindr for the Gridiron
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white flex items-center justify-center gap-3 sm:gap-4 leading-[1.1] my-1">
          <span>Pasta</span>
          <UnicornLogo className="w-10 h-10 sm:w-14 sm:h-14 fill-blue-500 drop-shadow-[0_0_24px_rgba(59,130,246,0.5)] flex-shrink-0" />
          <span>Loft</span>
        </h1>

        <p className="mt-3 text-sm sm:text-base text-slate-400 max-w-md leading-relaxed">
          The fantasy trade matchmaker. Log in or create an account to view your leagues and claimed rosters.
        </p>

        {pendingLeagueId && (
          <div className="mt-4 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center justify-center gap-2">
            <Trophy className="w-4 h-4 text-blue-400" />
            <span>You&apos;ve been invited to join ESPN League #{pendingLeagueId}!</span>
          </div>
        )}

        {/* AUTHENTICATION CARD */}
        <div className="w-full mt-6 p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-md text-left">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 rounded-2xl bg-slate-950 border border-slate-800 mb-4">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                authMode === 'login'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                authMode === 'register'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create Account</span>
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={authMode === 'register' ? 'e.g. BlitzKing' : 'Your username'}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm font-semibold text-white placeholder-slate-600 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder={authMode === 'register' ? 'Choose a password (min 4 chars)' : 'Your password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm font-semibold text-white placeholder-slate-600 outline-none transition"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 transition hover:scale-[1.01] active:scale-95 touch-manipulation mt-2"
            >
              {isAuthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {authMode === 'register'
                      ? 'Create Account & Continue'
                      : 'Log In & Continue'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 2: USER IS LOGGED IN -> LEAGUE NAVIGATOR & CLAIMED TEAMS HUB
  // =========================================================================
  return (
    <div className="w-full max-w-4xl mx-auto py-6 sm:py-8 px-4 flex flex-col items-center animate-in fade-in duration-300">
      {/* User Status Bar */}
      <div className="w-full max-w-2xl p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-black text-sm">
            {currentUser.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>@{currentUser.username}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            </div>
            <div className="text-[11px] text-slate-400">
              Account active • Teams synced across devices
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
          title="Log out of this account"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log Out</span>
        </button>
      </div>

      {/* Super User Admin Banner */}
      {(currentUser.isSuperUser || currentUser.username.toLowerCase() === 'superu') && onOpenSuperUser && (
        <div className="w-full max-w-2xl mb-6 p-4 rounded-3xl bg-gradient-to-r from-purple-950/70 via-slate-900 to-indigo-950/50 border border-purple-500/40 shadow-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30 flex-shrink-0">
              <Crown className="w-5 h-5 text-amber-300" />
            </div>
            <div className="text-left">
              <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>Super User Privileges Active</span>
                <span className="w-2 h-2 rounded-full bg-purple-400 inline-block animate-pulse" />
              </div>
              <div className="text-[11px] text-slate-300">
                View/delete all leagues & users, and assign/unassign team claims
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSuperUser}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 flex items-center gap-1.5 transition active:scale-95 flex-shrink-0"
          >
            <span>Open Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {authSuccessMsg && (
        <div className="w-full max-w-2xl mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{authSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: THE LEAGUES YOU ARE PART OF AND TEAMS YOU HAVE CLAIMED */}
      {/* ========================================================================= */}
      <div className="w-full max-w-2xl mb-6 text-left">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>My Leagues & Claimed Teams</span>
          </h2>
          <span className="text-xs text-blue-400 font-bold">
            {claimedSummaries.length} Claimed
          </span>
        </div>

        {claimedSummaries.length > 0 ? (
          <div className="space-y-3">
            {claimedSummaries.map((summary) => (
              <div
                key={`${summary.leagueId}_${summary.teamId}`}
                className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 shadow-xl transition-all group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {summary.teamLogo ? (
                    <img
                      src={summary.teamLogo}
                      alt={summary.teamName}
                      className="w-12 h-12 rounded-2xl object-cover bg-slate-950 border border-slate-800 flex-shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-black text-base flex-shrink-0 mt-0.5">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-blue-400 font-semibold truncate">
                        {summary.leagueName}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-slate-400 border border-slate-800">
                        ESPN #{summary.leagueId}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white truncate mt-0.5 group-hover:text-blue-300 transition">
                      {summary.teamName}
                    </h3>

                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                      <span>Owner: <strong className="text-slate-200">{summary.ownerName}</strong></span>
                      {summary.matchesCount !== undefined && summary.matchesCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            {summary.matchesCount} Match{summary.matchesCount === 1 ? '' : 'es'}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Star Players Heads */}
                    {summary.starPlayers && summary.starPlayers.length > 0 && (
                      <div className="flex items-center gap-1 mt-2.5">
                        {summary.starPlayers.map((player) => (
                          <div
                            key={player.id}
                            className="w-6 h-6 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex-shrink-0"
                            title={`${player.fullName} (${player.position})`}
                          >
                            <img
                              src={player.headshotUrl}
                              alt={player.fullName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                        <span className="text-[11px] text-slate-500 ml-1">Roster Ready</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct 1-Click Launch Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (onSelectLeagueAndTeam) {
                      onSelectLeagueAndTeam(summary.leagueId, summary.teamId);
                    } else {
                      const existing = getLeagueById(summary.leagueId);
                      if (existing) {
                        onSelectLeague(existing);
                      }
                    }
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5 transition active:scale-95 flex-shrink-0"
                >
                  <span>Enter League</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">No Claimed Teams Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
              Find your ESPN league below or launch the demo league to claim your team roster and start trading.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: FIND OR JOIN AN ESPN LEAGUE */}
      {/* ========================================================================= */}
      <div className="w-full max-w-2xl p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md text-left mb-6">
        <form onSubmit={handleSearchOrRegister} className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Search className="w-3.5 h-3.5" />
              Find Your ESPN League
            </span>
            <span className="text-slate-500 font-semibold lowercase">public & private</span>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter ESPN League ID (e.g. 397620)"
                value={leagueIdInput}
                onChange={(e) => setLeagueIdInput(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm font-semibold text-white placeholder-slate-600 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center gap-1.5 transition hover:scale-102 active:scale-95 flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Connect</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Toggle for Private League Credentials */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowPrivateFields(!showPrivateFields)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 font-semibold transition"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-400" />
              <span>{showPrivateFields ? 'Hide Private League Cookies' : 'Is your league private? Add ESPN Cookies'}</span>
            </button>

            {showPrivateFields && (
              <div className="mt-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 animate-in fade-in duration-150">
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span>Enter session cookies from fantasy.espn.com</span>
                  <button
                    type="button"
                    onClick={() => setShowCookieHelp(!showCookieHelp)}
                    className="text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" />
                    Help
                  </button>
                </div>

                {showCookieHelp && (
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-slate-400 space-y-1">
                    <p>1. Open <strong className="text-white">fantasy.espn.com</strong> in Chrome or Edge.</p>
                    <p>2. Press <kbd className="bg-slate-800 px-1 rounded text-white">F12</kbd> &gt; <strong>Application</strong> &gt; <strong>Cookies</strong> &gt; <strong>espn.com</strong>.</p>
                    <p>3. Copy values for <code className="text-blue-400">espn_s2</code> and <code className="text-blue-400">SWID</code>.</p>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    espn_s2 Cookie
                  </label>
                  <input
                    type="password"
                    placeholder="Paste espn_s2 token (AEB...)"
                    value={espnS2}
                    onChange={(e) => handleEspnS2Change(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    SWID Cookie (with braces)
                  </label>
                  <input
                    type="text"
                    placeholder="{12345678-ABCD-1234-ABCD-1234567890AB}"
                    value={swid}
                    onChange={(e) => handleSwidChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-base sm:text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: DEMO SANDBOX */}
      {/* ========================================================================= */}
      <div className="w-full max-w-2xl p-4 rounded-3xl bg-slate-900/60 border border-slate-800 flex items-center justify-between mb-6">
        <div className="text-left">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Try the Demo Sandbox</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Explore features with our pre-loaded 3-team demo league (12345678)
          </div>
        </div>

        {onOpenDemo && (
          <button
            type="button"
            onClick={onOpenDemo}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition hover:scale-105 active:scale-95"
          >
            Launch Demo
          </button>
        )}
      </div>
    </div>
  );
};
