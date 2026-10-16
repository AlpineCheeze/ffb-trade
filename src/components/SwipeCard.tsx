'use client';

import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Player, Team } from '@/types/fantasy';
import { ShieldAlert, Calendar, Check, X, Info, Plus, Zap, TrendingUp, UserX } from 'lucide-react';

interface SwipeCardProps {
  players: Player[];
  ownerTeam?: Team;
  isFront: boolean;
  onSwipe: (isInterested: boolean) => void;
  onExcludeOwner?: (teamId: string, ownerName: string) => void;
}

export const SwipeCard: React.FC<SwipeCardProps> = ({
  players,
  ownerTeam,
  isFront,
  onSwipe,
  onExcludeOwner,
}) => {
  const [showStats, setShowStats] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-18, 18]);
  const opacityLike = useTransform(x, [20, 100], [0, 1]);
  const opacityPass = useTransform(x, [-20, -100], [0, 1]);

  const isPackage = players.length > 1;

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 90;
    const velocityThreshold = 400;

    // Both offset and velocity must not contradict each other
    if (
      (info.offset.x > threshold && info.velocity.x >= -100) ||
      (info.offset.x > 20 && info.velocity.x > velocityThreshold)
    ) {
      onSwipe(true);
    } else if (
      (info.offset.x < -threshold && info.velocity.x <= 100) ||
      (info.offset.x < -20 && info.velocity.x < -velocityThreshold)
    ) {
      onSwipe(false);
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
      }}
      drag={isFront ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      whileTap={isFront ? { cursor: 'grabbing' } : {}}
      className={`absolute inset-0 w-full h-[440px] sm:h-[540px] rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl overflow-hidden flex flex-col cursor-grab select-none touch-none transition-shadow ${
        isFront ? 'shadow-blue-900/20 shadow-2xl' : 'scale-95 translate-y-3 opacity-60 pointer-events-none'
      }`}
    >
      {/* Visual Stamps on Drag */}
      {isFront && (
        <>
          <motion.div
            style={{ opacity: opacityLike }}
            className="absolute top-8 left-8 z-30 pointer-events-none -rotate-12 border-4 border-emerald-500 text-emerald-400 bg-emerald-950/80 px-4 py-1.5 rounded-xl font-black text-2xl tracking-wider uppercase shadow-lg shadow-emerald-500/30 flex items-center gap-2"
          >
            <Check className="w-7 h-7 stroke-[3]" />
            WANT
          </motion.div>

          <motion.div
            style={{ opacity: opacityPass }}
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
          <div className="relative h-52 sm:h-72 bg-gradient-to-b from-slate-800/80 via-slate-900/40 to-slate-900 p-5 flex flex-col justify-between overflow-hidden">
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

            <div className="absolute inset-x-0 bottom-0 h-[180px] sm:h-[250px] flex justify-center items-end pointer-events-none">
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

              {/* Core Fantasy Metrics Bar */}
              <div className="grid grid-cols-2 gap-2 my-1.5 flex-shrink-0">
                <div className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" /> Proj
                  </span>
                  <span className="text-xs font-black text-white">
                    {players[0].projectedPoints.toFixed(1)} <span className="text-[10px] font-normal text-slate-500">pts</span>
                  </span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-400" /> Avg
                  </span>
                  <span className="text-xs font-black text-white">
                    {players[0].seasonAvgPoints.toFixed(1)} <span className="text-[10px] font-normal text-slate-500">pts</span>
                  </span>
                </div>
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

      {/* 2-PLAYER PACKAGE CARD */}
      {isPackage && (
        <div className="flex-1 flex flex-col justify-between p-4 bg-slate-900/95 z-10">
          {/* Package Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
                2-Player Package
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-400 font-semibold truncate">
                  From: <span className="text-blue-400">{ownerTeam?.claimedBy || ownerTeam?.ownerName || 'Opponent'}</span>{ownerTeam?.name ? ` (${ownerTeam.name})` : ''}
                </span>
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
                    <span>Exclude</span>
                  </button>
                )}
              </div>
            </div>
            <span className="text-[11px] font-bold text-slate-500">2 Assets</span>
          </div>

          {/* Two Player Rows */}
          <div className="flex-1 flex flex-col justify-around py-2 gap-2">
            {players.slice(0, 2).map((player, idx) => (
              <div
                key={player.id}
                className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 flex items-center gap-3.5 relative overflow-hidden"
              >
                {/* Plus separator between rows */}
                {idx === 1 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center z-10">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                )}

                {/* Player Photo */}
                <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden flex-shrink-0 flex items-center justify-center">
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
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-600 text-white">
                      {player.position}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold truncate">
                      {player.nflTeam}
                    </span>
                    {player.injuryStatus !== 'ACTIVE' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {player.injuryStatus}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-black text-white truncate mt-1">
                    {player.fullName}
                  </h3>

                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-medium">
                    <span>Bye Week {player.byeWeek}</span>
                    <span>•</span>
                    <span className="text-slate-300 font-bold">{player.projectedPoints.toFixed(1)} pts</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Swipe Hint Footer */}
          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
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
};
