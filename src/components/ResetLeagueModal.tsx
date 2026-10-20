'use client';

import React, { useState, useEffect } from 'react';
import { ResetScope } from '@/types/fantasy';
import {
  RotateCcw,
  AlertTriangle,
  X,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  RefreshCw,
  UserX,
  Globe,
  Lock,
} from 'lucide-react';

interface ResetLeagueModalProps {
  isOpen: boolean;
  leagueName: string;
  teamName?: string | null;
  hasTeam?: boolean;
  isSuperUser?: boolean;
  onClose: () => void;
  onConfirm: (scope: ResetScope) => Promise<void> | void;
  isResetting?: boolean;
}

export const ResetLeagueModal: React.FC<ResetLeagueModalProps> = ({
  isOpen,
  leagueName,
  teamName,
  hasTeam = true,
  isSuperUser = false,
  onClose,
  onConfirm,
  isResetting = false,
}) => {
  const [selectedScope, setSelectedScope] = useState<ResetScope>(() => {
    if (hasTeam) return 'recycle_passes';
    if (isSuperUser) return 'reset_league';
    return 'recycle_passes';
  });

  useEffect(() => {
    if (isOpen) {
      if (hasTeam) {
        setSelectedScope('recycle_passes');
      } else if (isSuperUser) {
        setSelectedScope('reset_league');
      } else {
        setSelectedScope('recycle_passes');
      }
    }
  }, [isOpen, hasTeam, isSuperUser]);

  if (!isOpen) return null;

  const confirmLabel =
    selectedScope === 'recycle_passes'
      ? 'Recycle My Passed Cards'
      : selectedScope === 'reset_team'
      ? "Reset My Team's Swipes"
      : 'Reset Full League Swipes';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isResetting) {
          onClose();
        }
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <div className="relative w-full max-w-lg my-auto rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Close Button */}
          <button
            onClick={onClose}
            disabled={isResetting}
            aria-label="Close reset modal"
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Deck & Swipe Reset Controls</h2>
              <p className="text-xs text-slate-400">
                Choose how you want to refresh cards in {leagueName}
              </p>
            </div>
          </div>

          {/* 3 Scoped Options */}
          <div className="space-y-3 mb-5">
            {/* Option 1: Recycle My Passed Cards (Recommended) */}
            {hasTeam && (
              <button
                type="button"
                onClick={() => setSelectedScope('recycle_passes')}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                  selectedScope === 'recycle_passes'
                    ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/60 shadow-lg shadow-emerald-950/40'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    selectedScope === 'recycle_passes'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-emerald-400'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-black text-white">
                      Recycle My Passed Cards
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Restores only the cards you previously passed on so you can re-evaluate them, while keeping all your <strong className="text-slate-200">Want</strong> swipes and confirmed matches intact.
                  </p>
                </div>
              </button>
            )}

            {/* Option 2: Reset My Team's Swipes */}
            {hasTeam && (
              <button
                type="button"
                onClick={() => setSelectedScope('reset_team')}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                  selectedScope === 'reset_team'
                    ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500/60 shadow-lg shadow-amber-950/40'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    selectedScope === 'reset_team'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-amber-400'
                  }`}
                >
                  <UserX className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-black text-white">
                      Reset My Team&apos;s Swipes {teamName ? `(${teamName})` : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      My Team Only
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Clears only your team&apos;s swipes and matches for a clean personal slate, without wiping other managers&apos; matches across the league.
                  </p>
                </div>
              </button>
            )}

            {/* Option 3: Full League Reset (All Managers) - Restricted to Super User */}
            {isSuperUser ? (
              <button
                type="button"
                onClick={() => setSelectedScope('reset_league')}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                  selectedScope === 'reset_league'
                    ? 'bg-rose-950/40 border-rose-500 ring-1 ring-rose-500/60 shadow-lg shadow-rose-950/40'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    selectedScope === 'reset_league'
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-800 text-rose-400'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-black text-white">
                      Full League Reset (All Managers)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Entire League
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Wipes all swipes and mutual matches across all managers in {leagueName} to start the entire league fresh.
                  </p>
                </div>
              </button>
            ) : (
              <div className="w-full text-left p-4 rounded-2xl border border-slate-800/80 bg-slate-950/40 opacity-75 flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-slate-900 text-purple-400 border border-slate-800">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-300">
                      Full League Reset (All Managers)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Super User Only
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    League-wide swipe resets affect all managers and are strictly restricted to the Super User (<code className="text-purple-400 font-mono">superu</code>). You can reset your own team&apos;s swipes above.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Preservation reassurance */}
          <div className="mb-5 p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong className="font-bold text-white">Teams & rosters preserved: </strong>
              ESPN team claims, rosters, and user accounts remain untouched.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isResetting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 hover:text-white transition disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => onConfirm(selectedScope)}
              disabled={isResetting || (selectedScope === 'reset_league' && !isSuperUser) || (!hasTeam && !isSuperUser)}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition hover:scale-[1.02] active:scale-95 disabled:opacity-50 ${
                selectedScope === 'recycle_passes'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                  : selectedScope === 'reset_team'
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950/40'
                  : 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/40'
              }`}
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>{confirmLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
