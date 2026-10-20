'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { IncomingLike, Player, Team } from '@/types/fantasy';
import {
  ArrowLeft,
  Heart,
  Check,
  X,
  Flame,
  Sparkles,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  List,
  Clock,
  RotateCcw,
} from 'lucide-react';

interface YourLikesViewProps {
  incomingLikes: IncomingLike[];
  currentTeam: Team;
  onBackToMatches: () => void;
  onSwipeLike: (like: IncomingLike, isInterested: boolean) => void;
  onStartSwipingDeck: () => void;
}

export const YourLikesView: React.FC<YourLikesViewProps> = ({
  incomingLikes,
  currentTeam,
  onBackToMatches,
  onSwipeLike,
  onStartSwipingDeck,
}) => {
  const [viewMode, setViewMode] = useState<'deck' | 'list'>('deck');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionStamp, setActionStamp] = useState<'want' | 'pass' | null>(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  // Ensure currentIndex stays within bounds when likes are resolved
  useEffect(() => {
    if (currentIndex >= incomingLikes.length && incomingLikes.length > 0) {
      setCurrentIndex(incomingLikes.length - 1);
    }
  }, [incomingLikes.length, currentIndex]);

  const activeLike = incomingLikes[currentIndex] || incomingLikes[0] || null;

  // Motion values for front card drag
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacityLike = useTransform(x, [20, 100], [0, 1]);
  const opacityPass = useTransform(x, [-20, -100], [0, 1]);

  const handleImgError = (id: string) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  };

  const handleExecuteAction = useCallback(
    (like: IncomingLike, isInterested: boolean) => {
      if (isAnimatingOut) return;
      setIsAnimatingOut(true);
      setActionStamp(isInterested ? 'want' : 'pass');

      setTimeout(() => {
        onSwipeLike(like, isInterested);
        x.set(0);
        setActionStamp(null);
        setIsAnimatingOut(false);
      }, 350);
    },
    [isAnimatingOut, onSwipeLike, x]
  );

  const handleDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (!activeLike || isAnimatingOut) return;
    const threshold = 100;
    const velocityThreshold = 400;

    if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      handleExecuteAction(activeLike, true);
    } else if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
      handleExecuteAction(activeLike, false);
    } else {
      x.set(0);
    }
  };

  // Keyboard shortcut listener (← Pass, → Want) in deck mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'deck' || !activeLike || isAnimatingOut) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleExecuteAction(activeLike, true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleExecuteAction(activeLike, false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, activeLike, isAnimatingOut, handleExecuteAction]);

  // Points diff calculation helper
  const calculatePointsDiff = (like: IncomingLike) => {
    const sendPts = (like.offeredPlayers || []).reduce(
      (sum, p) => sum + (p.projectedPoints || 0),
      0
    );
    const receivePts = (like.targetPlayers || []).reduce(
      (sum, p) => sum + (p.projectedPoints || 0),
      0
    );
    const diff = receivePts - sendPts;
    return {
      sendPts,
      receivePts,
      diff,
      isPositive: diff >= 0,
    };
  };

  const formatRelativeTime = (iso?: string) => {
    if (!iso) return 'Recently';
    try {
      const now = Date.now();
      const past = new Date(iso).getTime();
      const diffMs = now - past;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in duration-200">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToMatches}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition active:scale-95 flex items-center gap-1.5 text-xs font-semibold"
            title="Return to Matches"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Matches</span>
          </button>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Heart className="w-6 h-6 text-pink-500 fill-pink-500/30" />
              <span>Your Likes</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-pink-500/20 border border-pink-500/40 text-pink-300">
                {incomingLikes.length}
              </span>
            </h2>
          </div>
        </div>

        {/* View Mode Toggle */}
        {incomingLikes.length > 0 && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('deck')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'deck'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Swipe Deck</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'list'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>All ({incomingLikes.length})</span>
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Other fantasy owners have swiped <strong className="text-pink-300 font-semibold">&ldquo;YES&rdquo;</strong> on these trade packages. Swipe <strong>YES</strong> to instantly match and confirm the trade proposal, or <strong>PASS</strong> to decline.
      </p>

      {/* EMPTY STATE */}
      {incomingLikes.length === 0 && (
        <div className="max-w-md mx-auto p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center shadow-2xl space-y-4 my-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-purple-500/20 border border-pink-500/30 text-pink-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">You&apos;re All Caught Up!</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              No pending incoming likes right now. When other owners swipe &ldquo;yes&rdquo; on trades involving your players, they&apos;ll show up right here!
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStartSwipingDeck}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/25 transition active:scale-95"
            >
              Browse Swipe Deck
            </button>
            <button
              type="button"
              onClick={onBackToMatches}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition active:scale-95"
            >
              Return to Matches
            </button>
          </div>
        </div>
      )}

      {/* VIEW 1: SWIPE CARD DECK MODE */}
      {incomingLikes.length > 0 && viewMode === 'deck' && activeLike && (
        <div className="space-y-4">
          {/* Card Container */}
          <div className="relative min-h-[460px] sm:min-h-[500px] w-full max-w-lg mx-auto flex items-center justify-center select-none touch-none">
            {/* Background preview card if multiple likes */}
            {incomingLikes.length > 1 && (
              <div className="absolute inset-x-2 top-3 bottom-0 rounded-3xl bg-slate-900/60 border border-slate-800/60 shadow-xl opacity-60 scale-[0.96] translate-y-2 pointer-events-none" />
            )}

            {/* Active Front Card with Drag Gestures */}
            <motion.div
              style={{
                x,
                rotate,
              }}
              animate={
                actionStamp === 'want'
                  ? { x: 500, opacity: 0 }
                  : actionStamp === 'pass'
                  ? { x: -500, opacity: 0 }
                  : { x: 0, opacity: 1, scale: 1 }
              }
              transition={{ duration: 0.25, ease: 'easeOut' }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.65}
              onDragEnd={handleDragEnd}
              className="relative w-full rounded-3xl bg-slate-900 border border-pink-500/30 shadow-2xl shadow-pink-950/30 p-4 sm:p-5 flex flex-col justify-between cursor-grab active:cursor-grabbing overflow-hidden"
            >
              {/* STAMPS: WANT (ACCEPT) AND PASS */}
              <motion.div
                style={{
                  opacity: actionStamp === 'want' ? 1 : actionStamp === 'pass' ? 0 : opacityLike,
                }}
                className="absolute top-6 left-6 z-30 pointer-events-none -rotate-12 border-4 border-emerald-500 text-emerald-400 bg-emerald-950/90 px-4 py-1.5 rounded-xl font-black text-xl tracking-wider uppercase shadow-xl flex items-center gap-1.5"
              >
                <Check className="w-6 h-6 stroke-[3]" />
                MATCH!
              </motion.div>

              <motion.div
                style={{
                  opacity: actionStamp === 'pass' ? 1 : actionStamp === 'want' ? 0 : opacityPass,
                }}
                className="absolute top-6 right-6 z-30 pointer-events-none rotate-12 border-4 border-rose-500 text-rose-400 bg-rose-950/90 px-4 py-1.5 rounded-xl font-black text-xl tracking-wider uppercase shadow-xl flex items-center gap-1.5"
              >
                <X className="w-6 h-6 stroke-[3]" />
                PASS
              </motion.div>

              <div className="space-y-4">
                {/* Header: Opponent Info & Reciprocal Package */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {activeLike.opponentLogoUrl && !imgErrors[activeLike.opponentTeamId] ? (
                      <img
                        src={activeLike.opponentLogoUrl}
                        alt={activeLike.opponentTeamName}
                        onError={() => handleImgError(activeLike.opponentTeamId)}
                        className="w-10 h-10 rounded-xl object-cover bg-slate-950 border border-slate-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 to-purple-600 text-white font-black text-sm flex items-center justify-center flex-shrink-0 shadow-md">
                        {activeLike.opponentTeamName.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {activeLike.opponentTeamName}
                      </div>
                      <div className="text-[11px] text-pink-300 font-semibold flex items-center gap-1.5">
                        <Heart className="w-3 h-3 fill-pink-300" />
                        <span>Liked your players</span>
                        {activeLike.opponentOwnerName && (
                          <span className="text-slate-400">
                            (@{activeLike.opponentOwnerName})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 border border-purple-500/40 text-purple-300">
                      {activeLike.tradeType}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatRelativeTime(activeLike.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Side-by-side or stacked rosters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {/* YOU SEND */}
                  <div className="p-3 rounded-2xl bg-slate-950/70 border border-rose-500/20 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-rose-300 border-b border-slate-800/80 pb-1.5">
                      <span>You Send ({activeLike.offeredPlayers.length})</span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        {calculatePointsDiff(activeLike).sendPts.toFixed(1)} pts
                      </span>
                    </div>

                    <div className="space-y-2">
                      {activeLike.offeredPlayers.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-slate-900/80 border border-slate-800"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {player.headshotUrl && !imgErrors[player.id] ? (
                              <img
                                src={player.headshotUrl}
                                alt={player.fullName}
                                onError={() => handleImgError(player.id)}
                                className="w-9 h-9 rounded-full object-cover bg-slate-950 border border-slate-800 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-800 text-[10px] font-bold text-slate-400 flex items-center justify-center flex-shrink-0">
                                {player.position}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {player.fullName}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <span className="font-black text-rose-400">{player.position}</span>
                                <span>•</span>
                                <span>{player.nflTeam}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-xs font-bold text-slate-300 font-mono flex-shrink-0">
                            {player.projectedPoints?.toFixed(1) || '0.0'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* YOU RECEIVE */}
                  <div className="p-3 rounded-2xl bg-slate-950/70 border border-emerald-500/20 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-emerald-300 border-b border-slate-800/80 pb-1.5">
                      <span>You Receive ({activeLike.targetPlayers.length})</span>
                      <span className="text-emerald-400 font-mono text-[10px]">
                        {calculatePointsDiff(activeLike).receivePts.toFixed(1)} pts
                      </span>
                    </div>

                    <div className="space-y-2">
                      {activeLike.targetPlayers.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-slate-900/80 border border-slate-800"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {player.headshotUrl && !imgErrors[player.id] ? (
                              <img
                                src={player.headshotUrl}
                                alt={player.fullName}
                                onError={() => handleImgError(player.id)}
                                className="w-9 h-9 rounded-full object-cover bg-slate-950 border border-slate-800 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-800 text-[10px] font-bold text-slate-400 flex items-center justify-center flex-shrink-0">
                                {player.position}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {player.fullName}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <span className="font-black text-emerald-400">{player.position}</span>
                                <span>•</span>
                                <span>{player.nflTeam}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-xs font-bold text-emerald-400 font-mono flex-shrink-0">
                            {player.projectedPoints?.toFixed(1) || '0.0'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Net Projected Points Differential */}
                {(() => {
                  const pts = calculatePointsDiff(activeLike);
                  return (
                    <div
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                        pts.isPositive
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {pts.isPositive ? (
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-amber-400" />
                        )}
                        <span>Net Projected Scoring:</span>
                      </span>
                      <span className="font-black font-mono">
                        {pts.diff >= 0 ? `+${pts.diff.toFixed(1)}` : pts.diff.toFixed(1)} Proj Pts
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Counter / Instruction footer */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Drag RIGHT to Accept, LEFT to Pass</span>
                <span className="font-bold text-slate-400">
                  {currentIndex + 1} of {incomingLikes.length}
                </span>
              </div>
            </motion.div>
          </div>

          {/* Action Buttons Below the Card */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              disabled={isAnimatingOut}
              onClick={() => handleExecuteAction(activeLike, false)}
              className="flex-1 max-w-[170px] py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-500/50 text-rose-400 font-extrabold text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-black/40 disabled:opacity-50"
              title="Pass on this trade offer"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
              <span>Pass</span>
            </button>

            <button
              type="button"
              disabled={isAnimatingOut}
              onClick={() => handleExecuteAction(activeLike, true)}
              className="flex-1 max-w-[210px] py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-emerald-950/60 hover:shadow-emerald-500/30 border border-emerald-400/40 disabled:opacity-50"
              title="Accept trade and create mutual match!"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Swipe Yes / Match</span>
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: ALL LIKES FEED / LIST MODE */}
      {incomingLikes.length > 0 && viewMode === 'list' && (
        <div className="space-y-3">
          {incomingLikes.map((like, idx) => {
            const pts = calculatePointsDiff(like);

            return (
              <div
                key={like.id || idx}
                className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-pink-500/40 transition shadow-lg space-y-3 text-left"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {like.opponentLogoUrl && !imgErrors[like.opponentTeamId] ? (
                      <img
                        src={like.opponentLogoUrl}
                        alt={like.opponentTeamName}
                        onError={() => handleImgError(like.opponentTeamId)}
                        className="w-8 h-8 rounded-xl object-cover bg-slate-950 border border-slate-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {like.opponentTeamName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {like.opponentTeamName}
                      </div>
                      <div className="text-[10px] text-pink-300 font-medium">
                        Liked your players {like.opponentOwnerName ? `(@${like.opponentOwnerName})` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-500/20 border border-purple-500/40 text-purple-300">
                      {like.tradeType}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {formatRelativeTime(like.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Trade Package Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* SEND */}
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300 flex items-center justify-between">
                      <span>You Send ({like.offeredPlayers.length})</span>
                      <span className="font-mono text-slate-400">{pts.sendPts.toFixed(1)} pts</span>
                    </div>
                    <div className="space-y-1">
                      {like.offeredPlayers.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200 truncate">
                            {p.fullName} <span className="text-rose-400 text-[10px]">({p.position})</span>
                          </span>
                          <span className="font-mono text-slate-400 text-[10px]">
                            {p.projectedPoints?.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* RECEIVE */}
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center justify-between">
                      <span>You Receive ({like.targetPlayers.length})</span>
                      <span className="font-mono text-emerald-400">{pts.receivePts.toFixed(1)} pts</span>
                    </div>
                    <div className="space-y-1">
                      {like.targetPlayers.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white truncate">
                            {p.fullName} <span className="text-emerald-400 text-[10px]">({p.position})</span>
                          </span>
                          <span className="font-mono text-emerald-400 text-[10px]">
                            {p.projectedPoints?.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60">
                  <div
                    className={`text-[11px] font-semibold flex items-center gap-1 ${
                      pts.isPositive ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {pts.isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>Net: {pts.diff >= 0 ? `+${pts.diff.toFixed(1)}` : pts.diff.toFixed(1)} pts</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExecuteAction(like, false)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 border border-slate-700 text-rose-400 hover:text-rose-300 font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Pass</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExecuteAction(like, true)}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/50 transition active:scale-95 border border-emerald-400/30"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Swipe Yes / Match</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
