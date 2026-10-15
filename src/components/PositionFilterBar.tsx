'use client';

import React, { useState } from 'react';
import { Position } from '@/types/fantasy';
import { Check, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

export const ALL_POSITIONS: Position[] = ['RB', 'WR', 'TE', 'QB', 'FLEX', 'K', 'DEF'];

interface PositionFilterBarProps {
  selectedPositions: Position[];
  onTogglePosition: (pos: Position) => void;
  onSelectAll: () => void;
  onSelectPreset: (positions: Position[]) => void;
  availableCount: number;
  offeredPlayerPosition?: Position;
}

export const PositionFilterBar: React.FC<PositionFilterBarProps> = ({
  selectedPositions,
  onTogglePosition,
  onSelectAll,
  onSelectPreset,
  availableCount,
  offeredPlayerPosition,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isAllSelected = selectedPositions.length === ALL_POSITIONS.length;

  const positionLabels: Record<Position, { label: string; full: string; color: string }> = {
    RB: { label: 'RB', full: 'Running Back', color: 'from-emerald-500 to-green-600' },
    WR: { label: 'WR', full: 'Wide Receiver', color: 'from-blue-500 to-indigo-600' },
    TE: { label: 'TE', full: 'Tight End', color: 'from-amber-500 to-orange-600' },
    QB: { label: 'QB', full: 'Quarterback', color: 'from-purple-500 to-pink-600' },
    FLEX: { label: 'FLEX', full: 'Flex (RB/WR/TE)', color: 'from-blue-600 to-emerald-600' },
    K: { label: 'K', full: 'Kicker', color: 'from-teal-500 to-cyan-600' },
    DEF: { label: 'DEF', full: 'Defense', color: 'from-slate-600 to-slate-700' },
  };

  return (
    <div className="w-full max-w-sm mb-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-xl backdrop-blur-md">
      {/* Header Summary & Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/20">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </span>
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <span>Willing to Trade For:</span>
              <span className="text-emerald-400 font-bold">
                {isAllSelected ? 'Any Position' : `${selectedPositions.length} Selected`}
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              {availableCount} player{availableCount === 1 ? '' : 's'} matching in deck
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-bold text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition flex items-center gap-1"
        >
          <span className="text-[11px]">{isExpanded ? 'Less' : 'Customize'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Position Toggle Pills */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {ALL_POSITIONS.map((pos) => {
          const isSelected = selectedPositions.includes(pos);
          const meta = positionLabels[pos] || { label: pos, color: 'from-blue-600 to-indigo-600' };

          return (
            <button
              key={pos}
              onClick={() => onTogglePosition(pos)}
              className={`flex-1 min-w-[44px] py-1.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 border ${
                isSelected
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/40 scale-[1.02]'
                  : 'bg-slate-950/70 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
              }`}
              title={`Toggle ${meta.full}`}
            >
              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              <span>{pos}</span>
            </button>
          );
        })}
      </div>

      {/* Expanded Quick Presets */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 animate-in fade-in duration-150">
          <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">
            Quick Filter Presets
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <button
              onClick={onSelectAll}
              className={`py-1 px-2 rounded-lg font-semibold border transition text-center ${
                isAllSelected
                  ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All Positions
            </button>

            <button
              onClick={() => onSelectPreset(['RB', 'WR', 'TE'])}
              className="py-1 px-2 rounded-lg font-semibold bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition text-center"
            >
              Flex (RB/WR/TE)
            </button>

            <button
              onClick={() => onSelectPreset(['RB', 'WR'])}
              className="py-1 px-2 rounded-lg font-semibold bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition text-center"
            >
              Skill (RB/WR)
            </button>
          </div>

          {offeredPlayerPosition && (
            <div className="mt-2 flex justify-between items-center text-[10px] text-slate-400">
              <span>Shopping a <strong className="text-blue-400">{offeredPlayerPosition}</strong>?</span>
              <button
                onClick={() => {
                  const complementary = ALL_POSITIONS.filter((p) => p !== offeredPlayerPosition);
                  onSelectPreset(complementary);
                }}
                className="text-blue-400 hover:underline font-bold"
              >
                Exclude {offeredPlayerPosition}s
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
