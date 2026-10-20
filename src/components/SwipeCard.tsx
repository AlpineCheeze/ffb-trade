'use client';

import React, { useState, useRef, useEffect, useImperativeHandle, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion';
import { Player, Team } from '@/types/fantasy';
import { ShieldAlert, Calendar, Check, X, Info, UserX } from 'lucide-react';

export interface SwipeCardRef {
  swipe: (isInterested: boolean) => void;
  toggleStats: () => void;
}

export interface SwipeCardProps {
  players: Player[];
  ownerTeam?: Team;
  isFront: boolean;
  onSwipe: (isInterested: boolean) => void;
  onExcludeOwner?: (teamId: string, ownerName: string) => void;
  onSwipeStart?: () => void;
}

export const SwipeCard = React.forwardRef<SwipeCardRef, SwipeCardProps>(function SwipeCard(
  {
    players,
    ownerTeam,
    isFront,
    onSwipe,
    onExcludeOwner,
    onSwipeStart,
  },
  ref
) {
  const [showStats, setShowStats] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [actionStamp, setActionStamp] = useState<'want' | 'pass' | null>(null);
  const isSwipingRef = useRef(false);
  const isInitialMount = useRef(true);

  const onSwipeRef = useRef(onSwipe);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);

  const onSwipeStartRef = useRef(onSwipeStart);
  useEffect(() => {
    onSwipeStartRef.current = onSwipeStart;
  }, [onSwipeStart]);

  useEffect(() => {
    return () => {
      isSwipingRef.current = false;
    };
  }, []);

  const x = useMotionValue(0);
  const cardOpacity = useMotionValue(isFront ? 1 : 0.6);
  const rotate = useTransform(x, [-250, 250], [-18, 18]);
  const opacityLike = useTransform(x, [20, 100], [0, 1]);
  const opacityPass = useTransform(x, [-20, -100], [0, 1]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isFront) {
      cardOpacity.set(0.6);
      animate(cardOpacity, 1, { duration: 0.25, ease: 'easeOut' });
      x.set(0);
      setActionStamp(null);
      isSwipingRef.current = false;
    } else {
      cardOpacity.set(0.6);
      x.set(0);
      setActionStamp(null);
      setShowStats(false);
    }
  }, [isFront, cardOpacity, x]);

  const isPackage = players.length > 1;

  const triggerSwipe = useCallback((isInterested: boolean, initialVelocity = 0, isButtonTrigger = false) => {
    if (isSwipingRef.current) return;
    isSwipingRef.current = true;
    onSwipeStartRef.current?.();

    if (isButtonTrigger) {
      setActionStamp(isInterested ? 'want' : 'pass');
    }

    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
    const flyDistance = Math.max(screenWidth * 0.85, 450);
    const targetX = isInterested ? flyDistance : -flyDistance;

    // Fade out card towards the end of the fly-out
    animate(cardOpacity, 0, {
      duration: 0.15,
      delay: 0.18,
      ease: 'easeOut',
    });

    animate(x, targetX, {
      duration: 0.35,
      ease: [0.32, 0.72, 0, 1],
      velocity: initialVelocity,
      onComplete: () => {
        onSwipeRef.current(isInterested);
        isSwipingRef.current = false;
      },
    });
  }, [cardOpacity, x]);

  useImperativeHandle(
    ref,
    () => ({
      swipe: (isInterested: boolean) => {
        triggerSwipe(isInterested, 0, true);
      },
      toggleStats: () => {
        setShowStats((prev) => !prev);
      },
    }),
    [triggerSwipe]
  );

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (isSwipingRef.current) return;

    const threshold = 90;
    const velocityThreshold = 400;

    // Both offset and velocity must not contradict each other
    if (
      (info.offset.x > threshold && info.velocity.x >= -100) ||
      (info.offset.x > 20 && info.velocity.x > velocityThreshold)
    ) {
      triggerSwipe(true, info.velocity.x, false);
    } else if (
      (info.offset.x < -threshold && info.velocity.x <= 100) ||
      (info.offset.x < -20 && info.velocity.x < -velocityThreshold)
    ) {
      triggerSwipe(false, info.velocity.x, false);
    } else {
      setActionStamp(null);
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
      cardOpacity.set(1);
    }
  };

  const handleImgError = (id: string) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <motion.div
      style={{
        x: isFront ? x : 0,
        rotate: isFront ? rotate : 0,
        opacity: isFront ? cardOpacity : 0.6,
      }}
      animate={{
        scale: isFront ? 1 : 0.96,
        y: isFront ? 0 : 8,
      }}
      transition={{
        duration: 0.2,
        ease: 'easeOut',
      }}
      drag={isFront && !actionStamp ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      whileTap={isFront && !actionStamp ? { cursor: 'grabbing' } : {}}
      className={`absolute inset-0 w-full h-full rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl overflow-hidden flex flex-col select-none touch-none ${
        isFront ? 'cursor-grab shadow-blue-900/20 shadow-2xl' : 'pointer-events-none'
      }`}
    >
      {/* Visual Stamps on Drag / Button Action */}
      {isFront && (
        <>
          <motion.div
            style={{
              opacity: actionStamp === 'want' ? 1 : actionStamp === 'pass' ? 0 : opacityLike,
            }}
            animate={
              actionStamp === 'want'
                ? { scale: [0.75, 1.15, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute top-8 left-8 z-30 pointer-events-none -rotate-12 border-4 border-emerald-500 text-emerald-400 bg-emerald-950/80 px-4 py-1.5 rounded-xl font-black text-2xl tracking-wider uppercase shadow-lg shadow-emerald-500/30 flex items-center gap-2"
          >
            <Check className="w-7 h-7 stroke-[3]" />
            WANT
          </motion.div>

          <motion.div
            style={{
              opacity: actionStamp === 'pass' ? 1 : actionStamp === 'want' ? 0 : opacityPass,
            }}
            animate={
              actionStamp === 'pass'
                ? { scale: [0.75, 1.15, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute top-8 right-8 z-30 pointer-events-none rotate-12 border-4 border-rose-500 text-rose-400 bg-rose-950/80 px-4 py-1.5 rounded-xl font-black text-2xl tracking-wider uppercase shadow-lg shadow-rose-500/30 flex items-center gap-2"
          >
            <X className="w-7 h-7 stroke-[3]" />
            PASS
          </motion.div>
        </>
      )}

      {/* SINGLE PLAYER CARD */}
      {!isPackage && players[0] && (
        <>
          <div className="relative h-44 min-[400px]:h-52 sm:h-72 bg-gradient-to-b from-slate-800/80 via-slate-900/40 to-slate-900 p-4 sm:p-5 flex flex-col justify-between overflow-hidden">
            <div className="absolute -top-10 -right-10 text-9xl font-black text-slate-800/25 select-none pointer-events-none">
              {players[0].position}
            </div>

            <div className="flex justify-between items-center gap-1.5 z-10">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-md shadow-blue-500/20">
                  {players[0].position}
                </span>
                <span className="px-2 sm:px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 border border-slate-700 text-slate-300">
                  {players[0].nflTeam} {players[0].jerseyNumber !== undefined ? `#${players[0].jerseyNumber}` : ''}
                </span>
                {players[0].injuryStatus !== 'ACTIVE' && (
                  <span className="px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {players[0].injuryStatus}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-slate-800/80 border border-slate-700/80 text-slate-300 flex-shrink-0">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>Bye {players[0].byeWeek}</span>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 h-[150px] min-[400px]:h-[180px] sm:h-[250px] flex justify-center items-end pointer-events-none">
              {!imgErrors[players[0].id] ? (
                <img
                  src={players[0].headshotUrl}
                  alt={players[0].fullName}
                  onError={() => handleImgError(players[0].id)}
                  className="h-full object-contain filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.85)] transition-transform duration-300"
                />
              ) : (
                <div className="h-36 w-36 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-3xl font-black text-slate-500 mb-4">
                  {players[0].position}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between bg-slate-900/90 z-10 min-h-0">
            <div className="min-h-0 overflow-hidden flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white truncate">
                    {players[0].fullName}
                  </h2>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-slate-400 font-medium truncate flex-1">
                      Current Owner: <span className="text-blue-400 font-semibold">{ownerTeam?.claimedBy || ownerTeam?.ownerName || 'Opponent'}</span>{ownerTeam?.name ? ` (${ownerTeam.name})` : ''}
                    </p>
                    {onExcludeOwner && ownerTeam && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExcludeOwner(ownerTeam.id, ownerTeam.claimedBy || ownerTeam.ownerName || ownerTeam.name);
                        }}
                        className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 transition-all flex-shrink-0"
                        title={`Exclude ${ownerTeam.claimedBy || ownerTeam.ownerName || ownerTeam.name} from trade deck`}
                      >
                        <UserX className="w-3.5 h-3.5 text-rose-400" />
                        <span>Exclude Owner</span>
                      </button>
                    )}
                  </div>
                </div>

                {players[0].stats && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowStats(!showStats);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors ml-2 flex-shrink-0"
                    title="Toggle Detailed Stats"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Compact 2-Column Key-Value Season Stats Grid */}
              {showStats && players[0].stats && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-1.5 p-2 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300"
                >
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {players[0].stats.passingYards !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Pass:</span>
                        <span className="font-bold text-white">{players[0].stats.passingYards} yds</span>
                      </div>
                    )}
                    {players[0].stats.rushingYards !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rush:</span>
                        <span className="font-bold text-white">{players[0].stats.rushingYards} yds</span>
                      </div>
                    )}
                    {players[0].stats.receivingYards !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rec:</span>
                        <span className="font-bold text-white">{players[0].stats.receivingYards} yds</span>
                      </div>
                    )}
                    {players[0].stats.touchdowns !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">TDs:</span>
                        <span className="font-bold text-amber-400">{players[0].stats.touchdowns}</span>
                      </div>
                    )}
                    {players[0].stats.snapSharePercent !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Snap:</span>
                        <span className="font-bold text-blue-400">{players[0].stats.snapSharePercent}%</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-semibold flex-shrink-0">
              <span className="flex items-center gap-1 text-rose-400/80">
                <X className="w-3.5 h-3.5" /> Swipe Left to Pass
              </span>
              <span className="flex items-center gap-1 text-emerald-400/80">
                Swipe Right to Want <Check className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </>
      )}

      {/* MULTI-PLAYER PACKAGE CARD (2 or 3 players) */}
      {isPackage && (
        <div className={`flex-1 flex flex-col justify-between bg-slate-900/95 z-10 min-h-0 ${
          players.length >= 3 ? 'p-3 sm:p-4' : 'p-4'
        }`}>
          {/* Package Header */}
          <div className={`flex items-center justify-between border-b border-slate-800 flex-shrink-0 ${
            players.length >= 3 ? 'pb-2 sm:pb-2.5' : 'pb-2.5'
          }`}>
            <div className="min-w-0 flex-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
                You Receive ({players.length} Players)
              </span>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs text-slate-400 font-semibold truncate flex-1 min-w-0">
                  From: <span className="text-blue-400">{ownerTeam?.claimedBy || ownerTeam?.ownerName || 'Opponent'}</span>{ownerTeam?.name ? ` (${ownerTeam.name})` : ''}
                </span>
                {onExcludeOwner && ownerTeam && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExcludeOwner(ownerTeam.id, ownerTeam.claimedBy || ownerTeam.ownerName || ownerTeam.name);
                    }}
                    className="inline-flex items-center justify-center gap-1 min-h-[36px] sm:min-h-[40px] px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 transition-all flex-shrink-0 touch-manipulation"
                    title={`Exclude ${ownerTeam.claimedBy || ownerTeam.ownerName || ownerTeam.name} from trade deck`}
                  >
                    <UserX className="w-3.5 h-3.5 text-rose-400" />
                    <span>Exclude</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Player Rows */}
          <div className={`flex-1 flex flex-col justify-around min-h-0 overflow-hidden ${
            players.length >= 3 ? 'py-1.5 gap-1.5' : 'py-1 gap-2.5'
          }`}>
            {players.map((player) => (
              <div
                key={player.id}
                className={`bg-slate-950/70 border border-slate-800 rounded-xl sm:rounded-2xl flex items-center relative flex-shrink-0 ${
                  players.length >= 3
                    ? 'p-1.5 min-[400px]:p-2 sm:p-2.5 gap-2 sm:gap-3'
                    : 'p-3 gap-3.5'
                }`}
              >
                {/* Player Photo */}
                <div
                  className={`rounded-lg sm:rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden flex-shrink-0 flex items-center justify-center ${
                    players.length >= 3
                      ? 'w-10 h-10 min-[400px]:w-11 min-[400px]:h-11 sm:w-14 sm:h-14'
                      : 'w-16 h-16'
                  }`}
                >
                  {!imgErrors[player.id] ? (
                    <img
                      src={player.headshotUrl}
                      alt={player.fullName}
                      onError={() => handleImgError(player.id)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-black text-slate-500 text-xs">
                      {player.position}
                    </span>
                  )}
                </div>

                {/* Player Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] min-[400px]:text-[10px] font-black bg-blue-600 text-white">
                      {player.position}
                    </span>
                    <span className="text-[11px] min-[400px]:text-xs text-slate-400 font-semibold truncate">
                      {player.nflTeam}
                    </span>
                    {player.injuryStatus !== 'ACTIVE' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {player.injuryStatus}
                      </span>
                    )}
                  </div>

                  <h3 className={`font-black text-white truncate leading-tight ${
                    players.length >= 3 ? 'text-xs min-[400px]:text-sm sm:text-base mt-0.5' : 'text-base mt-0.5'
                  }`}>
                    {player.fullName}
                  </h3>

                  <div className={`text-[10px] min-[400px]:text-[11px] text-slate-400 flex items-center gap-2 font-medium ${
                    players.length >= 3 ? 'mt-0.5' : 'mt-0.5'
                  }`}>
                    <span>Bye Week {player.byeWeek}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Swipe Hint Footer */}
          <div className={`border-t border-slate-800/80 flex items-center justify-between text-[10px] min-[400px]:text-[11px] text-slate-500 font-semibold flex-shrink-0 ${
            players.length >= 3 ? 'pt-2 pb-0.5 mt-1' : 'pt-2'
          }`}>
            <span className="flex items-center gap-1 text-rose-400/80">
              <X className="w-3.5 h-3.5" /> Swipe Left to Pass Package
            </span>
            <span className="flex items-center gap-1 text-emerald-400/80">
              Swipe Right to Want <Check className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
});

SwipeCard.displayName = 'SwipeCard';

