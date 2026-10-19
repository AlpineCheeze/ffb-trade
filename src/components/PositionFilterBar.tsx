'use client';

import React, { useState, useMemo } from 'react';
import { Position, Team, TradeType, Player, IncomingActivityHints } from '@/types/fantasy';
import {
  Check,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Users,
  UserCheck,
  UserX,
  Search,
  RotateCcw,
  ArrowLeftRight,
  Flame,
} from 'lucide-react';

export const ALL_POSITIONS: Position[] = ['RB', 'WR', 'TE', 'QB', 'FLEX', 'K', 'DEF'];

export interface PositionFilterBarProps {
  // Target position filters
  selectedPositions: Position[];
  onTogglePosition: (pos: Position) => void;
  onSelectAll?: () => void;
  onSelectAllPositions?: () => void;
  onSelectPreset?: (positions: Position[]) => void;
  onSelectPresetPositions?: (positions: Position[]) => void;
  availableCount: number;
  offeredPlayerPosition?: Position;

  // Trade With (Teams & Owners) filters
  teams?: Team[];
  excludedTeamIds?: string[];
  onToggleTeam?: (teamId: string) => void;
  onIncludeAllTeams?: () => void;
  onExcludeAllTeams?: () => void;
  onOnlyTradeWithTeam?: (teamId: string) => void;

  // Inline Package Switcher & Unified Mobile Deck Control Bar props
  userTeam?: Team | null;
  tradeType?: TradeType;
  offeredPlayers?: Player[];
  selectedOfferedPlayerIds?: string[];
  onTradeTypeChange?: (type: TradeType) => void;
  onToggleOfferedPlayer?: (player: Player) => void;
  onOpenFullRoster?: () => void;
  incomingActivityHints?: IncomingActivityHints | null;
}

