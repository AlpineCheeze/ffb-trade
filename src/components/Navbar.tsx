'use client';

import React from 'react';
import { League, Team, UserAccount } from '@/types/fantasy';
import { Layers, ArrowLeftRight, Users, RefreshCw, LayoutGrid, Home, LogOut, UserPlus, RotateCcw, Crown } from 'lucide-react';
import { UnicornLogo } from './UnicornLogo';

interface NavbarProps {
  league: League | null;
  currentTeam?: Team | null;
  activeTab: 'deck' | 'matches' | 'roster' | 'lobby';
  matchCount: number;
  currentUser?: UserAccount | null;
  onTabChange: (tab: 'deck' | 'matches' | 'roster' | 'lobby') => void;
  onGoHome: () => void;
  onOpenSync: () => void;
  onOpenAuth?: () => void;
  onLogout?: () => void;
  onOpenResetSwipes?: () => void;
  onOpenSuperUser?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  league,
  currentTeam,
  activeTab,
  matchCount,
  currentUser,
  onTabChange,
  onGoHome,
  onOpenSync,
  onOpenAuth,
  onLogout,
  onOpenResetSwipes,
  onOpenSuperUser,
}) => {
  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-slate-950/80 backdrop-blur-lg border-b border-slate-800 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Brand / Logo & Home Link */}
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 flex-1 mr-2" onClick={onGoHome}>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 flex-shrink-0">
              <UnicornLogo className="w-6 h-6 fill-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black text-lg sm:text-xl tracking-tight text-white truncate">Trade Horny</span>
                {currentTeam && (
                  <span className="hidden min-[380px]:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 truncate max-w-[90px] sm:max-w-[120px] flex-shrink-0">
                    {currentTeam.name}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[150px] sm:max-w-xs">
                {league ? league.name : 'Fantasy Football Trade Matchmaker'}
              </div>
            </div>
          </div>

          {/* Center Navigation Tabs - Only visible on desktop when inside a league and logged in */}
          {league && currentUser && (
            <nav className="hidden sm:flex items-center gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800">
              <button
                onClick={() => onTabChange('lobby')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  activeTab === 'lobby'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="League Locker Room"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden md:inline">Locker Room</span>
              </button>

              <button
                onClick={() => onTabChange('deck')}
                className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  activeTab === 'deck'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">Trade Deck</span>
              </button>

              <button
                onClick={() => onTabChange('matches')}
                className={`relative px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  activeTab === 'matches'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span className="hidden sm:inline">Matches</span>
                {matchCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                    {matchCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => onTabChange('roster')}
                className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  activeTab === 'roster'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">My Roster</span>
              </button>
            </nav>
          )}

          {/* Right Action: Sync ESPN / Switch League / Account */}
          <div className="flex items-center gap-2">
            {league && currentUser && (
              <button
                onClick={onGoHome}
                className="p-2 sm:px-3 sm:py-2 min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition touch-manipulation active:scale-95"
                title="Switch League"
              >
                <Home className="w-4 h-4 text-slate-400" />
                <span className="hidden sm:inline">Leagues</span>
              </button>
            )}

            {league && currentUser && onOpenResetSwipes && (
              <button
                onClick={onOpenResetSwipes}
                className="p-2 sm:px-3 sm:py-2 min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition touch-manipulation active:scale-95"
                title="Reset all league swipes to start fresh"
              >
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span className="hidden md:inline">Reset Swipes</span>
              </button>
            )}

            {currentUser && (
              <button
                onClick={onOpenSync}
                className="p-2 sm:px-3 sm:py-2 min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition touch-manipulation active:scale-95"
                title="Sync ESPN League"
              >
                <RefreshCw className="w-4 h-4 text-blue-400" />
                <span className="hidden sm:inline">Sync ESPN</span>
              </button>
            )}

            {/* Account Status / Login */}
            {currentUser ? (
              <div className="flex items-center gap-1.5 pl-1 border-l border-slate-800">
                {onOpenSuperUser && (currentUser.isSuperUser || currentUser.username.toLowerCase() === 'superu') && (
                  <button
                    type="button"
                    onClick={onOpenSuperUser}
                    className="px-2.5 py-1.5 min-h-[44px] rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition touch-manipulation active:scale-95"
                    title="Open Super User Console"
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                )}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200"
                  title={`Logged in as @${currentUser.username}`}
                >
                  <div className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-[10px] flex items-center justify-center">
                    {currentUser.username.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline font-bold truncate max-w-[100px]">
                    @{currentUser.username}
                  </span>
                </div>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 min-h-[44px] min-w-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 transition touch-manipulation active:scale-95 flex items-center justify-center"
                    title="Log out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 pl-1">
                <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span>Account Required</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Navigation Bar - Only when logged in and inside a league */}
      {league && currentUser && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 pb-[env(safe-area-inset-bottom,0px)] px-2 py-1.5 flex items-center justify-around">
          <button
            onClick={() => onTabChange('lobby')}
            className={`min-h-[44px] min-w-[56px] flex flex-col items-center justify-center py-1 px-3 rounded-xl transition touch-manipulation active:scale-95 ${
              activeTab === 'lobby' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Locker</span>
          </button>

          <button
            onClick={() => onTabChange('deck')}
            className={`min-h-[44px] min-w-[56px] flex flex-col items-center justify-center py-1 px-3 rounded-xl transition touch-manipulation active:scale-95 ${
              activeTab === 'deck' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Deck</span>
          </button>

          <button
            onClick={() => onTabChange('matches')}
            className={`min-h-[44px] min-w-[56px] relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition touch-manipulation active:scale-95 ${
              activeTab === 'matches' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <ArrowLeftRight className="w-5 h-5 mb-0.5" />
              {matchCount > 0 && (
                <span className="absolute -top-1 -right-2.5 px-1 py-0.2 rounded-full text-[9px] font-black bg-emerald-500 text-slate-950 min-w-[14px] text-center">
                  {matchCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Matches</span>
          </button>

          <button
            onClick={() => onTabChange('roster')}
            className={`min-h-[44px] min-w-[56px] flex flex-col items-center justify-center py-1 px-3 rounded-xl transition touch-manipulation active:scale-95 ${
              activeTab === 'roster' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Roster</span>
          </button>
        </nav>
      )}
    </>
  );
};
