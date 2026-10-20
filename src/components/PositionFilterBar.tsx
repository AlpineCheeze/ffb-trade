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
  Minimize2,
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

  // Minimized state control
  isMinimized?: boolean;
  onToggleMinimize?: (minimized: boolean) => void;
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
  isMinimized: propIsMinimized,
  onToggleMinimize,
}) => {
  const [internalMinimized, setInternalMinimized] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pasta_loft_package_minimized');
        if (stored !== null) return stored === 'true';
      } catch (e) {
        // ignore storage errors
      }
    }
    return false;
  });

  const isMinimized = propIsMinimized !== undefined ? propIsMinimized : internalMinimized;

  const handleToggleMinimize = (nextMinimized?: boolean) => {
    const nextVal = typeof nextMinimized === 'boolean' ? nextMinimized : !isMinimized;
    if (onToggleMinimize) {
      onToggleMinimize(nextVal);
    }
    setInternalMinimized(nextVal);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('pasta_loft_package_minimized', String(nextVal));
      } catch (e) {
        // ignore quota errors
      }
    }
  };

  const [activeTab, setActiveTab] = useState<'package' | 'positions' | 'teams'>('positions');
  const [mobileOpenPanel, setMobileOpenPanel] = useState<'package' | 'positions' | 'teams' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [rosterPosFilter, setRosterPosFilter] = useState<'All' | 'QB' | 'RB' | 'WR' | 'TE'>('All');

  const handleSelectAll = onSelectAllPositions || onSelectAll || (() => {});
  const handleSelectPreset = onSelectPresetPositions || onSelectPreset || (() => {});

  const isAllSelected =
    selectedPositions.length >= ALL_POSITIONS.length ||
    ALL_POSITIONS.every((p) => selectedPositions.includes(p));
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

  const isPackageOpen = mobileOpenPanel === 'package' || activeTab === 'package';

  const handleTogglePackage = () => {
    if (isPackageOpen) {
      setMobileOpenPanel(null);
      setActiveTab('positions');
    } else {
      toggleMobilePill('package');
    }
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

  return isMinimized ? (
    <div className="w-full max-w-sm sm:max-w-[440px] mb-3 sm:mb-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-xl backdrop-blur-md">
      <div className="w-full flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Clickable summary of active trade package */}
        <button
          type="button"
          onClick={() => handleToggleMinimize(false)}
          className="flex-1 min-w-0 flex items-center gap-2 sm:gap-2.5 text-left p-1 rounded-xl hover:bg-slate-800/60 transition-colors group"
          title="Click to expand trade package & filters"
        >
          {/* Overlapping Player Avatars */}
          <div className="flex items-center -space-x-1.5 flex-shrink-0">
            {offeredPlayers.length > 0 ? (
              offeredPlayers.map((player) => (
                <div
                  key={player.id}
                  className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 overflow-hidden flex-shrink-0 shadow"
                  title={player.fullName}
                >
                  <img
                    src={player.headshotUrl}
                    alt={player.fullName}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-amber-500/40 flex items-center justify-center text-xs text-amber-400 font-bold">
                ?
              </div>
            )}
          </div>

          {/* Package details: "Your Offer:" & Full Player Name & Trade Type */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 leading-tight whitespace-nowrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap flex-shrink-0">
                Your Offer:
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 flex-shrink-0 whitespace-nowrap">
                {tradeType}
              </span>
              {totalIncomingCount > 0 && (
                <span
                  className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5 flex-shrink-0"
                  title={`${totalIncomingCount} incoming trade interest offers`}
                >
                  <Flame className="w-2.5 h-2.5 text-amber-400 fill-amber-400/40" />
                  <span>{totalIncomingCount}</span>
                </span>
              )}
            </div>
            <div className="text-xs font-black text-white truncate mt-0.5 flex items-center gap-1.5">
              <span className="truncate">
                {offeredPlayers.length > 0
                  ? offeredPlayers.map((p) => p.fullName).join(' + ')
                  : 'Select player(s)'}
              </span>
              {offeredPlayers.length === 1 && (
                <span className="px-1 py-0.2 rounded text-[9px] font-black bg-blue-600 text-white flex-shrink-0">
                  {offeredPlayers[0].position}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Change Package & Filters controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              handleToggleMinimize(false);
              handleTogglePackage();
            }}
            className="py-1 px-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 hover:text-white text-xs font-bold transition flex items-center gap-1 shadow-sm"
            title="Change package"
          >
            <span>Change</span>
            <ChevronDown className="w-3 h-3 text-blue-400" />
          </button>
          <button
            type="button"
            onClick={() => handleToggleMinimize(false)}
            className="p-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-1 shadow-sm"
            title="Expand filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="w-full max-w-sm sm:max-w-[440px] mb-3 sm:mb-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl backdrop-blur-md">
      {/* ========================================================= */}
      {/* ALWAYS VISIBLE: "YOUR OFFER" BANNER & "CHANGE PACKAGE"    */}
      {/* (Mobile & Desktop)                                       */}
      {/* ========================================================= */}
      {userTeam && (
        <div className="flex items-center justify-between pb-2 sm:pb-2.5 mb-2 sm:mb-2.5 border-b border-slate-800/80">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            {/* Offered Player Photo(s) */}
            <div className="flex items-center -space-x-1.5 flex-shrink-0">
              {offeredPlayers.length > 0 ? (
                offeredPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 overflow-hidden flex-shrink-0 shadow"
                    title={player.fullName}
                  >
                    <img
                      src={player.headshotUrl}
                      alt={player.fullName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-amber-500/40 flex items-center justify-center text-xs text-amber-400 font-bold">
                  ?
                </div>
              )}
            </div>

            {/* Offer Details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-400 whitespace-nowrap flex-shrink-0">
                  Your Offer:
                </span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 whitespace-nowrap flex-shrink-0">
                  {tradeType}
                </span>
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 whitespace-nowrap flex-shrink-0">
                  ({offeredPlayers.length}/{sendCount})
                </span>
                {totalIncomingCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                    <Flame className="w-2.5 h-2.5 text-amber-400 fill-amber-400/30" />
                    <span>{totalIncomingCount} Incoming</span>
                  </span>
                )}
              </div>

              <div className="text-xs sm:text-sm font-black text-white truncate flex items-center gap-1.5 mt-0.5">
                <span className="truncate">
                  {offeredPlayers.length > 0
                    ? offeredPlayers.map((p) => p.fullName).join(' + ')
                    : 'Select player(s) to offer'}
                </span>
                {offeredPlayers.length === 1 && (
                  <span className="px-1 py-0.2 rounded text-[9px] font-black bg-blue-600 text-white flex-shrink-0">
                    {offeredPlayers[0].position}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Change Package & Minimize Controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2 sm:ml-3">
            <button
              type="button"
              onClick={handleTogglePackage}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1 flex-shrink-0 ${
                isPackageOpen
                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/30 text-blue-300'
              }`}
            >
              <span className="whitespace-nowrap">Change Package</span>
              {isPackageOpen ? (
                <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleToggleMinimize(true)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-1 flex-shrink-0"
              title="Minimize trade package & filters to focus on swiping"
            >
              <Minimize2 className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400 flex-shrink-0" />
              <span className="hidden md:inline whitespace-nowrap">Minimize</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MOBILE FILTER PILLS ROW (< 640px - when panels closed)     */}
      {/* ========================================================= */}
      <div className={`${isPackageOpen || mobileOpenPanel !== null ? 'hidden' : 'flex sm:hidden'} items-center gap-1.5`}>
        <button
          type="button"
          onClick={() => toggleMobilePill('positions')}
          className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-bold border transition flex items-center justify-between gap-1 ${
            mobileOpenPanel === 'positions'
              ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
              : !isAllSelected
              ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
              : 'bg-slate-950/80 border-slate-800 text-slate-300'
          }`}
        >
          <span className="flex items-center gap-1 truncate">
            <SlidersHorizontal className="w-3 h-3 text-blue-400 flex-shrink-0" />
            <span className="truncate">Target: {isAllSelected ? 'All Positions' : selectedPositions.join(', ')}</span>
          </span>
          {mobileOpenPanel === 'positions' ? (
            <ChevronUp className="w-3 h-3 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
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
            <Users className="w-3 h-3 text-blue-400 flex-shrink-0" />
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
      {/* STACKED SUB-TABS: Package vs Positions vs Trade With      */}
      {/* ========================================================= */}
      {hasTeams && (
        <div
          className={`${
            isPackageOpen || mobileOpenPanel !== null ? 'flex' : 'hidden sm:flex'
          } items-center gap-1 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl mb-3`}
        >
          {userTeam && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('package');
                setMobileOpenPanel('package');
              }}
              className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center min-w-0 ${
                activeTab === 'package'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-1 text-[11px] sm:text-xs leading-none">
                <ArrowLeftRight className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="whitespace-nowrap">Package</span>
              </div>
              <span
                className={`mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider leading-none whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'package'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {tradeType}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab('positions');
              setMobileOpenPanel('positions');
            }}
            className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center min-w-0 ${
              activeTab === 'positions'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-1 text-[11px] sm:text-xs leading-none">
              <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="whitespace-nowrap">Positions</span>
            </div>
            <span
              className={`mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider leading-none whitespace-nowrap flex-shrink-0 ${
                activeTab === 'positions'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {isAllSelected ? 'All' : `${selectedPositions.length} Selected`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('teams');
              setMobileOpenPanel('teams');
            }}
            className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center min-w-0 ${
              activeTab === 'teams'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-1 text-[11px] sm:text-xs leading-none">
              <Users className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="whitespace-nowrap">Trade With</span>
            </div>
            {excludedCount > 0 ? (
              <span className="mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none bg-rose-500/20 text-rose-300 border border-rose-500/40 whitespace-nowrap flex-shrink-0">
                {includedCount}/{teams.length}
              </span>
            ) : (
              <span
                className={`mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'teams'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                All {teams.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleToggleMinimize(true)}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center justify-center flex-shrink-0 ml-0.5"
            title="Minimize filters to focus on swiping"
          >
            <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
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
