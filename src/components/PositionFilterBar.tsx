'use client';

import React, { useState, useMemo } from 'react';
import { Position, Team } from '@/types/fantasy';
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
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'teams'>('positions');
  const [isExpanded, setIsExpanded] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  const handleSelectAll = onSelectAllPositions || onSelectAll || (() => {});
  const handleSelectPreset = onSelectPresetPositions || onSelectPreset || (() => {});

  const isAllSelected = selectedPositions.length === ALL_POSITIONS.length;
  const hasTeams = teams && teams.length > 0;
  const excludedCount = excludedTeamIds.length;
  const includedCount = Math.max(0, teams.length - excludedCount);

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
    <div className="w-full max-w-sm mb-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-xl backdrop-blur-md">
      {/* Sub-Tabs: Positions vs Trade With */}
      {hasTeams && (
        <div className="flex items-center gap-1 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl mb-3">
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
      {/* TAB 1: POSITIONS FILTER */}
      {/* ========================================================= */}
      {activeTab === 'positions' && (
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
      )}

      {/* ========================================================= */}
      {/* TAB 2: TRADE WITH (TEAMS & OWNERS) FILTER */}
      {/* ========================================================= */}
      {activeTab === 'teams' && hasTeams && (
        <div className="animate-in fade-in duration-150">
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
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
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
              onClick={() => setActiveTab('positions')}
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
