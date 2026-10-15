'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { createMockLeague, fetchEspnLeague } from '@/lib/espn';
import { getLeagueById, saveLeague, getStoredUserClaim } from '@/lib/leagueStore';
import { checkForMutualMatch, createSeedOpponentSwipes, arraysEqualIgnoreOrder } from '@/lib/matchmaking';
import { recordPackageSwipeEloUpdate } from '@/lib/elo';
import { League, Team, Player, Swipe, Match, Position, TradeType } from '@/types/fantasy';
import { Navbar } from '@/components/Navbar';
import { SwipeCard } from '@/components/SwipeCard';
import { ShoppingRoster } from '@/components/ShoppingRoster';
import { MatchesView } from '@/components/MatchesView';
import { MatchCelebrationModal } from '@/components/MatchCelebrationModal';
import { LeagueSyncModal } from '@/components/LeagueSyncModal';
import { PositionFilterBar, ALL_POSITIONS } from '@/components/PositionFilterBar';
import { HomeHero } from '@/components/HomeHero';
import { LeagueLockerRoom } from '@/components/LeagueLockerRoom';
import { X, Check, RotateCcw, UserCheck, Sparkles } from 'lucide-react';

interface DeckItem {
  id: string;
  ownerTeam: Team;
  players: Player[];
}

