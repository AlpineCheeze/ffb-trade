'use client';

import React from 'react';
import { Player, Team, TradeType } from '@/types/fantasy';
import { Sparkles, ArrowRight, CheckCircle2, Layers, AlertCircle, ChevronDown } from 'lucide-react';

interface ShoppingRosterProps {
  userTeam: Team;
  tradeType: TradeType;
  selectedPlayerIds: string[];
  onTradeTypeChange: (type: TradeType) => void;
  onTogglePlayer: (player: Player) => void;
  onDoneShopping: () => void;
}

export const ShoppingRoster: React.FC<ShoppingRosterProps> = ({
  userTeam,
  tradeType,
  selectedPlayerIds,
  onTradeTypeChange,
  onTogglePlayer,
  onDoneShopping,
}) => {
  const [sendStr, getStr] = tradeType.split('-for-');
  const sendCount = parseInt(sendStr, 10) || 1;
  const getCount = parseInt(getStr, 10) || 1;
  const requiredCount = sendCount;
  const isSelectionComplete = selectedPlayerIds.length === requiredCount;

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
            Configure the structure and select {requiredCount === 1 ? '1 player' : `up to ${requiredCount} players`} from <span className="text-blue-400 font-semibold">{userTeam.name}</span>.
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
                className="w-full bg-slate-900 hover:bg-slate-850 text-white font-bold text-sm rounded-xl px-3.5 py-2.5 border border-slate-700/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none cursor-pointer transition shadow-inner"
              >
                <option value={1}>1 Player</option>
                <option value={2}>2 Players</option>
                <option value={3}>3 Players</option>
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
                className="w-full bg-slate-900 hover:bg-slate-850 text-white font-bold text-sm rounded-xl px-3.5 py-2.5 border border-slate-700/80 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none appearance-none cursor-pointer transition shadow-inner"
              >
                <option value={1}>1 Player</option>
                <option value={2}>2 Players</option>
                <option value={3}>3 Players</option>
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

      {/* Selection Status Prompt */}
      <div className="flex items-center justify-between mb-3 px-1 text-xs">
        <span className="font-bold text-white flex items-center gap-1.5">
          <span>Select Players to Offer:</span>
          <span className={isSelectionComplete ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
            ({selectedPlayerIds.length} / {requiredCount} Selected)
          </span>
        </span>
        {!isSelectionComplete && (
          <span className="text-[11px] text-amber-400/90 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Select {requiredCount - selectedPlayerIds.length} more player{requiredCount - selectedPlayerIds.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Roster Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
        {userTeam.roster.map((player) => {
          const isSelected = selectedPlayerIds.includes(player.id);
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
              {/* Active Indicator Badge */}
              {isSelected && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-blue-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow">
                  <CheckCircle2 className="w-3 h-3" />
                  In Package
                </div>
              )}

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
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-1">
                  <span>Bye {player.byeWeek}</span>
                  {player.injuryStatus !== 'ACTIVE' && (
                    <>
                      <span>•</span>
                      <span className="text-amber-400 font-bold">{player.injuryStatus}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
