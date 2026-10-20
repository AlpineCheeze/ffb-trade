'use client';

import React, { useState, useEffect } from 'react';
import { fetchEspnLeague, createMockLeague, normalizeEspnCookies } from '@/lib/espn';
import { getStoredLeagueCreds, saveStoredLeagueCreds, saveLeague } from '@/lib/leagueStore';
import { League } from '@/types/fantasy';
import { CheckCircle2, Download, HelpCircle, KeyRound, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';

interface LeagueSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeagueLoaded: (league: League) => void;
  initialLeagueId?: string;
  currentLeague?: League | null;
}

export const LeagueSyncModal: React.FC<LeagueSyncModalProps> = ({
  isOpen,
  onClose,
  onLeagueLoaded,
  initialLeagueId,
  currentLeague,
}) => {
  const initialId = initialLeagueId || currentLeague?.espnLeagueId || '';
  const [leagueId, setLeagueId] = useState(initialId);
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [hasStoredCookies, setHasStoredCookies] = useState(false);
  const [showCookieInputs, setShowCookieInputs] = useState(false);
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically load stored cookies when modal opens or initial ID changes
  useEffect(() => {
    if (!isOpen) return;
    const targetId = (initialLeagueId || currentLeague?.espnLeagueId || '').trim();
    if (targetId) {
      setLeagueId(targetId);
      const stored = getStoredLeagueCreds(targetId);
      if (stored && (stored.espnS2 || stored.swid)) {
        if (stored.espnS2) setEspnS2(stored.espnS2);
        if (stored.swid) setSwid(stored.swid);
        setHasStoredCookies(true);
      } else {
        setHasStoredCookies(false);
      }
    }
  }, [isOpen, initialLeagueId, currentLeague]);

  if (!isOpen) return null;

  const handleLeagueIdChange = (val: string) => {
    setLeagueId(val);
    const clean = val.trim();
    if (clean) {
      const stored = getStoredLeagueCreds(clean);
      if (stored && (stored.espnS2 || stored.swid)) {
        if (stored.espnS2) setEspnS2(stored.espnS2);
        if (stored.swid) setSwid(stored.swid);
        setHasStoredCookies(true);
        return;
      }
    }
    setHasStoredCookies(false);
  };

  const handleEspnS2Change = (val: string) => {
    setEspnS2(val);
    if (val.includes('SWID=') || val.includes('espn_s2=') || val.includes(';')) {
      const norm = normalizeEspnCookies(val, swid);
      if (norm.espnS2) setEspnS2(norm.espnS2);
      if (norm.swid) setSwid(norm.swid);
    }
  };

  const handleSwidChange = (val: string) => {
    setSwid(val);
    if (val.includes('espn_s2=') || val.includes('SWID=') || val.includes(';')) {
      const norm = normalizeEspnCookies(espnS2, val);
      if (norm.espnS2) setEspnS2(norm.espnS2);
      if (norm.swid) setSwid(norm.swid);
    }
  };

  const handleSyncRealLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = leagueId.trim();
    if (!cleanId) {
      setError('Please enter a valid ESPN League ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const norm = normalizeEspnCookies(espnS2, swid);
      const league = await fetchEspnLeague({
        leagueId: cleanId,
        seasonId: currentLeague?.seasonId,
        espnS2: norm.espnS2,
        swid: norm.swid,
        forceRefresh: true,
      });

      // Persist credentials permanently once league is created/synced
      if (norm.espnS2 && norm.swid) {
        saveStoredLeagueCreds(league.espnLeagueId, {
          espnS2: norm.espnS2,
          swid: norm.swid,
        });
      }

      saveLeague(league);
      onLeagueLoaded(league);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to sync ESPN league.');
      if (err.isPrivate || err.message?.toLowerCase().includes('private') || err.message?.toLowerCase().includes('cookie')) {
        setShowCookieInputs(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMock = () => {
    const mock = createMockLeague();
    saveLeague(mock);
    onLeagueLoaded(mock);
    onClose();
  };

  const isResync = Boolean(currentLeague && currentLeague.espnLeagueId === leagueId.trim());

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex min-h-full items-center justify-center">
        <div className="relative w-full max-w-lg my-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 mb-2">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/20">
              {isResync ? <RefreshCw className="w-5 h-5" /> : <Download className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-xl font-black text-white">
                {isResync ? `Re-sync ${currentLeague?.name || 'League'}` : 'Sync ESPN League'}
              </h2>
              <p className="text-xs text-slate-400">
                {isResync
                  ? 'Update and refresh latest rosters from ESPN'
                  : 'Import your fantasy football rosters & teams'}
              </p>
            </div>
          </div>

          {/* 1-Click Demo Button (Only show if not re-syncing an active league) */}
          {!isResync && (
            <div className="my-5 p-3.5 rounded-2xl bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-500/30 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  Want to test immediately?
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Load a pre-configured 3-team Champions League with authentic NFL stars.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadMock}
                className="flex-shrink-0 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow transition hover:scale-105 active:scale-95"
              >
                Load Demo
              </button>
            </div>
          )}

          {error && (
            <div className="my-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSyncRealLeague} className="space-y-4 mt-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                ESPN League ID *
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 397620"
                value={leagueId}
                onChange={(e) => handleLeagueIdChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm text-white placeholder-slate-600 outline-none transition"
              />
            </div>

            {/* Stored Credentials Indicator Banner */}
            {hasStoredCookies && !showCookieInputs && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Stored cookies saved for this league. No need to re-enter!</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCookieInputs(true)}
                  className="text-[11px] text-emerald-300 hover:text-white underline font-semibold flex-shrink-0"
                >
                  Edit Cookies
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800">
              <div className="flex justify-between items-center mb-2">
                <button
                  type="button"
                  onClick={() => setShowCookieInputs(!showCookieInputs)}
                  className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    {hasStoredCookies
                      ? showCookieInputs
                        ? 'Hide Cookie Settings'
                        : 'Change Stored Cookies'
                      : showCookieInputs
                      ? 'Hide Private League Cookies'
                      : 'Is your league private? Add ESPN Cookies'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCookieHelp(!showCookieHelp)}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                >
                  <HelpCircle className="w-3 h-3" />
                  {showCookieHelp ? 'Hide Guide' : 'Cookie guide'}
                </button>
              </div>

              {showCookieHelp && (
                <div className="mb-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                  <p>1. Open <strong className="text-slate-200">fantasy.espn.com</strong> in your browser while logged in.</p>
                  <p>2. Open DevTools (<kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-200">F12</kbd> or right-click &gt; Inspect) &gt; <strong className="text-slate-200">Application</strong> tab.</p>
                  <p>3. Expand <strong className="text-slate-200">Cookies</strong> &gt; <strong className="text-slate-200">https://espn.com</strong>.</p>
                  <p>4. Copy the values for <code className="text-blue-400">espn_s2</code> and <code className="text-blue-400">SWID</code> below.</p>
                </div>
              )}

              {showCookieInputs && (
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      espn_s2 Cookie
                    </label>
                    <input
                      type="password"
                      placeholder="Paste espn_s2 token (AEB...)"
                      value={espnS2}
                      onChange={(e) => handleEspnS2Change(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm text-white placeholder-slate-600 outline-none transition"
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
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm text-white placeholder-slate-600 outline-none transition font-mono"
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 italic">
                    💡 Tip: You can paste your entire cookie string into either box above — Pasta Loft will automatically extract both cookies!
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition hover:scale-[1.01] active:scale-95"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connecting to ESPN...</span>
                  </>
                ) : (
                  <>
                    {isResync ? <RefreshCw className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    <span>{isResync ? 'Re-sync League Rosters' : 'Sync League'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
