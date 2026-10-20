'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Match, TradeType, WarmTradeLead } from '@/types/fantasy';
import { ArrowLeftRight, Check, Copy, Sparkles, Trash2, History, RotateCcw, Flame, Heart } from 'lucide-react';

interface MatchesViewProps {
  matches: Match[];
  deletedMatches?: Match[];
  warmLeads?: WarmTradeLead[];
  currentTeamId?: string | null;
  incomingLikesCount?: number;
  onStartSwiping: () => void;
  onViewLikes?: () => void;
  onExploreWarmLead?: (lead: WarmTradeLead) => void;
  onDeleteMatch?: (match: Match) => void;
  onDeleteAllMatches?: () => void;
  onResetSwipes?: () => void;
}

export const MatchesView: React.FC<MatchesViewProps> = ({
  matches,
  deletedMatches = [],
  warmLeads = [],
  currentTeamId,
  incomingLikesCount = 0,
  onStartSwiping,
  onViewLikes,
  onExploreWarmLead,
  onDeleteMatch,
  onDeleteAllMatches,
  onResetSwipes,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const visibleMatches = currentTeamId
    ? matches.filter((m) => m.teamAId === currentTeamId || m.teamBId === currentTeamId)
    : matches;

  const visibleDeletedMatches = currentTeamId
    ? deletedMatches.filter((m) => m.teamAId === currentTeamId || m.teamBId === currentTeamId)
    : deletedMatches;

  const getEffectiveTradeType = (m: Match, userCount: number, partnerCount: number): TradeType => {
    if (userCount > 0 && partnerCount > 0) {
      return `${userCount}-for-${partnerCount}` as TradeType;
    }
    return m.tradeType;
  };

  const handleCopyProposal = async (m: Match) => {
    const isUserTeamA = !currentTeamId || m.teamAId === currentTeamId;
    const userPlayers = isUserTeamA ? m.teamAPlayers : m.teamBPlayers;
    const partnerPlayers = isUserTeamA ? m.teamBPlayers : m.teamAPlayers;
    const partnerTeam = isUserTeamA ? m.teamB : m.teamA;
    const effectiveType = getEffectiveTradeType(m, userPlayers.length, partnerPlayers.length);

    const sendNames = userPlayers.map((p) => `${p.fullName} (${p.position})`).join(' & ');
    const receiveNames = partnerPlayers.map((p) => `${p.fullName} (${p.position})`).join(' & ');
    const tradeLabel = `${effectiveType}`;

    const partnerName = partnerTeam.claimedBy || partnerTeam.ownerName || 'Partner';
    const text = `Hey ${partnerName}! Pasta Loft found a mutual ${tradeLabel} trade match: My ${sendNames} for your ${receiveNames}. Sending proposal in ESPN!`;

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* WARM TRADE LEADS / MUTUAL PLAYER INTEREST SECTION */}
      {warmLeads.length > 0 && (
        <div className="space-y-3 p-4 rounded-3xl bg-amber-500/5 border border-amber-500/25 shadow-xl">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-base font-black text-amber-300 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400 fill-amber-400/30" />
                <span>Warm Trade Leads ({warmLeads.length})</span>
              </h3>
              <p className="text-[11px] text-amber-200/70">
                Mutual player interest detected across different package sizes — 1 click to align!
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {warmLeads.map((lead) => {
              const partnerName =
                lead.partnerOwnerName || lead.partnerTeamName || 'Opponent';
              const myNames = (lead.myOfferedPlayers || [])
                .map((p) => `${p.fullName} (${p.position})`)
                .join(' + ');
              const partnerNames = (lead.partnerOfferedPlayers || [])
                .map((p) => `${p.fullName} (${p.position})`)
                .join(' + ');

              return (
                <div
                  key={lead.id}
                  className="p-3.5 rounded-2xl bg-slate-900/95 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">
                        {partnerName}{' '}
                        <span className="text-slate-400 font-normal">({lead.partnerTeamName})</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Try {lead.suggestedTradeType}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Both of you showed interest in{' '}
                      <strong className="text-blue-300">{myNames}</strong> ↔{' '}
                      <strong className="text-emerald-300">{partnerNames}</strong> (you swiped{' '}
                      <span className="text-slate-400 font-semibold">{lead.myOriginalTradeType}</span>, they swiped{' '}
                      <span className="text-slate-400 font-semibold">{lead.partnerOriginalTradeType}</span>).
                    </p>
                  </div>

                  {onExploreWarmLead && (
                    <button
                      type="button"
                      onClick={() => onExploreWarmLead(lead)}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex-shrink-0 flex items-center justify-center gap-1.5"
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>Shop {lead.suggestedTradeType} Deck</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVE CONFIRMED MATCHES SECTION */}
      {visibleMatches.length === 0 ? (
        <div className="max-w-md mx-auto p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4">
            <ArrowLeftRight className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-white">No Active Matches</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Matches happen when you swipe right on an opponent&apos;s player or package and they also swipe right on yours.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onStartSwiping}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition"
            >
              Start Swiping Now
            </button>
            {onResetSwipes && (
              <button
                onClick={onResetSwipes}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 hover:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                title="Reset all swipes and matches for the league to start fresh"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Swipes</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2 mb-2">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                Confirmed Trade Matches
              </h2>
              <p className="text-xs text-slate-400">
                {visibleMatches.length} mutual trade alignment{visibleMatches.length === 1 ? '' : 's'} ready to execute
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {onResetSwipes && (
                <button
                  onClick={onResetSwipes}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition"
                  title="Reset all swipes and matches across the league to start fresh"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Swipes</span>
                </button>
              )}
              {onDeleteAllMatches && (
                <button
                  onClick={onDeleteAllMatches}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition"
                  title="Delete all active trade matches for your team and your matched trade partners"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete All Matches</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {visibleMatches.map((m) => {
              const isUserTeamA = !currentTeamId || m.teamAId === currentTeamId;
              const userPlayers = isUserTeamA ? m.teamAPlayers : m.teamBPlayers;
              const partnerPlayers = isUserTeamA ? m.teamBPlayers : m.teamAPlayers;
              const partnerTeam = isUserTeamA ? m.teamB : m.teamA;
              const effectiveType = getEffectiveTradeType(m, userPlayers.length, partnerPlayers.length);

              return (
                <div
                  key={m.id}
                  className="p-5 rounded-3xl bg-slate-900/95 border border-slate-800 hover:border-slate-700 shadow-xl transition-all"
                >
                  {/* Header / Opponent Info */}
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium">Trade Partner: </span>
                      <span className="font-bold text-blue-400">{partnerTeam.claimedBy || partnerTeam.ownerName || 'Opponent'}</span>
                      <span className="text-slate-500"> ({partnerTeam.name})</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase">
                      {effectiveType} Aligned
                    </span>
                  </div>

                  {/* Side-by-Side Trade Comparison */}
                  <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3 sm:gap-8 items-stretch sm:items-center relative">
                    {/* Your Package (You Send) */}
                    <div className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2">
                      <div className="text-[10px] uppercase font-bold text-slate-500">
                        You Send ({userPlayers.length})
                      </div>
                      <div className="space-y-2">
                        {userPlayers.map((p, idx) => (
                          <React.Fragment key={p.id}>
                            {idx > 0 && (
                              <div className="flex items-center justify-center -my-1">
                                <span className="text-[10px] text-blue-400 font-bold bg-slate-900 border border-blue-500/30 w-4 h-4 rounded-full flex items-center justify-center">
                                  +
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2.5">
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
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    <div className="self-center z-10 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center -my-1 sm:my-0 sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
                      <ArrowLeftRight className="w-4 h-4 text-blue-400" />
                    </div>

                    {/* Opponent Package (You Receive) */}
                    <div className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2">
                      <div className="text-[10px] uppercase font-bold text-emerald-500">
                        You Receive ({partnerPlayers.length})
                      </div>
                      <div className="space-y-2">
                        {partnerPlayers.map((p, idx) => (
                          <React.Fragment key={p.id}>
                            {idx > 0 && (
                              <div className="flex items-center justify-center -my-1">
                                <span className="text-[10px] text-emerald-400 font-bold bg-slate-900 border border-emerald-500/30 w-4 h-4 rounded-full flex items-center justify-center">
                                  +
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2.5">
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
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Proposal & Delete Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      Aligned {new Date(m.createdAt).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-2">
                      {onDeleteMatch && (
                        <button
                          onClick={() => onDeleteMatch(m)}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition"
                          title="Delete this match for both you and your trade partner"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Match</span>
                        </button>
                      )}

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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DELETED MATCHES ARCHIVE SECTION */}
      {visibleDeletedMatches.length > 0 && (
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between px-2">
            <div>
              <h3 className="text-base font-bold text-slate-300 flex items-center gap-2">
                <History className="w-4 h-4 text-rose-400" />
                Deleted Matches ({visibleDeletedMatches.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Matches withdrawn by you or your trade partner after roster or injury changes
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {visibleDeletedMatches.map((m) => {
              const isUserTeamA = !currentTeamId || m.teamAId === currentTeamId;
              const userPlayers = isUserTeamA ? m.teamAPlayers : m.teamBPlayers;
              const partnerPlayers = isUserTeamA ? m.teamBPlayers : m.teamAPlayers;
              const partnerTeam = isUserTeamA ? m.teamB : m.teamA;
              const effectiveType = getEffectiveTradeType(
                m,
                userPlayers.length,
                partnerPlayers.length
              );
              const deletedByCurrentUser = Boolean(
                currentTeamId && m.deletedByTeamId === currentTeamId
              );
              const deletedByLabel = deletedByCurrentUser
                ? 'Deleted by you'
                : `Deleted by ${m.deletedByName || partnerTeam.claimedBy || partnerTeam.ownerName}`;

              return (
                <div
                  key={`del_${m.id}_${m.deletedAt || ''}`}
                  className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/70 opacity-75 transition-all"
                >
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-3 pb-2 border-b border-slate-800/60 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium">Former Partner: </span>
                      <span className="font-bold text-slate-300">{partnerTeam.claimedBy || partnerTeam.ownerName || 'Opponent'}</span>
                      <span className="text-slate-500"> ({partnerTeam.name})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 bg-slate-800/80 border border-slate-700/80 px-2 py-0.5 rounded-full uppercase font-semibold">
                        {effectiveType}
                      </span>
                      <span className="text-[10px] text-rose-400 font-semibold bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
                        {deletedByLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-2.5">
                      <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                        You Offered ({userPlayers.length})
                      </div>
                      <div className="text-slate-300 font-semibold truncate">
                        {userPlayers.map((p) => `${p.fullName} (${p.position})`).join(' + ')}
                      </div>
                    </div>

                    <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-2.5">
                      <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                        Partner Offered ({partnerPlayers.length})
                      </div>
                      <div className="text-slate-300 font-semibold truncate">
                        {partnerPlayers.map((p) => `${p.fullName} (${p.position})`).join(' + ')}
                      </div>
                    </div>
                  </div>

                  {m.deletedAt && (
                    <div className="mt-2 text-[10px] text-slate-500 text-right">
                      Removed {new Date(m.deletedAt).toLocaleDateString()}{' '}
                      {new Date(m.deletedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW YOUR LIKES CARD & BUTTON */}
      {onViewLikes && (
        <div className="pt-2">
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-pink-950/30 via-rose-950/20 to-purple-950/30 border border-pink-500/25 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left space-y-1">
              <div className="text-sm sm:text-base font-extrabold text-white flex items-center justify-center sm:justify-start gap-2">
                <Heart className="w-5 h-5 text-pink-400 fill-pink-400/30" />
                <span>See Who Liked Your Players</span>
                {incomingLikesCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-pink-500/20 border border-pink-500/40 text-pink-300">
                    {incomingLikesCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 max-w-md">
                Directly view trades other owners have swiped &ldquo;yes&rdquo; on involving your players, and swipe yes or pass on any of them!
              </p>
            </div>

            <button
              type="button"
              onClick={onViewLikes}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 hover:via-rose-500 hover:to-purple-500 text-white font-black text-sm shadow-lg shadow-pink-950/60 hover:shadow-pink-500/30 transition-all duration-200 flex items-center justify-center gap-2.5 active:scale-95 border border-pink-400/40 flex-shrink-0 group"
            >
              <Heart className="w-4 h-4 text-pink-200 fill-pink-200/50 group-hover:scale-125 transition-transform" />
              <span>View Your Likes</span>
              {incomingLikesCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-black">
                  {incomingLikesCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

