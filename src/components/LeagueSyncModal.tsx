'use client';

import React, { useState } from 'react';
import { fetchEspnLeague, createMockLeague, normalizeEspnCookies } from '@/lib/espn';
import { League } from '@/types/fantasy';
import { Download, HelpCircle, KeyRound, Loader2, Sparkles, X } from 'lucide-react';

interface LeagueSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeagueLoaded: (league: League) => void;
}

export const LeagueSyncModal: React.FC<LeagueSyncModalProps> = ({
  isOpen,
  onClose,
  onLeagueLoaded,
}) => {
  const [leagueId, setLeagueId] = useState('');
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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
    if (!leagueId.trim()) {
      setError('Please enter a valid ESPN League ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const norm = normalizeEspnCookies(espnS2, swid);
      const league = await fetchEspnLeague({
        leagueId: leagueId.trim(),
        espnS2: norm.espnS2,
        swid: norm.swid,
      });

      if (norm.espnS2 && norm.swid && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`espn_creds_${league.espnLeagueId}`, JSON.stringify({ espnS2: norm.espnS2, swid: norm.swid }));
        } catch {}
      }

      onLeagueLoaded(league);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to sync ESPN league.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMock = () => {
    const mock = createMockLeague();
    onLeagueLoaded(mock);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/20">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Sync ESPN League</h2>
            <p className="text-xs text-slate-400">Import your fantasy football rosters & teams</p>
          </div>
        </div>

        {/* 1-Click Demo Button */}
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

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSyncRealLeague} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              ESPN League ID *
            </label>
            <input
              type="text"
              placeholder="e.g. 397620"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm text-white placeholder-slate-600 outline-none transition"
            />
          </div>

          <div className="pt-2 border-t border-slate-800">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                Private League Cookies (Optional)
              </span>
              <button
                type="button"
                onClick={() => setShowCookieHelp(!showCookieHelp)}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
              >
                <HelpCircle className="w-3 h-3" />
                {showCookieHelp ? 'Hide Guide' : 'How to get cookies?'}
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

            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  espn_s2 Cookie
                </label>
                <input
                  type="password"
                  placeholder="Paste espn_s2 token (AEB...)"
                  value={espnS2}
                  onChange={(e) => handleEspnS2Change(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-600 outline-none transition"
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
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-600 outline-none transition font-mono"
                />
              </div>
              <div className="text-[10px] text-slate-500 italic">
                💡 Tip: You can paste your entire cookie string into either box above — Trade Horny will automatically extract both cookies!
              </div>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to ESPN...</span>
                </>
              ) : (
                <span>Sync League</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
