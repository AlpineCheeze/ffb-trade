import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { Player } from '../types';
import { Share2, ThumbsUp, ThumbsDown, Info } from 'lucide-react';

interface TinderCardProps {
  givePlayers: Player[];
  getPlayers: Player[];
  onSwipe: (choice: 'YES' | 'NO', score: number, label: string) => void;
  leagueStats?: Record<string, any>;
}

export const TinderCard: React.FC<TinderCardProps> = ({ givePlayers, getPlayers, onSwipe, leagueStats }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
  
  // Transform for labels based on quadrant
  const yesOpacity = useTransform(x, [50, 150], [0, 1]);
  const noOpacity = useTransform(x, [-150, -50], [1, 0]);

  const getSwipeData = (xVal: number, yVal: number) => {
    if (xVal > 100) {
      if (yVal < -50) return { choice: 'YES' as const, score: 0.0, label: 'INSTANT YES' };
      if (yVal > 50) return { choice: 'YES' as const, score: 0.4, label: 'HESITANT YES' };
      return { choice: 'YES' as const, score: 0.2, label: 'SOLID YES' };
    } else if (xVal < -100) {
      if (yVal < -50) return { choice: 'NO' as const, score: 1.0, label: 'ABSOLUTELY NOT' };
      if (yVal > 50) return { choice: 'NO' as const, score: 0.6, label: 'CLOSE BUT NO' };
      return { choice: 'NO' as const, score: 0.8, label: 'NO THANKS' };
    }
    return null;
  };

  const activeLabel = useTransform([x, y], ([latestX, latestY]) => {
    const data = getSwipeData(latestX as number, latestY as number);
    return data?.label || '';
  });

  const labelColor = useTransform(x, [-150, 0, 150], ['#ef4444', '#71717a', '#22c55e']);

  const handleDragEnd = (_: any, info: any) => {
    const data = getSwipeData(info.offset.x, info.offset.y);
    if (data) {
      onSwipe(data.choice, data.score, data.label);
    }
  };

  return (
    <div className="relative w-full max-w-sm aspect-[3/4] mx-auto mt-8">
      <AnimatePresence>
        <motion.div
          style={{ x, y, rotate, opacity, touchAction: 'none' }}
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.6}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 bg-zinc-900 border-2 border-zinc-800 rounded-3xl p-6 shadow-2xl cursor-grab active:cursor-grabbing flex flex-col justify-between overflow-hidden"
        >
          {/* Overlay indicators */}
          <motion.div 
             style={{ opacity: yesOpacity }}
             className="absolute top-10 right-10 border-4 border-green-500 text-green-500 font-black text-2xl px-4 py-2 rounded-xl rotate-12 z-10 pointer-events-none"
          >
            <motion.div>{activeLabel}</motion.div>
          </motion.div>
          
          <motion.div 
            style={{ opacity: noOpacity }}
            className="absolute top-10 left-10 border-4 border-red-500 text-red-500 font-black text-2xl px-4 py-2 rounded-xl -rotate-12 z-10 pointer-events-none"
          >
            <motion.div>{activeLabel}</motion.div>
          </motion.div>

          <div className="space-y-8">
            <section>
              <h3 className="text-zinc-500 font-mono text-xs uppercase tracking-widest mb-3">You Give</h3>
              <div className="space-y-2">
                {givePlayers.map(p => {
                  const lElo = leagueStats ? (leagueStats[p.id]?.elo || 1500) : null;
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50">
                      <div>
                        <div className="font-bold text-zinc-100">{p.name}</div>
                        <div className="text-[10px] text-zinc-500 uppercase">{p.position} • {p.team}</div>
                      </div>
                      <div className="text-right">
                        <div className="bg-zinc-700 px-2 py-0.5 rounded text-[10px] font-mono text-zinc-300">
                          {Math.round(lElo ?? p.elo)}
                        </div>
                        {lElo !== null && (
                          <div className="text-[8px] text-zinc-500 font-mono mt-1">Glbl: {Math.round(p.elo)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="flex justify-center">
              <div className="h-px w-full bg-zinc-800 relative">
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 px-4 text-zinc-600 font-black italic text-sm tracking-tighter">FOR</span>
              </div>
            </div>

            <section>
              <h3 className="text-green-500 font-mono text-xs uppercase tracking-widest mb-3">You Get</h3>
              <div className="space-y-2">
                {getPlayers.map(p => {
                  const lElo = leagueStats ? (leagueStats[p.id]?.elo || 1500) : null;
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50">
                      <div>
                        <div className="font-bold text-zinc-100">{p.name}</div>
                        <div className="text-[10px] text-zinc-500 uppercase">{p.position} • {p.team}</div>
                      </div>
                      <div className="text-right">
                        <div className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded text-[10px] font-mono border border-green-900/50">
                          {Math.round(lElo ?? p.elo)}
                        </div>
                        {lElo !== null && (
                          <div className="text-[8px] text-zinc-500 font-mono mt-1 text-right">Glbl: {Math.round(p.elo)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t border-zinc-800/50">
            <div className="text-[10px] text-zinc-600 font-mono">SWIPE RIGHT OR LEFT</div>
            <div className="flex gap-2">
               <button className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                  <Share2 size={16} />
               </button>
               <button className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                  <Info size={16} />
               </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