export default function Home() {
  const [league, setLeague] = useState<League | null>(null);
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [tradeType, setTradeType] = useState<TradeType>('1-for-1');
  const [selectedOfferedPlayerIds, setSelectedOfferedPlayerIds] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Position[]>(['RB', 'WR', 'TE', 'QB', 'FLEX']);
  const [activeTab, setActiveTab] = useState<'deck' | 'matches' | 'roster' | 'lobby'>('lobby');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Swipes and matches state
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeMatchCelebration, setActiveMatchCelebration] = useState<Match | null>(null);

  // Check URL query parameters on initial mount (e.g. ?leagueId=12345678)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryLeagueId = params.get('leagueId');

      if (queryLeagueId) {
        const found = getLeagueById(queryLeagueId);
        if (found) {
          handleSelectLeague(found);
          setActiveTab('lobby');
          return;
        } else {
          // If a league link was shared with someone who has not cached it yet, fetch from ESPN
          fetchEspnLeague({ leagueId: queryLeagueId })
            .then((fetched) => {
              const saved = saveLeague(fetched);
              handleSelectLeague(saved);
              setActiveTab('lobby');
            })
            .catch(() => {
              // If private or error, user remains on HomeHero to input cookies/search
            });
        }
      }
      // Cold visits with no query parameter will stay on HomeHero (league = null)
    }
  }, []);

  const handleSelectLeague = (selectedLeague: League) => {
    setLeague(selectedLeague);
    setSwipes(createSeedOpponentSwipes(selectedLeague));
    setMatches([]);

    // Check if the current user previously claimed a team on this device
    const storedClaimedTeamId = getStoredUserClaim(selectedLeague.espnLeagueId);
    if (storedClaimedTeamId && selectedLeague.teams.some((t) => t.id === storedClaimedTeamId)) {
      setUserTeamId(storedClaimedTeamId);
      const team = selectedLeague.teams.find((t) => t.id === storedClaimedTeamId);
      if (team && team.roster.length > 0) {
        setSelectedOfferedPlayerIds([team.roster[0].id]);
      }
      return;
    }

    // In demo league, default user to Team 1 ("You (Manager)")
    const isMock = selectedLeague.id === 'league_mock_123' || selectedLeague.espnLeagueId === '12345678';
    if (isMock && selectedLeague.teams.length > 0) {
      const firstTeam = selectedLeague.teams[0];
      setUserTeamId(firstTeam.id);
      if (firstTeam.roster.length > 0) {
        setSelectedOfferedPlayerIds([firstTeam.roster[0].id]);
      }
    } else {
      // In real leagues, let manager pick their team in the Locker Room
      setUserTeamId(null);
      setSelectedOfferedPlayerIds([]);
      setActiveTab('lobby');
    }
  };

  const handleClaimAndEnterDeck = (teamId: string) => {
    setUserTeamId(teamId);
    if (league) {
      const team = league.teams.find((t) => t.id === teamId);
      if (team && team.roster.length > 0) {
        const isTwoRequired = tradeType === '2-for-1' || tradeType === '2-for-2';
        if (isTwoRequired && team.roster.length >= 2) {
          setSelectedOfferedPlayerIds([team.roster[0].id, team.roster[1].id]);
        } else {
          setTradeType('1-for-1');
          setSelectedOfferedPlayerIds([team.roster[0].id]);
        }
      }
    }
    setActiveTab('deck');
  };

  // Current user's team
  const userTeam = useMemo(() => {
    if (!league) return null;
    return league.teams.find((t) => t.id === userTeamId) || null;
  }, [league, userTeamId]);

  // Current players being offered in package
  const offeredPlayers = useMemo(() => {
    if (!userTeam) return [];
    return userTeam.roster.filter((p) => selectedOfferedPlayerIds.includes(p.id));
  }, [userTeam, selectedOfferedPlayerIds]);

  // Handle Trade Type change (adjusting offered player counts)
  const handleTradeTypeChange = (newType: TradeType) => {
    setTradeType(newType);
    if (!userTeam) return;

    const isTwoRequired = newType === '2-for-1' || newType === '2-for-2';
    if (isTwoRequired) {
      if (selectedOfferedPlayerIds.length === 0 && userTeam.roster.length >= 2) {
        setSelectedOfferedPlayerIds([userTeam.roster[0].id, userTeam.roster[1].id]);
      } else if (selectedOfferedPlayerIds.length === 1 && userTeam.roster.length >= 2) {
        const nextPlayer = userTeam.roster.find((p) => p.id !== selectedOfferedPlayerIds[0]);
        if (nextPlayer) {
          setSelectedOfferedPlayerIds([selectedOfferedPlayerIds[0], nextPlayer.id]);
        }
      }
    } else {
      // 1-player offer required
      if (selectedOfferedPlayerIds.length > 1) {
        setSelectedOfferedPlayerIds([selectedOfferedPlayerIds[0]]);
      } else if (selectedOfferedPlayerIds.length === 0 && userTeam.roster.length > 0) {
        setSelectedOfferedPlayerIds([userTeam.roster[0].id]);
      }
    }
  };

  // Toggle player selection in ShoppingRoster
  const handleToggleOfferedPlayer = (player: Player) => {
    const isTwoRequired = tradeType === '2-for-1' || tradeType === '2-for-2';

    if (isTwoRequired) {
      if (selectedOfferedPlayerIds.includes(player.id)) {
        setSelectedOfferedPlayerIds((prev) => prev.filter((id) => id !== player.id));
      } else {
        if (selectedOfferedPlayerIds.length < 2) {
          setSelectedOfferedPlayerIds((prev) => [...prev, player.id]);
        } else {
          // FIFO replace: drop oldest player to allow rotating both positions freely
          setSelectedOfferedPlayerIds([selectedOfferedPlayerIds[1], player.id]);
        }
      }
    } else {
      // Single player select
      setSelectedOfferedPlayerIds([player.id]);
    }
  };

  // Generate swipe deck based on tradeType (1 target or 2 targets)
  const deckItems = useMemo<DeckItem[]>(() => {
    if (!league || !userTeam || offeredPlayers.length === 0) return [];

    const isTargetTwoPlayers = tradeType === '1-for-2' || tradeType === '2-for-2';
    const opponentTeams = league.teams.filter((t) => t.id !== userTeam.id);

    // CRIT-01 FIX: Unique composite key generator using actual offered player IDs
    const generateSwipeKey = (type: TradeType, offeredIds: string[], targetIds: string[]) => {
      const sortedTargets = [...targetIds].sort().join(',');
      const sortedOffered = [...offeredIds].sort().join(',');
      return `${type}|${sortedOffered}|${sortedTargets}`;
    };

    const existingSwipeKeys = new Set(
      swipes
        .filter((s) => s.teamId === userTeam.id && s.tradeType === tradeType)
        .map((s) => generateSwipeKey(s.tradeType, s.offeredPlayerIds, s.targetPlayerIds))
    );

    const items: DeckItem[] = [];

    if (!isTargetTwoPlayers) {
      // SINGLE TARGET (1-for-1 or 2-for-1)
      opponentTeams.forEach((team) => {
        team.roster.forEach((player) => {
          if (!selectedPositions.includes(player.position)) return;
          const key = generateSwipeKey(tradeType, selectedOfferedPlayerIds, [player.id]);
          if (!existingSwipeKeys.has(key)) {
            items.push({
              id: `item_${player.id}`,
              ownerTeam: team,
              players: [player],
            });
          }
        });
      });
    } else {
      // TWO TARGETS IN A PACKAGE (1-for-2 or 2-for-2)
      // Generate pairs from the same opponent team
      opponentTeams.forEach((team) => {
        const roster = team.roster;
        for (let i = 0; i < roster.length; i++) {
          for (let j = i + 1; j < roster.length; j++) {
            const p1 = roster[i];
            const p2 = roster[j];

            // Check if at least one matches target position filter
            const matchesPosition =
              selectedPositions.includes(p1.position) || selectedPositions.includes(p2.position);
            if (!matchesPosition) continue;

            const key = generateSwipeKey(tradeType, selectedOfferedPlayerIds, [p1.id, p2.id]);
            if (!existingSwipeKeys.has(key)) {
              items.push({
                id: `pkg_${team.id}_${p1.id}_${p2.id}`,
                ownerTeam: team,
                players: [p1, p2],
              });
            }
          }
        }
      });
    }

    return items;
  }, [league, userTeam, offeredPlayers, selectedOfferedPlayerIds, tradeType, swipes, selectedPositions]);

  // Current top item to swipe on
  const currentCard = deckItems[0] || null;
  const nextCard = deckItems[1] || null;

  // Handle Swipe (Interested or Pass)
  const handleSwipe = (isInterested: boolean) => {
    if (!currentCard || offeredPlayers.length === 0 || !userTeam || !league) return;

    const targetPlayerIds = currentCard.players.map((p) => p.id);

    const newSwipe: Swipe = {
      id: `swipe_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      teamId: userTeam.id,
      tradeType,
      offeredPlayerIds: selectedOfferedPlayerIds,
      targetPlayerIds,
      targetTeamId: currentCard.ownerTeam.id,
      isInterested,
      createdAt: new Date().toISOString(),
    };

    const updatedSwipes = [...swipes, newSwipe];
    setSwipes(updatedSwipes);

    // Update internal Elo privately in background
    recordPackageSwipeEloUpdate(selectedOfferedPlayerIds, targetPlayerIds, isInterested);

    // Check for mutual match
    if (isInterested) {
      const matchFound = checkForMutualMatch(newSwipe, updatedSwipes, league);
      if (matchFound) {
        setMatches((prev) => [matchFound, ...prev]);
        setActiveMatchCelebration(matchFound);
      }
    }
  };

  // Handle Undo Last Swipe (LOGIC-08 FIX)
  const handleUndo = () => {
    if (selectedOfferedPlayerIds.length === 0 || !userTeam) return;
    const userSwipesForPackage = swipes.filter(
      (s) =>
        s.teamId === userTeam.id &&
        s.tradeType === tradeType &&
        arraysEqualIgnoreOrder(s.offeredPlayerIds, selectedOfferedPlayerIds)
    );

    if (userSwipesForPackage.length === 0) return;

    const lastSwipe = userSwipesForPackage[userSwipesForPackage.length - 1];
    setSwipes((prev) => prev.filter((s) => s.id !== lastSwipe.id));

    // Only revert matches if this specific swipe was an interested swipe
    if (lastSwipe.isInterested) {
      setMatches((prev) =>
        prev.filter(
          (m) =>
            !(
              m.teamAId === lastSwipe.teamId &&
              m.tradeType === lastSwipe.tradeType &&
              m.teamAPlayers.every((p) => lastSwipe.offeredPlayerIds.includes(p.id)) &&
              m.teamBPlayers.every((p) => lastSwipe.targetPlayerIds.includes(p.id))
            )
        )
      );
    }
  };

  const handleSelectAllPositions = () => {
    setSelectedPositions(ALL_POSITIONS);
  };

  const handleTogglePosition = (pos: Position) => {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleSelectPresetPositions = (positions: Position[]) => {
    setSelectedPositions(positions);
  };

  const handleLeagueLoaded = (newLeague: League) => {
    saveLeague(newLeague);
    handleSelectLeague(newLeague);
    setActiveTab('lobby');
  };

  const handleGoHome = () => {
    setLeague(null);
    setUserTeamId(null);
    setSelectedOfferedPlayerIds([]);
    setActiveTab('lobby');
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // If no league is loaded yet, show the Home Hero
  if (!league) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar
          league={null}
          currentTeam={null}
          activeTab="lobby"
          matchCount={0}
          onTabChange={() => {}}
          onGoHome={handleGoHome}
          onOpenSync={() => setIsSyncModalOpen(true)}
        />
        <main className="flex-1 flex flex-col justify-center items-center py-6">
          <HomeHero
            onSelectLeague={(l) => {
              handleSelectLeague(l);
              setActiveTab('lobby');
            }}
            onOpenDemo={() => {
              const demo = getLeagueById('12345678') || createMockLeague();
              handleSelectLeague(demo);
              setActiveTab('lobby');
            }}
          />
        </main>
        {isSyncModalOpen && (
          <LeagueSyncModal
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            onLeagueLoaded={handleLeagueLoaded}
          />
        )}
      </div>
    );
  }

  // If the user hasn't claimed a team in this league yet, show the Locker Room
  if (!userTeam) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar
          league={league}
          currentTeam={null}
          activeTab="lobby"
          matchCount={matches.length}
          onTabChange={setActiveTab}
          onGoHome={handleGoHome}
          onOpenSync={() => setIsSyncModalOpen(true)}
        />
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
          <LeagueLockerRoom
            league={league}
            currentTeamId={userTeamId}
            onEnterDeck={handleClaimAndEnterDeck}
            onSwitchLeague={handleGoHome}
            onUpdateLeague={setLeague}
            onOpenSync={() => setIsSyncModalOpen(true)}
          />
        </main>
        {isSyncModalOpen && (
          <LeagueSyncModal
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            onLeagueLoaded={handleLeagueLoaded}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation */}
      <Navbar
        league={league}
        currentTeam={userTeam}
        activeTab={activeTab}
        matchCount={matches.length}
        onTabChange={setActiveTab}
        onGoHome={handleGoHome}
        onOpenSync={() => setIsSyncModalOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 flex flex-col items-center justify-center">
        {/* TAB 0: LEAGUE LOCKER ROOM (LOBBY & TEAM CLAIMING) */}
        {activeTab === 'lobby' && (
          <LeagueLockerRoom
            league={league}
            currentTeamId={userTeamId}
            onEnterDeck={handleClaimAndEnterDeck}
            onSwitchLeague={handleGoHome}
            onUpdateLeague={setLeague}
            onOpenSync={() => setIsSyncModalOpen(true)}
          />
        )}

        {/* TAB 1: SWIPE DECK */}
        {activeTab === 'deck' && (
          <div className="w-full flex flex-col items-center">
            {/* Active Shopping Package Banner */}
            <div className="w-full max-w-sm mb-3 px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {tradeType === '1-for-1' ? 'Heads Up' : tradeType === '2-for-1' ? 'Twofer' : tradeType} Trade
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    Offering ({offeredPlayers.length})
                  </span>
                </div>

                {/* Offered Players Preview */}
                <div className="flex items-center gap-2">
                  {offeredPlayers.length > 0 ? (
                    offeredPlayers.map((player, idx) => {
                      const surname = player.fullName
                        .replace(/\s+(Jr\.|Sr\.|III|II|IV)$/i, '')
                        .split(' ')
                        .pop();

                      return (
                        <div key={player.id} className="flex items-center gap-1.5">
                          {idx > 0 && <span className="text-xs text-blue-400 font-black">+</span>}
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-blue-500/40 overflow-hidden flex-shrink-0">
                            <img src={player.headshotUrl} alt={player.fullName} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-xs font-bold text-white truncate max-w-[90px]">
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
                onClick={() => setActiveTab('roster')}
                className="ml-3 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-bold text-blue-300 transition flex-shrink-0"
              >
                Change Package
              </button>
            </div>

            {/* Target Positions Filter Bar */}
            <PositionFilterBar
              selectedPositions={selectedPositions}
              onTogglePosition={handleTogglePosition}
              onSelectAll={handleSelectAllPositions}
              onSelectPreset={handleSelectPresetPositions}
              availableCount={deckItems.length}
              offeredPlayerPosition={offeredPlayers[0]?.position}
            />

            {/* The Interactive Card Stack */}
            <div className="card-stack relative mb-6">
              {currentCard ? (
                <AnimatePresence mode="popLayout">
                  {/* Next Card in Stack (Depth preview) */}
                  {nextCard && (
                    <SwipeCard
                      key={nextCard.id}
                      players={nextCard.players}
                      ownerTeam={nextCard.ownerTeam}
                      isFront={false}
                      onSwipe={() => {}}
                    />
                  )}

                  {/* Active Front Card */}
                  <SwipeCard
                    key={currentCard.id}
                    players={currentCard.players}
                    ownerTeam={currentCard.ownerTeam}
                    isFront={true}
                    onSwipe={handleSwipe}
                  />
                </AnimatePresence>
              ) : offeredPlayers.length === 0 ? (
                /* Empty Selection State */
                <div className="w-full h-[540px] rounded-3xl bg-slate-900/70 border border-dashed border-amber-500/30 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-white">No Players on Trade Block</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                    Select 1 or 2 players from your roster that you are willing to shop to league opponents.
                  </p>
                  <button
                    onClick={() => setActiveTab('roster')}
                    className="mt-6 py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition"
                  >
                    Select Players to Shop
                  </button>
                </div>
              ) : (
                /* Cleared Deck State */
                <div className="w-full h-[540px] rounded-3xl bg-slate-900/70 border border-dashed border-slate-800 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
                    <UserCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-white">Deck Cleared!</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                    You have reviewed all available {tradeType} opportunities for your selected positions.
                  </p>

                  <div className="mt-6 flex flex-col gap-2.5 w-full max-w-xs">
                    {selectedPositions.length < ALL_POSITIONS.length && (
                      <button
                        onClick={handleSelectAllPositions}
                        className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
                      >
                        Reset Position Filters (Show All)
                      </button>
                    )}
                    <button
                      onClick={() => setActiveTab('roster')}
                      className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                    >
                      Configure a Different Package
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Floating Control Buttons */}
            {currentCard && (
              <div className="flex items-center gap-6">
                {/* PASS BUTTON */}
                <button
                  onClick={() => handleSwipe(false)}
                  className="w-16 h-16 rounded-full bg-slate-900 border-2 border-rose-500/40 hover:border-rose-500 text-rose-400 hover:text-white hover:bg-rose-600 flex items-center justify-center shadow-xl shadow-rose-950/40 transition-all hover:scale-110 active:scale-95"
                  title="Pass (Swipe Left)"
                >
                  <X className="w-8 h-8 stroke-[2.5]" />
                </button>

                {/* UNDO BUTTON */}
                <button
                  onClick={handleUndo}
                  className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
                  title="Undo Last Swipe"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                {/* WANT BUTTON */}
                <button
                  onClick={() => handleSwipe(true)}
                  className="w-16 h-16 rounded-full bg-slate-900 border-2 border-emerald-500/40 hover:border-emerald-500 text-emerald-400 hover:text-white hover:bg-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-950/40 transition-all hover:scale-110 active:scale-95"
                  title="Want / Interested (Swipe Right)"
                >
                  <Check className="w-8 h-8 stroke-[3]" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CONFIRMED MATCHES */}
        {activeTab === 'matches' && (
          <div className="w-full">
            <MatchesView
              matches={matches}
              currentTeamId={userTeamId}
              onStartSwiping={() => setActiveTab('deck')}
            />
          </div>
        )}

        {/* TAB 3: ROSTER & PACKAGE CONFIGURATOR */}
        {activeTab === 'roster' && (
          <div className="w-full">
            <ShoppingRoster
              userTeam={userTeam}
              tradeType={tradeType}
              selectedPlayerIds={selectedOfferedPlayerIds}
              onTradeTypeChange={handleTradeTypeChange}
              onTogglePlayer={handleToggleOfferedPlayer}
              onDoneShopping={() => setActiveTab('deck')}
            />
          </div>
        )}
      </main>

      {/* Match Celebration Modal */}
      <MatchCelebrationModal
        match={activeMatchCelebration}
        currentTeamId={userTeamId}
        onClose={() => setActiveMatchCelebration(null)}
        onViewMatches={() => {
          setActiveMatchCelebration(null);
          setActiveTab('matches');
        }}
      />

      {/* League Sync Modal */}
      <LeagueSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onLeagueLoaded={handleLeagueLoaded}
      />
    </div>
  );
}
