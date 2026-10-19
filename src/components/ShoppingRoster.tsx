'use client';

import React, { useState, useMemo } from 'react';
import { Player, Position, Team, TradeType, IncomingActivityHints } from '@/types/fantasy';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Layers,
  AlertCircle,
  ChevronDown,
  Zap,
  TrendingUp,
  Flame,
} from 'lucide-react';

interface ShoppingRosterProps {
  userTeam: Team;
  tradeType: TradeType;
  selectedPlayerIds: string[];
  onTradeTypeChange: (type: TradeType) => void;
  onTogglePlayer: (player: Player) => void;
  onDoneShopping: () => void;
  incomingActivityHints?: IncomingActivityHints;
}

const ROSTER_FILTER_POSITIONS: Array<'All' | Position> = ['All', 'QB', 'RB', 'WR', 'TE'];

export const ShoppingRoster: React.FC<ShoppingRosterProps> = ({
  userTeam,
  tradeType,
  selectedPlayerIds,
  onTradeTypeChange,
  onTogglePlayer,
  onDoneShopping,
  incomingActivityHints,
}) => {
  const [rosterPositionFilter, setRosterPositionFilter] = useState<'All' | Position>('All');

  const [sendStr, getStr] = tradeType.split('-for-');
  const sendCount = parseInt(sendStr, 10) || 1;
  const getCount = parseInt(getStr, 10) || 1;
  const requiredCount = sendCount;
  const isSelectionComplete = selectedPlayerIds.length === requiredCount;

  const targetedPlayerIdSet = useMemo(
    () => new Set(incomingActivityHints?.targetedPlayerIds || []),
    [incomingActivityHints?.targetedPlayerIds]
  );

  const interestedTradeTypes = useMemo(
    () => incomingActivityHints?.interestedTradeTypes || [],
    [incomingActivityHints?.interestedTradeTypes]
  );

  const filteredRoster = useMemo(() => {
    if (rosterPositionFilter === 'All') return userTeam.roster;
    return userTeam.roster.filter((p) => p.position === rosterPositionFilter);
  }, [userTeam.roster, rosterPositionFilter]);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black text-white">Your Trade Package Block</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure the structure and select {requiredCount === 1 ? '1 player' : `${requiredCount} players`} from <span className="text-blue-400 font-semibold">{userTeam.name}</span>.
          </p>
        </div>

        <button
          onClick={onDoneShopping}
          disabled={!isSelectionComplete}
          className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all hover:scale-105 active:scale-95 flex-shrink-0"
        >
          <span>Start Swiping</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Blind-Safe Incoming Activity Hints Banner */}
      {interestedTradeTypes.length > 0 && (
        <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <Flame className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>🔥 Incoming league interest detected! Try shopping these structures:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {interestedTradeTypes.map((tType) => {
              const isCurrent = tType === tradeType;
              return (
                <button
                  key={tType}
                  type="button"
                  onClick={() => onTradeTypeChange(tType)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase transition flex items-center gap-1 border ${
                    isCurrent
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                      : 'bg-slate-900/90 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
                  }`}
                >
                  <span>🔥 Incoming {tType} interest</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Trade Structure Selector */}
      <div className="mb-6 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            Trade Package Structure:
          </span>
          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
            Send {sendCount} • Get {getCount}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Send Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="send-count-select" className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-400">
                <ArrowRight className="w-3.5 h-3.5 -rotate-45" />
                Send (Your Roster)
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                {sendCount === 1 ? '1 Player' : `${sendCount} Players`}
              </span>
            </label>
            <div className="relative">
              <select
                id="send-count-select"
                aria-label="Send players"
                value={sendCount}
                onChange={(e) => {
                  const newSend = Number(e.target.value);
                  onTradeTypeChange(`${newSend}-for-${getCount}` as TradeType);
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl px-3.5 py-2.5 border border-slate-700/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none cursor-pointer transition shadow-inner"
              >
                <option value={1} className="bg-slate-900 text-white">1 Player</option>
                <option value={2} className="bg-slate-900 text-white">2 Players</option>
                <option value={3} className="bg-slate-900 text-white">3 Players</option>
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Get Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="get-count-select" className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ArrowRight className="w-3.5 h-3.5 rotate-[135deg]" />
                Get (Opponent Target)
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                {getCount === 1 ? '1 Player' : `${getCount} Players`}
              </span>
            </label>
            <div className="relative">
              <select
                id="get-count-select"
                aria-label="Get players"
                value={getCount}
                onChange={(e) => {
                  const newGet = Number(e.target.value);
                  onTradeTypeChange(`${sendCount}-for-${newGet}` as TradeType);
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl px-3.5 py-2.5 border border-slate-700/80 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none cursor-pointer transition shadow-inner"
              >
                <option value={1} className="bg-slate-900 text-white">1 Player</option>
                <option value={2} className="bg-slate-900 text-white">2 Players</option>
                <option value={3} className="bg-slate-900 text-white">3 Players</option>
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mt-3">
          Offer {sendCount} player{sendCount > 1 ? 's' : ''} from your roster in exchange for {getCount} opponent player{getCount > 1 ? 's' : ''} in the swiping deck.
        </p>
      </div>

      {/* Selection Status Prompt & Position Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 px-1">
        <div className="flex items-center justify-between sm:justify-start gap-2 text-xs">
          <span className="font-bold text-white flex items-center gap-1.5">
            <span>Select Players to Offer:</span>
            <span className={isSelectionComplete ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              ({selectedPlayerIds.length} / {requiredCount} Selected)
            </span>
          </span>
          {!isSelectionComplete && (
            <span className="text-[11px] text-amber-400/90 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Select {requiredCount - selectedPlayerIds.length} more
            </span>
          )}
        </div>

        {/* Position Filter Pills (All, QB, RB, WR, TE) */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 self-start sm:self-auto">
          {ROSTER_FILTER_POSITIONS.map((pos) => {
            const isActive = rosterPositionFilter === pos;
            return (
              <button
                key={pos}
                type="button"
                onClick={() => setRosterPositionFilter(pos)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                {pos}
              </button>
            );
          })}
        </div>
      </div>

      {/* Roster Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
        {filteredRoster.map((player) => {
          const isSelected = selectedPlayerIds.includes(player.id);
          const isInDemand = targetedPlayerIdSet.has(player.id);
          return (
            <div
              key={player.id}
              onClick={() => onTogglePlayer(player)}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center gap-3.5 relative overflow-hidden ${
                isSelected
                  ? 'bg-blue-950/70 border-blue-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500 scale-[1.01]'
                  : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800/90 hover:border-slate-700'
              }`}
            >
              {/* Active / In-Demand Indicator Badges */}
              <div className="absolute top-2 right-2 flex items-center gap-1">
                {isInDemand && (
                  <span
                    className="flex items-center gap-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shadow"
                    title="One or more league managers have swiped Want on packages featuring this player"
                  >
                    🔥 In demand
                  </span>
                )}
                {isSelected && (
                  <div className="flex items-center gap-1 bg-blue-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow">
                    <CheckCircle2 className="w-3 h-3" />
                    In Package
                  </div>
                )}
              </div>

              {/* Player Image */}
              <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                <img
                  src={player.headshotUrl}
                  alt={player.fullName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              {/* Player Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-600 text-white">
                    {player.position}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold truncate">
                    {player.nflTeam}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white truncate mt-0.5">
                  {player.fullName}
                </h3>
                <div className="text-[11px] text-slate-400 flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                  <span className="inline-flex items-center gap-0.5 text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md text-[10px]">
                    <Zap className="w-2.5 h-2.5 text-amber-400" />
                    Proj {player.projectedPoints.toFixed(1)}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md text-[10px]">
                    <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                    Avg {player.seasonAvgPoints.toFixed(1)}
                  </span>
                  <span>Bye {player.byeWeek}</span>
                  {player.injuryStatus !== 'ACTIVE' && (
                    <span className="text-amber-400 font-bold">• {player.injuryStatus}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredRoster.length === 0 && (
          <div className="col-span-full py-8 text-center text-xs text-slate-400 bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl">
            No {rosterPositionFilter} players on your roster.
          </div>
        )}
      </div>

      {/* Bottom Action Bar for Mobile & Easy Access */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
        <button
          onClick={onDoneShopping}
          disabled={!isSelectionComplete}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all hover:scale-105 active:scale-95 touch-manipulation"
        >
          <span>Start Swiping</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
