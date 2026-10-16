'use client';

import React, { useState, useEffect } from 'react';
import { fetchEspnLeague, normalizeEspnCookies } from '@/lib/espn';
import { getLeagueById, saveLeague, getSavedLeagues } from '@/lib/leagueStore';
import { registerAccount, loginAccount, logoutAccount } from '@/lib/authStore';
import { League, UserAccount } from '@/types/fantasy';
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
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { UnicornLogo } from './UnicornLogo';

interface HomeHeroProps {
  currentUser: UserAccount | null;
  onUserChange: (user: UserAccount | null) => void;
  onSelectLeague: (league: League) => void;
  onOpenDemo: () => void;
}

export const HomeHero: React.FC<HomeHeroProps> = ({
  currentUser,
  onUserChange,
  onSelectLeague,
  onOpenDemo,
}) => {
  // Account Form State
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
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
        setAuthSuccessMsg(`Logged in as @${user.username}.`);
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
      // 1. Normalize cookies (strips extra quotes, headers, and ensures SWID braces)
      const norm = normalizeEspnCookies(espnS2, swid);
      const hasCookies = Boolean(norm.espnS2 && norm.swid);

      // 2. Only short-circuit to existing cached league if NO fresh credentials/cookies were provided
      if (!hasCookies) {
        const existing = getLeagueById(cleanId);
        if (existing) {
          setIsLoading(false);
          onSelectLeague(existing);
          return;
        }
      }

      // 3. Fetch from ESPN and register it
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

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 flex flex-col items-center text-center animate-in fade-in duration-300">
      {/* Top Badge */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 font-bold text-xs uppercase tracking-wider mb-6 shadow-sm">
        <UnicornLogo className="w-4 h-4 fill-blue-400" />
        Grindr for the Gridiron
      </div>

      {/* Main Headline */}
      <h1 className="text-4xl min-[360px]:text-5xl sm:text-7xl font-black tracking-tight text-white flex items-center justify-center gap-2.5 sm:gap-5 leading-[1.1] my-2">
        <span>Trade</span>
        <UnicornLogo className="w-10 h-10 min-[360px]:w-12 min-[360px]:h-12 sm:w-16 sm:h-16 fill-blue-500 drop-shadow-[0_0_24px_rgba(59,130,246,0.5)] flex-shrink-0" />
        <span>Horny</span>
      </h1>

      <p className="mt-4 text-base sm:text-lg text-slate-400 max-w-xl leading-relaxed">
        Sync your ESPN league, shop your surplus players, and swipe <strong className="text-emerald-400">Yes</strong> or <strong className="text-rose-400">No</strong> on opponents. When both sides align, <span className="text-blue-400 font-bold">Trade Horny</span> makes the match.
      </p>

      {/* ========================================================================= */}
      {/* STEP 1: CREATE ACCOUNT / LOGIN (BEFORE FINDING YOUR LEAGUE) */}
      {/* ========================================================================= */}
      <div className="w-full max-w-lg mt-8 p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-md text-left">
        {currentUser ? (
          /* LOGGED IN VIEW */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <UserCheck className="w-4 h-4" />
                Account Active
              </span>
              <span className="text-emerald-400 font-semibold lowercase">cross-device linked</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-sm">
                  {currentUser.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>@{currentUser.username}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Logged in • Claimed teams are linked across all your devices
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
                title="Log out of this account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>

            {authSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{authSuccessMsg}</span>
              </div>
            )}
          </div>
        ) : (
          /* CREATE ACCOUNT / LOGIN FORM */
          <form onSubmit={handleAuthSubmit} className="space-y-3.5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5 text-blue-400">
                <Smartphone className="w-3.5 h-3.5" />
                Step 1: Your Trade Horny Account
              </span>
              <span className="text-blue-400 font-semibold lowercase">cross-device sync</span>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex p-1 rounded-2xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                }}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  authMode === 'register'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Account</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  authMode === 'login'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Log In</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              {authMode === 'register'
                ? 'Create a quick account before finding your league so your claimed team is linked across your phone, tablet, and PC.'
                : 'Log in with your username and password to restore your claimed teams on this device.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={authMode === 'register' ? 'Username (e.g. BlitzKing)' : 'Username'}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm font-semibold text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder={authMode === 'register' ? 'Password (min 4 chars)' : 'Password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm font-semibold text-white placeholder-slate-600 outline-none transition"
                />
              </div>
            </div>

            {authError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-600/25 flex items-center justify-center gap-1.5 transition hover:scale-[1.01] active:scale-95"
            >
              {isAuthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {authMode === 'register'
                      ? 'Create Account & Continue to League'
                      : 'Log In & Continue to League'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STEP 2: FIND OR REGISTER ESPN LEAGUE */}
      {/* ========================================================================= */}
      <div className="w-full max-w-lg mt-5 p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-md">
        <form onSubmit={handleSearchOrRegister} className="space-y-3">
          <div className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Step 2: Find or Register Your ESPN League</span>
            <span className="text-blue-400 font-semibold lowercase">step 2 of 2</span>
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
                  <span>Search</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium text-left">
              {error}
            </div>
          )}

          {/* Toggle for Private League Credentials */}
          <div className="pt-2 text-left">
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

                <div className="text-[10px] text-slate-500 italic">
                  💡 Tip: You can also paste your full cookie string into either box above — Trade Horny will automatically extract both espn_s2 and SWID for you!
                </div>
              </div>
            )}
          </div>
        </form>

        {/* 1-Click Instant Demo Button */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
          <div className="text-left">
            <div className="text-xs font-bold text-white flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Just browsing?
            </div>
            <div className="text-[11px] text-slate-400">Test the app with our pre-loaded demo league</div>
          </div>

          <button
            onClick={onOpenDemo}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition hover:scale-105 active:scale-95"
          >
            Launch Demo League
          </button>
        </div>
      </div>

      {/* Saved Leagues Section (if user previously synced any real league on this device) */}
      {savedLeagues.length > 0 && (
        <div className="w-full max-w-lg mt-6 p-4 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl text-left">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Your Synced Leagues
            </span>
            <span className="text-blue-400 font-semibold">{savedLeagues.length} saved</span>
          </div>
          <div className="space-y-2">
            {savedLeagues.map((sl) => (
              <button
                key={sl.espnLeagueId}
                type="button"
                onClick={() => onSelectLeague(sl)}
                className="w-full p-3 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800/90 hover:border-blue-500/50 transition flex items-center justify-between group text-left"
              >
                <div>
                  <div className="text-sm font-bold text-white group-hover:text-blue-400 transition">{sl.name}</div>
                  <div className="text-xs text-slate-500">ESPN ID: {sl.espnLeagueId} • Season {sl.seasonId} • {sl.teams.length} Teams</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 max-w-3xl w-full text-left">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-black text-sm mb-2">
            1
          </div>
          <h3 className="font-bold text-white text-sm">Cross-Device Account</h3>
          <p className="text-xs text-slate-400 mt-1">
            Create an account with simple username and password. Your claimed team follows you on any device.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-black text-sm mb-2">
            2
          </div>
          <h3 className="font-bold text-white text-sm">Claim Your Team</h3>
          <p className="text-xs text-slate-400 mt-1">
            Pick your roster from the locker room, put players on the trade block, and start swiping.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-black text-sm mb-2">
            3
          </div>
          <h3 className="font-bold text-white text-sm">Mutual Trade Matches</h3>
          <p className="text-xs text-slate-400 mt-1">
            When two managers mutually swipe right on each other&apos;s shopped players, both get notified.
          </p>
        </div>
      </div>
    </div>
  );
};
