'use client';

import React from 'react';
import { RotateCcw, AlertTriangle, X, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';

interface ResetLeagueModalProps {
  isOpen: boolean;
  leagueName: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isResetting?: boolean;
}

export const ResetLeagueModal: React.FC<ResetLeagueModalProps> = ({
  isOpen,
  leagueName,
  onClose,
  onConfirm,
  isResetting = false,
}) => {
  if (!isOpen) return null;

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
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Reset League Swipes</h2>
            <p className="text-xs text-slate-400">Start fresh across {leagueName}</p>
          </div>
        </div>

        {/* Why this is important context */}
        <div className="mb-5 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
          The fantasy football landscape changes week to week with injuries, depth chart changes, and breakout stars. Resetting gives every manager a completely fresh swipe deck to discover new trade possibilities.
        </div>

        {/* What changes vs what stays */}
        <div className="space-y-2.5 mb-6">
          <div className="flex items-start gap-2.5 text-xs text-slate-300">
            <RotateCcw className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">All swipes are cleared: </span>
              All previous passes and trade interests across the league will be wiped so all player cards reappear in your deck.
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-slate-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Active matches reset: </span>
              Mutual trade matches and deleted match archives will be reset for a fresh start.
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Teams and rosters preserved: </span>
              Your ESPN team claims, rosters, and user accounts remain completely untouched.
            </div>
          </div>
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
            onClick={onConfirm}
            disabled={isResetting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 transition hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Resetting Swipes...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>Reset All Swipes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
);
};
