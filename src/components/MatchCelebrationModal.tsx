'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Match } from '@/types/fantasy';
import { ArrowLeftRight, Check, Sparkles, X } from 'lucide-react';

interface MatchCelebrationModalProps {
  match: Match | null;
  currentTeamId?: string | null;
  onClose: () => void;
  onViewMatches: () => void;
}

export const MatchCelebrationModal: React.FC<MatchCelebrationModalProps> = ({
  match,
  currentTeamId,
  onClose,
  onViewMatches,
}) => {
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (match) {
      const count = 200;
      const defaults = {
        origin: { y: 0.7 },
        zIndex: 9999,
      };

      function fire(particleRatio: number, opts: confetti.Options) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        });
      }

      fire(0.25, { spread: 26, startVelocity: 55 });
      fire(0.2, { spread: 60 });
      fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
      fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
      fire(0.1, { spread: 120, startVelocity: 45 });
    }
  }, [match]);

  if (!match) return null;

  const isUserTeamA = !currentTeamId || match.teamAId === currentTeamId;
  const userPlayers = isUserTeamA ? match.teamAPlayers : match.teamBPlayers;
  const partnerPlayers = isUserTeamA ? match.teamBPlayers : match.teamAPlayers;
  const partnerTeam = isUserTeamA ? match.teamB : match.teamA;

  const tradeLabel =
    match.tradeType === '1-for-1'
      ? 'Heads Up'
      : match.tradeType === '2-for-1'
      ? 'Twofer'
      : match.tradeType;

  const handleImgError = (id: string) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 border border-blue-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(59,130,246,0.3)] text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebration Header */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-2">
          <Sparkles className="w-4 h-4" /> Mutual {tradeLabel} Alignment
        </div>

        <h2 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400 tracking-tight">
          IT&apos;S A TRADE MATCH!
        </h2>

        <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-sm mx-auto">
          You and <span className="text-blue-400 font-semibold">{partnerTeam.ownerName}</span> ({partnerTeam.name}) mutually aligned on this {tradeLabel} trade!
        </p>

        {/* Matched Players Comparison */}
        <div className="mt-6 grid grid-cols-2 gap-3 items-center relative">
          {/* Trade Swap Icon Center */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-blue-600 border-2 border-slate-900 text-white flex items-center justify-center shadow-lg shadow-blue-500/50">
            <ArrowLeftRight className="w-4 h-4" />
          </div>

          {/* Your Package */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 flex flex-col items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              You Send ({userPlayers.length})
            </span>
            <div className="w-full space-y-2">
              {userPlayers.map((p, idx) => (
                <div key={p.id} className="flex flex-col items-center text-center">
                  {idx > 0 && <span className="text-blue-400 font-bold text-xs my-0.5">+</span>}
                  <div className="w-14 h-14 rounded-full bg-slate-900 border-2 border-blue-500/50 overflow-hidden mb-1 flex items-center justify-center">
                    {!imgErrors[p.id] ? (
                      <img
                        src={p.headshotUrl}
                        alt={p.fullName}
                        onError={() => handleImgError(p.id)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-slate-500">{p.position}</span>
                    )}
                  </div>
                  <h4 className="font-bold text-white text-xs truncate w-full">{p.fullName}</h4>
                  <div className="text-[11px] text-blue-400 font-semibold">{p.position} • {p.nflTeam}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Opponent Package */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 flex flex-col items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              You Receive ({partnerPlayers.length})
            </span>
            <div className="w-full space-y-2">
              {partnerPlayers.map((p, idx) => (
                <div key={p.id} className="flex flex-col items-center text-center">
                  {idx > 0 && <span className="text-emerald-400 font-bold text-xs my-0.5">+</span>}
                  <div className="w-14 h-14 rounded-full bg-slate-900 border-2 border-emerald-500/50 overflow-hidden mb-1 flex items-center justify-center">
                    {!imgErrors[p.id] ? (
                      <img
                        src={p.headshotUrl}
                        alt={p.fullName}
                        onError={() => handleImgError(p.id)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-slate-500">{p.position}</span>
                    )}
                  </div>
                  <h4 className="font-bold text-white text-xs truncate w-full">{p.fullName}</h4>
                  <div className="text-[11px] text-emerald-400 font-semibold">{p.position} • {p.nflTeam}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-7 flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={onViewMatches}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            View in Matches Tab
          </button>

          <button
            onClick={onClose}
            className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition"
          >
            Keep Swiping
          </button>
        </div>
      </div>
    </div>
  );
};