export const PositionFilterBar: React.FC<PositionFilterBarProps> = ({
  selectedPositions,
  onTogglePosition,
  onSelectAll,
  onSelectAllPositions,
  onSelectPreset,
  onSelectPresetPositions,
  availableCount,
  offeredPlayerPosition,
  teams = [],
  excludedTeamIds = [],
  onToggleTeam,
  onIncludeAllTeams,
  onExcludeAllTeams,
  onOnlyTradeWithTeam,
  userTeam,
  tradeType = '1-for-1',
  offeredPlayers = [],
  selectedOfferedPlayerIds = [],
  onTradeTypeChange,
  onToggleOfferedPlayer,
  onOpenFullRoster,
  incomingActivityHints,
}) => {
  const [activeTab, setActiveTab] = useState<'package' | 'positions' | 'teams'>('positions');
  const [mobileOpenPanel, setMobileOpenPanel] = useState<'package' | 'positions' | 'teams' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [rosterPosFilter, setRosterPosFilter] = useState<'All' | 'QB' | 'RB' | 'WR' | 'TE'>('All');

  const handleSelectAll = onSelectAllPositions || onSelectAll || (() => {});
  const handleSelectPreset = onSelectPresetPositions || onSelectPreset || (() => {});

  const isAllSelected = selectedPositions.length === ALL_POSITIONS.length;
  const hasTeams = teams && teams.length > 0;
  const excludedCount = excludedTeamIds.length;
  const includedCount = Math.max(0, teams.length - excludedCount);

  const sendCount = parseInt(tradeType.split('-for-')[0], 10) || 1;
  const receiveCount = parseInt(tradeType.split('-for-')[1], 10) || 1;

  const interestedTradeTypes = useMemo(
    () => incomingActivityHints?.interestedTradeTypes || [],
    [incomingActivityHints]
  );
  const targetedPlayerIdSet = useMemo(
    () => new Set(incomingActivityHints?.targetedPlayerIds || []),
    [incomingActivityHints]
  );
  const totalIncomingCount = incomingActivityHints?.totalIncomingCount || 0;

  const offeredSummaryNames = useMemo(() => {
    if (!offeredPlayers || offeredPlayers.length === 0) return 'Select Package';
    return offeredPlayers
      .map((p) =>
        p.fullName
          .replace(/\s+(Jr\.|Sr\.|III|II|IV)$/i, '')
          .split(' ')
          .pop()
      )
      .join(' + ');
  }, [offeredPlayers]);

  const filteredInlineRoster = useMemo(() => {
    if (!userTeam?.roster) return [];
    if (rosterPosFilter === 'All') return userTeam.roster;
    return userTeam.roster.filter((p) => p.position === rosterPosFilter);
  }, [userTeam, rosterPosFilter]);

  const toggleMobilePill = (panel: 'package' | 'positions' | 'teams') => {
    if (mobileOpenPanel === panel) {
      setMobileOpenPanel(null);
    } else {
      setMobileOpenPanel(panel);
      setActiveTab(panel);
    }
  };

  const toggleDesktopPackage = () => {
    setActiveTab((prev) => (prev === 'package' ? 'positions' : 'package'));
    setMobileOpenPanel((prev) => (prev === 'package' ? null : 'package'));
  };

  const positionLabels: Record<Position, { label: string; full: string; color: string }> = {
    RB: { label: 'RB', full: 'Running Back', color: 'from-emerald-500 to-green-600' },
    WR: { label: 'WR', full: 'Wide Receiver', color: 'from-blue-500 to-indigo-600' },
    TE: { label: 'TE', full: 'Tight End', color: 'from-amber-500 to-orange-600' },
    QB: { label: 'QB', full: 'Quarterback', color: 'from-purple-500 to-pink-600' },
    FLEX: { label: 'FLEX', full: 'Flex (RB/WR/TE)', color: 'from-blue-600 to-emerald-600' },
    K: { label: 'K', full: 'Kicker', color: 'from-teal-500 to-cyan-600' },
    DEF: { label: 'DEF', full: 'Defense', color: 'from-slate-600 to-slate-700' },
  };

  // Filter teams by search input
  const filteredTeams = useMemo(() => {
    if (!teamSearchQuery.trim()) return teams;
    const q = teamSearchQuery.toLowerCase().trim();
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.ownerName && t.ownerName.toLowerCase().includes(q)) ||
        (t.claimedBy && t.claimedBy.toLowerCase().includes(q))
    );
  }, [teams, teamSearchQuery]);

  // Quick summary of excluded team names
  const excludedTeamNames = useMemo(() => {
    return teams
      .filter((t) => excludedTeamIds.includes(t.id))
      .map((t) => t.claimedBy || t.ownerName || t.name);
  }, [teams, excludedTeamIds]);

  return (
    <div className="w-full max-w-sm mb-3 sm:mb-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl backdrop-blur-md">
      {/* ========================================================= */}
      {/* MOBILE COMPACT UNIFIED DECK CONTROL BAR (< 640px)         */}
      {/* ========================================================= */}
      <div className="flex sm:hidden items-center gap-1.5">
        <button
          type="button"
          onClick={() => toggleMobilePill('package')}
          className={`flex-1 min-w-0 py-1.5 px-2.5 rounded-xl text-[11px] font-bold border transition flex items-center justify-between gap-1 ${
            mobileOpenPanel === 'package'
              ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
              : 'bg-slate-950/80 border-slate-800 text-slate-200 hover:border-slate-700'
          }`}
        >
          <span className="truncate flex items-center gap-1">
            {totalIncomingCount > 0 && (
              <Flame className="w-3 h-3 text-amber-400 fill-amber-400/30 flex-shrink-0" />
            )}
            <span className="text-blue-400 font-black">{tradeType}:</span>
            <span className="truncate">{offeredSummaryNames}</span>
          </span>
          {mobileOpenPanel === 'package' ? (
            <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
          )}
        </button>

        <button
          type="button"
          onClick={() => toggleMobilePill('positions')}
          className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-1 flex-shrink-0 ${
            mobileOpenPanel === 'positions'
              ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
              : !isAllSelected
              ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
              : 'bg-slate-950/80 border-slate-800 text-slate-300'
          }`}
        >
          <span>Pos: {isAllSelected ? 'All' : selectedPositions.length}</span>
          {mobileOpenPanel === 'positions' ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          )}
        </button>

        {hasTeams && (
          <button
            type="button"
            onClick={() => toggleMobilePill('teams')}
            className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-1 flex-shrink-0 ${
              mobileOpenPanel === 'teams'
                ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                : excludedCount > 0
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-300'
            }`}
          >
            <span>
              Teams: {includedCount}/{teams.length}
            </span>
            {mobileOpenPanel === 'teams' ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>
        )}
      </div>

      {/* ========================================================= */}
      {/* DESKTOP ACTIVE SHOPPING PACKAGE BANNER (>= 640px)         */}
      {/* ========================================================= */}
      {userTeam && (
        <div className="hidden sm:flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800/80">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {tradeType} Trade
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                Offering ({offeredPlayers.length}/{sendCount})
              </span>
              {totalIncomingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Flame className="w-2.5 h-2.5 text-amber-400 fill-amber-400/30" />
                  <span>{totalIncomingCount} Incoming</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {offeredPlayers.length > 0 ? (
                offeredPlayers.map((player, idx) => {
                  const surname = player.fullName
                    .replace(/\s+(Jr\.|Sr\.|III|II|IV)$/i, '')
                    .split(' ')
                    .pop();

                  return (
                    <div key={player.id} className="flex items-center gap-1 flex-shrink-0">
                      {idx > 0 && <span className="text-[10px] text-blue-400 font-black">+</span>}
                      <div
                        className={`${
                          offeredPlayers.length >= 3 ? 'w-6 h-6' : 'w-7 h-7'
                        } rounded-full bg-slate-800 border border-blue-500/40 overflow-hidden flex-shrink-0`}
                      >
                        <img
                          src={player.headshotUrl}
                          alt={player.fullName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span
                        className={`font-bold text-white truncate ${
                          offeredPlayers.length >= 3 ? 'text-[11px] max-w-[65px]' : 'text-xs max-w-[90px]'
                        }`}
                      >
                        {surname}
                      </span>
                    </div>
                  );
                })
              ) : (
                <span className="text-xs text-amber-400 font-medium">No players on trade block</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleDesktopPackage}
            className={`ml-3 px-3 py-1.5 rounded-xl border text-xs font-bold transition flex-shrink-0 flex items-center gap-1 ${
              activeTab === 'package'
                ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/30 text-blue-300'
            }`}
          >
            <span>Change Package</span>
            {activeTab === 'package' ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {/* Sub-Tabs on Desktop: Package vs Positions vs Trade With */}
      {hasTeams && (
        <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl mb-3">
          {userTeam && (
            <button
              type="button"
              onClick={() => setActiveTab('package')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                activeTab === 'package'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Package</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeTab === 'package'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tradeType}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('positions')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'positions'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Positions</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'positions'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isAllSelected ? 'All' : selectedPositions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('teams')}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'teams'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Trade With</span>
            {excludedCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                {includedCount}/{teams.length}
              </span>
            ) : (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'teams'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {teams.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 0: INLINE PACKAGE SWITCHER (SEND 1-3 / GET 1-3 + ROSTER) */}
      {/* ========================================================= */}
      {userTeam && (
        <div
          className={`${
            mobileOpenPanel === 'package' ? 'block mt-2.5 pt-2.5 border-t border-slate-800' : 'hidden'
          } ${activeTab === 'package' ? 'sm:block' : 'sm:hidden'} animate-in fade-in duration-150`}
        >
          {/* Send / Get Count Selectors */}
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 flex items-center justify-between">
                <span>You Send</span>
                <span className="text-blue-400">{sendCount}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3].map((num) => (
                  <button
                    key={`inline_send_${num}`}
                    type="button"
                    onClick={() =>
                      onTradeTypeChange && onTradeTypeChange(`${num}-for-${receiveCount}` as TradeType)
                    }
                    className={`py-1 rounded-lg text-xs font-black transition border ${
                      sendCount === num
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 flex items-center justify-between">
                <span>You Get</span>
                <span className="text-emerald-400">{receiveCount}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3].map((num) => (
                  <button
                    key={`inline_get_${num}`}
                    type="button"
                    onClick={() =>
                      onTradeTypeChange && onTradeTypeChange(`${sendCount}-for-${num}` as TradeType)
                    }
                    className={`py-1 rounded-lg text-xs font-black transition border ${
                      receiveCount === num
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Incoming Activity Hint Pills */}
          {interestedTradeTypes.length > 0 && (
            <div className="mb-2.5 flex items-center gap-1.5 flex-wrap">
              {interestedTradeTypes.map((tType) => (
                <button
                  key={`inline_hint_${tType}`}
                  type="button"
                  onClick={() => onTradeTypeChange && onTradeTypeChange(tType)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${
                    tradeType === tType
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                  }`}
                >
                  <Flame className="w-2.5 h-2.5 text-amber-400 fill-amber-400/30" />
                  <span>🔥 Incoming {tType} interest</span>
                </button>
              ))}
            </div>
          )}

          {/* Inline Roster Position Filter Pills */}
          <div className="flex items-center justify-between gap-1 mb-2">
            <div className="flex items-center gap-1">
              {(['All', 'QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
                <button
                  key={`inline_roster_pos_${pos}`}
                  type="button"
                  onClick={() => setRosterPosFilter(pos)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${
                    rosterPosFilter === pos
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            {onOpenFullRoster && (
              <button
                type="button"
                onClick={onOpenFullRoster}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 underline"
              >
                Full Trade Block →
              </button>
            )}
          </div>

          {/* Compact Roster Selection List */}
          <div className="max-h-48 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
            {filteredInlineRoster.map((player) => {
              const isSelected = selectedOfferedPlayerIds.includes(player.id);
              const isTargeted = targetedPlayerIdSet.has(player.id);

              return (
                <button
                  key={`inline_player_${player.id}`}
                  type="button"
                  onClick={() => onToggleOfferedPlayer && onToggleOfferedPlayer(player)}
                  className={`w-full p-2 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-950/70 border-slate-800/90 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 border ${
                        isSelected
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-slate-900 border-slate-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="text-xs font-bold truncate">{player.fullName}</span>
                    <span className="text-[10px] font-semibold text-blue-400 flex-shrink-0">
                      {player.position} • {player.nflTeam}
                    </span>
                    {isTargeted && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0">
                        <Flame className="w-2.5 h-2.5 text-amber-400" />
                        <span>Wanted</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold flex-shrink-0">
                    {player.projectedPoints.toFixed(1)} proj
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: POSITIONS FILTER */}
      {/* ========================================================= */}
      <div
        className={`${
          mobileOpenPanel === 'positions' ? 'block mt-2.5 pt-2.5 border-t border-slate-800' : 'hidden'
        } ${activeTab === 'positions' ? 'sm:block' : 'sm:hidden'}`}
      >
        <div>
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
                  {availableCount} trade asset{availableCount === 1 ? '' : 's'} in deck
                </div>
              </div>
            </div>

            <button
              type="button"
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
                  type="button"
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
                  type="button"
                  onClick={handleSelectAll}
                  className={`py-1 px-2 rounded-lg font-semibold border transition text-center ${
                    isAllSelected
                      ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Positions
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset(['RB', 'WR', 'TE'])}
                  className="py-1 px-2 rounded-lg font-semibold bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition text-center"
                >
                  Flex (RB/WR/TE)
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset(['RB', 'WR'])}
                  className="py-1 px-2 rounded-lg font-semibold bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition text-center"
                >
                  Skill (RB/WR)
                </button>
              </div>

              {offeredPlayerPosition && (
                <div className="mt-2 flex justify-between items-center text-[10px] text-slate-400">
                  <span>Shopping a <strong className="text-blue-400">{offeredPlayerPosition}</strong>?</span>
                  <button
                    type="button"
                    onClick={() => {
                      const complementary = ALL_POSITIONS.filter((p) => p !== offeredPlayerPosition);
                      handleSelectPreset(complementary);
                    }}
                    className="text-blue-400 hover:underline font-bold"
                  >
                    Exclude {offeredPlayerPosition}s
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick Trade With Indicator Footer */}
          {hasTeams && (
            <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
              {excludedCount === 0 ? (
                <>
                  <span className="text-slate-400">
                    Trade Partners: <strong className="text-emerald-400 font-bold">All {teams.length} Opponents Included</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('teams')}
                    className="text-blue-400 hover:text-blue-300 hover:underline font-bold text-[10px] flex items-center gap-0.5"
                  >
                    <span>Filter Teams</span>
                    <span>→</span>
                  </button>
                </>
              ) : (
                <div className="w-full flex items-center justify-between bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl">
                  <span className="text-amber-300 font-medium text-[11px] truncate flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span>
                      {excludedCount} opponent{excludedCount > 1 ? 's' : ''} excluded ({includedCount} active)
                    </span>
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {onIncludeAllTeams && (
                      <button
                        type="button"
                        onClick={onIncludeAllTeams}
                        className="text-[10px] text-amber-300 hover:text-white underline font-bold"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTab('teams')}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-bold"
                    >
                      Edit →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 2: TRADE WITH (TEAMS & OWNERS) FILTER */}
      {/* ========================================================= */}
      {hasTeams && (
        <div
          className={`${
            mobileOpenPanel === 'teams' ? 'block mt-2.5 pt-2.5 border-t border-slate-800' : 'hidden'
          } ${activeTab === 'teams' ? 'sm:block' : 'sm:hidden'} animate-in fade-in duration-150`}
        >
          {/* Header Summary & Actions */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/20">
                <Users className="w-3.5 h-3.5" />
              </span>
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <span>Trading With:</span>
                  <span className={excludedCount === 0 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {includedCount} of {teams.length} Teams
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {availableCount} trade asset{availableCount === 1 ? '' : 's'} available
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {onIncludeAllTeams && (
                <button
                  type="button"
                  onClick={onIncludeAllTeams}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                  title="Select all teams"
                >
                  All
                </button>
              )}
              {onExcludeAllTeams && (
                <button
                  type="button"
                  onClick={onExcludeAllTeams}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
                  title="Exclude all teams"
                >
                  None
                </button>
              )}
            </div>
          </div>

          {/* Search Bar (if 4+ teams) */}
          {teams.length >= 4 && (
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                placeholder="Search team or owner..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
              {teamSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTeamSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Excluded Owners Alert Banner */}
          {excludedCount > 0 && (
            <div className="mb-2 p-2 rounded-xl bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300 flex items-center justify-between gap-2">
              <span className="truncate">
                Excluded: <strong className="font-bold">{excludedTeamNames.slice(0, 2).join(', ')}{excludedTeamNames.length > 2 ? ` +${excludedTeamNames.length - 2} more` : ''}</strong>
              </span>
              {onIncludeAllTeams && (
                <button
                  type="button"
                  onClick={onIncludeAllTeams}
                  className="text-[10px] font-bold text-rose-400 hover:text-white underline flex-shrink-0 flex items-center gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset All</span>
                </button>
              )}
            </div>
          )}

          {/* Scrollable Teams List */}
          <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
            {filteredTeams.map((team) => {
              const isExcluded = excludedTeamIds.includes(team.id);
              const isIncluded = !isExcluded;
              const ownerDisplay = team.claimedBy || team.ownerName || 'Manager';

              return (
                <div
                  key={team.id}
                  className={`w-full p-2 rounded-xl border transition-all flex items-center justify-between gap-2 text-left ${
                    isIncluded
                      ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      : 'bg-rose-950/20 border-rose-900/40 opacity-75'
                  }`}
                >
                  {/* Click to Toggle Checkbox / Name */}
                  <button
                    type="button"
                    onClick={() => onToggleTeam && onToggleTeam(team.id)}
                    className="flex-1 min-w-0 flex items-center gap-2.5"
                  >
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center text-xs font-bold transition flex-shrink-0 border ${
                        isIncluded
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'
                      }`}
                    >
                      {isIncluded ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <X className="w-3.5 h-3.5 text-rose-400 stroke-[3]" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold truncate ${
                            isIncluded ? 'text-white' : 'text-slate-400 line-through'
                          }`}
                        >
                          {team.name}
                        </span>
                        {team.isClaimed && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Claimed
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        Owner: <span className={isIncluded ? 'text-blue-400 font-semibold' : 'text-rose-400/70'}>{ownerDisplay}</span>
                        {team.roster && <span className="text-slate-500 ml-1.5">({team.roster.length} players)</span>}
                      </div>
                    </div>
                  </button>

                  {/* Actions: "Only" trade with this team / Toggle */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {onOnlyTradeWithTeam && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOnlyTradeWithTeam(team.id);
                        }}
                        className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white border border-slate-700/80 hover:border-blue-500 transition"
                        title={`Trade exclusively with ${ownerDisplay} (excludes all other teams)`}
                      >
                        Only
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onToggleTeam && onToggleTeam(team.id)}
                      className={`py-1 px-2 rounded-lg text-[10px] font-black uppercase transition border ${
                        isIncluded
                          ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10'
                          : 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300'
                      }`}
                    >
                      {isIncluded ? 'Exclude' : 'Include'}
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredTeams.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-500">
                No teams found matching &quot;{teamSearchQuery}&quot;
              </div>
            )}
          </div>

          {/* Quick Return to Positions button */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {excludedCount === 0 ? (
                <span className="text-emerald-400 font-semibold">All teams eligible to match</span>
              ) : (
                <span className="text-amber-400 font-semibold">{excludedCount} team{excludedCount > 1 ? 's' : ''} filtered out</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setActiveTab('positions');
                setMobileOpenPanel('positions');
              }}
              className="text-blue-400 hover:text-blue-300 font-bold text-[10px]"
            >
              Back to Positions →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const DeckFilterBar = PositionFilterBar;
