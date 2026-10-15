'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Match } from '@/types/fantasy';
import { ArrowLeftRight, Check, Copy, Sparkles } from 'lucide-react';

interface MatchesViewProps {
  matches: Match[];
  currentTeamId?: string | null;
  onStartSwiping: () => void;
}

export const MatchesView: React.FC<MatchesViewProps> = ({
  matches,
  currentTeamId,
  onStartSwiping,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopyProposal = async (m: Match) => {
    const isUserTeamA = !currentTeamId || m.teamAId === currentTeamId;
    const userPlayers = isUserTeamA ? m.teamAPlayers : m.teamBPlayers;
    const partnerPlayers = isUserTeamA ? m.teamBPlayers : m.teamAPlayers;
    const partnerTeam = isUserTeamA ? m.teamB : m.teamA;

    const sendNames = userPlayers.map((p) => `${p.fullName} (${p.position})`).join(' & ');
    const receiveNames = partnerPlayers.map((p) => `${p.fullName} (${p.position})`).join(' & ');
    const tradeLabel =
      m.tradeType === '1-for-1' ? 'Heads Up' : m.tradeType === '2-for-1' ? 'Twofer' : m.tradeType;

    const text = `Hey ${partnerTeam.ownerName}! Trade Horny found a mutual ${tradeLabel} trade match: My ${sendNames} for your ${receiveNames}. Sending proposal in ESPN!`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedId(m.id);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopiedId(null), 3000);
      }
    } catch {
      // Fallback prompt if clipboard fails in non-HTTPS / iframe
      window.prompt('Copy trade message:', text);
    }
  };

  const handleImgError = (id: string) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  };

  if (matches.length === 0) {
    return (
      <div className="max-w-md mx-auto p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4">
          <ArrowLeftRight className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-black text-white">No Matches Yet</h3>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Matches happen when you swipe right on an opponent&apos;s player or package and they also swipe right on yours.
        </p>
        <button
          onClick={onStartSwiping}
          className="mt-6 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition"
        >
          Start Swiping Now
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between px-2 mb-2">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            Confirmed Trade Matches
          </h2>
          <p className="text-xs text-slate-400">
            {matches.length} mutual trade alignment{matches.length === 1 ? '' : 's'} ready to execute
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {matches.map((m) => {
          const isUserTeamA = !currentTeamId || m.teamAId === currentTeamId;
          const userPlayers = isUserTeamA ? m.teamAPlayers : m.teamBPlayers;
          const partnerPlayers = isUserTeamA ? m.teamBPlayers : m.teamAPlayers;
          const partnerTeam = isUserTeamA ? m.teamB : m.teamA;

          return (
            <div
              key={m.id}
              className="p-5 rounded-3xl bg-slate-900/95 border border-slate-800 hover:border-slate-700 shadow-xl transition-all"
            >
              {/* Header / Opponent Info */}
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Trade Partner: </span>
                  <span className="font-bold text-blue-400">{partnerTeam.ownerName}</span>
                  <span className="text-slate-500"> ({partnerTeam.name})</span>
                </div>
                <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase">
                  {m.tradeType === '1-for-1' ? 'Heads Up' : m.tradeType === '2-for-1' ? 'Twofer' : m.tradeType} Aligned
                </span>
              </div>

              {/* Side-by-Side Trade Comparison */}
              <div className="grid grid-cols-2 gap-3 items-center relative">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4 text-blue-400" />
                </div>

                {/* Your Package (You Send) */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500">
                    You Send ({userPlayers.length})
                  </div>
                  <div className="space-y-2">
                    {userPlayers.map((p, idx) => (
                      <div key={p.id} className="flex items-center gap-2.5">
                        {idx > 0 && <span className="text-[10px] text-blue-400 font-bold -my-1">+</span>}
                        {!imgErrors[p.id] ? (
                          <img
                            src={p.headshotUrl}
                            alt={p.fullName}
                            onError={() => handleImgError(p.id)}
                            className="w-10 h-10 rounded-xl object-cover bg-slate-800 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                            {p.position}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{p.fullName}</div>
                          <div className="text-[11px] text-blue-400 font-semibold flex items-center gap-1">
                            <span>{p.position}</span>
                            <span>•</span>
                            <span className="text-slate-400">{p.nflTeam}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opponent Package (You Receive) */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2">
                  <div className="text-[10px] uppercase font-bold text-emerald-500">
                    You Receive ({partnerPlayers.length})
                  </div>
                  <div className="space-y-2">
                    {partnerPlayers.map((p, idx) => (
                      <div key={p.id} className="flex items-center gap-2.5">
                        {idx > 0 && <span className="text-[10px] text-emerald-400 font-bold -my-1">+</span>}
                        {!imgErrors[p.id] ? (
                          <img
                            src={p.headshotUrl}
                            alt={p.fullName}
                            onError={() => handleImgError(p.id)}
                            className="w-10 h-10 rounded-xl object-cover bg-slate-800 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                            {p.position}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{p.fullName}</div>
                          <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                            <span>{p.position}</span>
                            <span>•</span>
                            <span className="text-slate-400">{p.nflTeam}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Proposal Action */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Aligned {new Date(m.createdAt).toLocaleDateString()}
                </span>

                <button
                  onClick={() => handleCopyProposal(m)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
                >
                  {copiedId === m.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Trade Message</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
