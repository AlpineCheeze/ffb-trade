'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { createMockLeague, fetchEspnLeague } from '@/lib/espn';
import {
  getLeagueById,
  saveLeague,
  getStoredUserClaim,
  getLocalSwipes,
  saveLocalSwipes,
  getLocalMatches,
  saveLocalMatches,
  getLocalDeletedMatches,
  saveLocalDeletedMatches,
  getLocalExcludedTeamIds,
  saveLocalExcludedTeamIds,
  syncLeagueStateWithServer,
  recordSwipeOnServer,
  undoSwipeOnServer,
  deleteMatchOnServer,
  deleteAllMatchesOnServer,
} from '@/lib/leagueStore';
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
import { X, Check, RotateCcw, UserCheck, Sparkles, UserX, Users } from 'lucide-react';

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
  const [deletedMatches, setDeletedMatches] = useState<Match[]>([]);
  const [activeMatchCelebration, setActiveMatchCelebration] = useState<Match | null>(null);

  // Excluded opponent teams in trade deck filter
  const [excludedTeamIds, setExcludedTeamIds] = useState<string[]>([]);
  const [excludeNotification, setExcludeNotification] = useState<string | null>(null);

  // Refs to prevent stale closures and out-of-order network race conditions
  const leagueRef = useRef<League | null>(null);
  const mutationVersionRef = useRef(0);

  useEffect(() => {
    leagueRef.current = league;
  }, [league]);

  const getMatchSignature = (m: Match): string => {
    const pairTeams = [m.teamAId, m.teamBId].sort().join('|');
    const aIds = m.teamAPlayers.map((p) => p.id).sort().join(',');
    const bIds = m.teamBPlayers.map((p) => p.id).sort().join(',');
    const pairPlayers = [aIds, bIds].sort().join('::');
    return `${pairTeams}#${pairPlayers}`;
  };

  const mergeMatchesUnique = (primary: Match[], secondary: Match[], excludeDeleted: Match[] = []): Match[] => {
    const deletedSigs = new Set(excludeDeleted.map(getMatchSignature));
    const seen = new Set<string>();
    const result: Match[] = [];
    for (const m of [...primary, ...secondary]) {
      const sig = getMatchSignature(m);
      if (!seen.has(sig) && !deletedSigs.has(sig)) {
        seen.add(sig);
        result.push(m);
      }
    }
    return result;
  };

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
          // If a league link was shared with someone who has not cached it yet, fetch from server/ESPN
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
    mutationVersionRef.current += 1;
    const reqVersion = mutationVersionRef.current;

    setLeague(selectedLeague);
    leagueRef.current = selectedLeague;
    setTradeType('1-for-1');

    const seedSwipes = createSeedOpponentSwipes(selectedLeague);
    const localSwipes = getLocalSwipes(selectedLeague.espnLeagueId);
    const mergedInitialSwipes = [
      ...seedSwipes,
      ...localSwipes.filter((ls) => !seedSwipes.some((ss) => ss.id === ls.id)),
    ];
    setSwipes(mergedInitialSwipes);
    const localDeleted = getLocalDeletedMatches(selectedLeague.espnLeagueId);
    const localMatches = getLocalMatches(selectedLeague.espnLeagueId);
    setDeletedMatches(localDeleted);
    setMatches(mergeMatchesUnique(localMatches, [], localDeleted));

    // Check if the current user previously claimed a team on this device
    let resolvedTeamId: string | null = null;
    const storedClaimedTeamId = getStoredUserClaim(selectedLeague.espnLeagueId);
    if (storedClaimedTeamId && selectedLeague.teams.some((t) => t.id === storedClaimedTeamId)) {
      resolvedTeamId = storedClaimedTeamId;
      setUserTeamId(storedClaimedTeamId);
      const team = selectedLeague.teams.find((t) => t.id === storedClaimedTeamId);
      if (team && team.roster.length > 0) {
        setSelectedOfferedPlayerIds([team.roster[0].id]);
      } else {
        setSelectedOfferedPlayerIds([]);
      }
    } else {
      // In demo league, default user to Team 1 ("You (Manager)")
      const isMock = selectedLeague.id === 'league_mock_123' || selectedLeague.espnLeagueId === '12345678';
      if (isMock && selectedLeague.teams.length > 0) {
        const firstTeam = selectedLeague.teams[0];
        resolvedTeamId = firstTeam.id;
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
      setExcludedTeamIds(getLocalExcludedTeamIds(selectedLeague.espnLeagueId, resolvedTeamId));
    }

    // Hydrate latest team claims, user swipes, matches, and deleted matches from backend server
    syncLeagueStateWithServer(selectedLeague, resolvedTeamId).then((serverView) => {
      if (!serverView || mutationVersionRef.current !== reqVersion) return;
      setLeague(serverView.league);
      leagueRef.current = serverView.league;
      const isMock =
        serverView.league.id === 'league_mock_123' || serverView.league.espnLeagueId === '12345678';
      const serverDeleted = serverView.deletedMatches || [];
      setDeletedMatches((prevDel) =>
        isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted
      );
      setMatches((prev) =>
        isMock
          ? mergeMatchesUnique(serverView.matches, prev, serverDeleted)
          : serverView.matches
      );
      if (resolvedTeamId) {
        const seeds = createSeedOpponentSwipes(serverView.league);
        setSwipes([
          ...seeds,
          ...serverView.mySwipes.filter((ms) => !seeds.some((s) => s.id === ms.id)),
        ]);
      }
    });
  };

  const handleClaimAndEnterDeck = (teamId: string) => {
    mutationVersionRef.current += 1;
    const reqVersion = mutationVersionRef.current;

    setUserTeamId(teamId);
    const currentLeague = leagueRef.current || league;
    if (currentLeague) {
      setExcludedTeamIds(getLocalExcludedTeamIds(currentLeague.espnLeagueId, teamId));
      const team = currentLeague.teams.find((t) => t.id === teamId);
      if (team && team.roster.length > 0) {
        const isTwoRequired = tradeType === '2-for-1' || tradeType === '2-for-2';
        if (isTwoRequired && team.roster.length >= 2) {
          setSelectedOfferedPlayerIds([team.roster[0].id, team.roster[1].id]);
        } else {
          setTradeType('1-for-1');
          setSelectedOfferedPlayerIds([team.roster[0].id]);
        }
      }

      // Sync swipes and matches for this newly claimed team from backend
      syncLeagueStateWithServer(currentLeague, teamId).then((serverView) => {
        if (!serverView || mutationVersionRef.current !== reqVersion) return;
        setLeague(serverView.league);
        leagueRef.current = serverView.league;
        const isMock =
          serverView.league.id === 'league_mock_123' || serverView.league.espnLeagueId === '12345678';
        const serverDeleted = serverView.deletedMatches || [];
        setDeletedMatches((prevDel) =>
          isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted
        );
        setMatches((prev) =>
          isMock
            ? mergeMatchesUnique(serverView.matches, prev, serverDeleted)
            : serverView.matches
        );
        const seeds = createSeedOpponentSwipes(serverView.league);
        setSwipes([
          ...seeds,
          ...serverView.mySwipes.filter((ms) => !seeds.some((s) => s.id === ms.id)),
        ]);
      });
    }
    setActiveTab('deck');
  };

  // Live background polling to sync team claims and incoming mutual matches from leaguemates
  useEffect(() => {
    if (!league?.espnLeagueId) return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const latestLeague = leagueRef.current;
      if (!latestLeague) return;
      const pollVersion = mutationVersionRef.current;

      syncLeagueStateWithServer(latestLeague, userTeamId).then((serverView) => {
        if (!serverView || mutationVersionRef.current !== pollVersion) return;
        setLeague(serverView.league);
        leagueRef.current = serverView.league;
        const isMock =
          serverView.league.id === 'league_mock_123' || serverView.league.espnLeagueId === '12345678';
        const serverDeleted = serverView.deletedMatches || [];
        setDeletedMatches((prevDel) =>
          isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted
        );
        setMatches((prevMatches) => {
          const nextMatches = isMock
            ? mergeMatchesUnique(serverView.matches, prevMatches, serverDeleted)
            : serverView.matches;
          // If a leaguemate just completed a mutual match with our team, celebrate!
          if (userTeamId && nextMatches.length > prevMatches.length) {
            const brandNewMatch = nextMatches.find(
              (sm) =>
                (sm.teamAId === userTeamId || sm.teamBId === userTeamId) &&
                !prevMatches.some((pm) => pm.id === sm.id)
            );
            if (brandNewMatch) {
              setActiveMatchCelebration(brandNewMatch);
            }
          }
          return nextMatches;
        });
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [league?.espnLeagueId, userTeamId]);

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

  const requiredOfferedCount = tradeType === '2-for-1' || tradeType === '2-for-2' ? 2 : 1;

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

  // All opponent teams in the league (excluding own claimed team)
  const allOpponentTeams = useMemo(() => {
    if (!league || !userTeam) return [];
    return league.teams.filter((t) => t.id !== userTeam.id);
  }, [league, userTeam]);

  // Opponent teams currently included by the Trade With filter
  const includedOpponentTeams = useMemo(() => {
    return allOpponentTeams.filter((t) => !excludedTeamIds.includes(t.id));
  }, [allOpponentTeams, excludedTeamIds]);

  const allOpponentsExcluded = allOpponentTeams.length > 0 && includedOpponentTeams.length === 0;

  // Toggle single team inclusion / exclusion
  const handleToggleTeamExcluded = (teamId: string) => {
    setExcludedTeamIds((prev) => {
      const isExcluded = prev.includes(teamId);
      const next = isExcluded ? prev.filter((id) => id !== teamId) : [...prev, teamId];
      if (league) {
        saveLocalExcludedTeamIds(league.espnLeagueId, next, userTeamId);
      }
      return next;
    });
  };

  // Include all opponent teams
  const handleIncludeAllTeams = () => {
    setExcludedTeamIds([]);
    setExcludeNotification(null);
    if (league) {
      saveLocalExcludedTeamIds(league.espnLeagueId, [], userTeamId);
    }
  };

  // Exclude all opponent teams
  const handleExcludeAllTeams = () => {
    const allIds = allOpponentTeams.map((t) => t.id);
    setExcludedTeamIds(allIds);
    if (league) {
      saveLocalExcludedTeamIds(league.espnLeagueId, allIds, userTeamId);
    }
  };

  // Trade exclusively with one team (isolate partner)
  const handleOnlyTradeWithTeam = (teamId: string) => {
    const otherIds = allOpponentTeams.filter((t) => t.id !== teamId).map((t) => t.id);
    setExcludedTeamIds(otherIds);
    if (league) {
      saveLocalExcludedTeamIds(league.espnLeagueId, otherIds, userTeamId);
    }
    const targetTeam = allOpponentTeams.find((t) => t.id === teamId);
    if (targetTeam) {
      const ownerName = targetTeam.claimedBy || targetTeam.ownerName || targetTeam.name;
      setExcludeNotification(`Trading exclusively with ${ownerName}'s team.`);
      setTimeout(() => setExcludeNotification(null), 3500);
    }
  };

  // Exclude owner directly from SwipeCard
  const handleExcludeOwner = (teamId: string, ownerName: string) => {
    setExcludedTeamIds((prev) => {
      if (prev.includes(teamId)) return prev;
      const next = [...prev, teamId];
      if (league) {
        saveLocalExcludedTeamIds(league.espnLeagueId, next, userTeamId);
      }
      return next;
    });
    setExcludeNotification(`Excluded ${ownerName}'s team from trade deck.`);
    setTimeout(() => setExcludeNotification(null), 3500);
  };

  // Generate swipe deck based on tradeType (1 target or 2 targets) and active team/position filters
  const deckItems = useMemo<DeckItem[]>(() => {
    if (!league || !userTeam || offeredPlayers.length !== requiredOfferedCount) return [];

    const isTargetTwoPlayers = tradeType === '1-for-2' || tradeType === '2-for-2';
    const opponentTeams = includedOpponentTeams;
    const activeOfferedIds = offeredPlayers.map((p) => p.id);

    const matchesPositionFilter = (pos: Position) =>
      selectedPositions.includes(pos) ||
      (selectedPositions.includes('FLEX') && (pos === 'RB' || pos === 'WR' || pos === 'TE'));

    // Unique composite key generator using actual offered player IDs
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
          if (!matchesPositionFilter(player.position)) return;
          const key = generateSwipeKey(tradeType, activeOfferedIds, [player.id]);
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

            // Both players in the target package must match the selected position filters
            if (!matchesPositionFilter(p1.position) || !matchesPositionFilter(p2.position)) continue;

            const key = generateSwipeKey(tradeType, activeOfferedIds, [p1.id, p2.id]);
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
  }, [
    league,
    userTeam,
    offeredPlayers,
    requiredOfferedCount,
    tradeType,
    swipes,
    selectedPositions,
    includedOpponentTeams,
  ]);

  // Current top item to swipe on
  const currentCard = deckItems[0] || null;
  const nextCard = deckItems[1] || null;

  // Handle Swipe (Interested or Pass)
  const handleSwipe = (isInterested: boolean) => {
    if (!currentCard || offeredPlayers.length !== requiredOfferedCount || !userTeam || !league) return;

    mutationVersionRef.current += 1;
    const swipeVersion = mutationVersionRef.current;

    const activeOfferedIds = offeredPlayers.map((p) => p.id);
    const targetPlayerIds = currentCard.players.map((p) => p.id);

    const newSwipe: Swipe = {
      id: `swipe_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      teamId: userTeam.id,
      tradeType,
      offeredPlayerIds: activeOfferedIds,
      targetPlayerIds,
      targetTeamId: currentCard.ownerTeam.id,
      isInterested,
      createdAt: new Date().toISOString(),
    };

    const updatedSwipes = [...swipes, newSwipe];
    setSwipes(updatedSwipes);
    saveLocalSwipes(
      league.espnLeagueId,
      updatedSwipes.filter((s) => s.teamId === userTeam.id)
    );

    // Update internal Elo privately in background
    recordPackageSwipeEloUpdate(activeOfferedIds, targetPlayerIds, isInterested);

    // Check for immediate local match (e.g. demo seed swipes)
    let triggeredLocalMatch: Match | null = null;
    if (isInterested) {
      const localMatch = checkForMutualMatch(newSwipe, updatedSwipes, league);
      if (localMatch) {
        triggeredLocalMatch = localMatch;
        setMatches((prev) => {
          const next = mergeMatchesUnique([localMatch], prev);
          saveLocalMatches(league.espnLeagueId, next);
          return next;
        });
        setActiveMatchCelebration(localMatch);
      }
    }

    // Record swipe on backend server and check against all leaguemates' secret swipes
    recordSwipeOnServer(league.espnLeagueId, newSwipe, league).then((serverView) => {
      if (!serverView || mutationVersionRef.current !== swipeVersion) return;
      const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
      const serverDeleted = serverView.deletedMatches || [];
      setDeletedMatches((prevDel) =>
        isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted
      );
      setMatches((prev) => {
        const next = isMock
          ? mergeMatchesUnique(serverView.matches, prev, serverDeleted)
          : serverView.matches;
        saveLocalMatches(league.espnLeagueId, next);
        return next;
      });
      if (serverView.matchFound && !triggeredLocalMatch) {
        setActiveMatchCelebration(serverView.matchFound);
      }
    });
  };

  // Handle Undo Last Swipe
  const handleUndo = () => {
    const activeOfferedIds = offeredPlayers.map((p) => p.id);
    if (activeOfferedIds.length === 0 || !userTeam || !league) return;
    const userSwipesForPackage = swipes.filter(
      (s) =>
        s.teamId === userTeam.id &&
        s.tradeType === tradeType &&
        arraysEqualIgnoreOrder(s.offeredPlayerIds, activeOfferedIds)
    );

    if (userSwipesForPackage.length === 0) return;

    mutationVersionRef.current += 1;
    const undoVersion = mutationVersionRef.current;

    const lastSwipe = userSwipesForPackage[userSwipesForPackage.length - 1];
    const nextSwipes = swipes.filter((s) => s.id !== lastSwipe.id);
    setSwipes(nextSwipes);
    saveLocalSwipes(
      league.espnLeagueId,
      nextSwipes.filter((s) => s.teamId === userTeam.id)
    );

    // Only revert matches if this specific swipe was an interested swipe
    if (lastSwipe.isInterested) {
      setActiveMatchCelebration(null);
      setMatches((prev) => {
        const filtered = prev.filter((m) => {
          const mA = m.teamAPlayers.map((p) => p.id);
          const mB = m.teamBPlayers.map((p) => p.id);
          const isForward =
            m.teamAId === lastSwipe.teamId &&
            m.teamBId === lastSwipe.targetTeamId &&
            arraysEqualIgnoreOrder(mA, lastSwipe.offeredPlayerIds) &&
            arraysEqualIgnoreOrder(mB, lastSwipe.targetPlayerIds);
          const isReverse =
            m.teamBId === lastSwipe.teamId &&
            m.teamAId === lastSwipe.targetTeamId &&
            arraysEqualIgnoreOrder(mB, lastSwipe.offeredPlayerIds) &&
            arraysEqualIgnoreOrder(mA, lastSwipe.targetPlayerIds);
          return !(isForward || isReverse);
        });
        saveLocalMatches(league.espnLeagueId, filtered);
        return filtered;
      });
    }

    // Sync undo with backend server
    undoSwipeOnServer(league.espnLeagueId, userTeam.id, tradeType, activeOfferedIds).then(
      (serverView) => {
        if (!serverView || mutationVersionRef.current !== undoVersion) return;
        const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
        const serverDeleted = serverView.deletedMatches || [];
        setDeletedMatches((prevDel) =>
          isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted
        );
        setMatches((prev) => {
          const next = isMock
            ? mergeMatchesUnique(prev, serverView.matches, serverDeleted)
            : serverView.matches;
          saveLocalMatches(league.espnLeagueId, next);
          return next;
        });
      }
    );
  };

  // Handle Delete Single Match (removes from both users' active matches and archives under deletedMatches)
  const handleDeleteMatch = (matchToDelete: Match) => {
    if (!userTeam || !league) return;

    mutationVersionRef.current += 1;
    const deleteVersion = mutationVersionRef.current;

    const targetSig = getMatchSignature(matchToDelete);
    const archivedMatch: Match = {
      ...matchToDelete,
      deletedAt: new Date().toISOString(),
      deletedByTeamId: userTeam.id,
      deletedByName: userTeam.claimedBy || userTeam.ownerName || 'Manager',
    };

    if (activeMatchCelebration && getMatchSignature(activeMatchCelebration) === targetSig) {
      setActiveMatchCelebration(null);
    }

    setMatches((prev) => {
      const next = prev.filter((m) => getMatchSignature(m) !== targetSig);
      saveLocalMatches(league.espnLeagueId, next);
      return next;
    });

    setDeletedMatches((prev) => {
      const next = mergeMatchesUnique([archivedMatch], prev);
      saveLocalDeletedMatches(league.espnLeagueId, next);
      return next;
    });

    // Flip deleting user's swipe for this trade to isInterested: false so it doesn't auto-retrigger
    const isDeletingTeamA = matchToDelete.teamAId === userTeam.id;
    const myOfferedIds = (
      isDeletingTeamA ? matchToDelete.teamAPlayers : matchToDelete.teamBPlayers
    ).map((p) => p.id);
    const partnerTargetIds = (
      isDeletingTeamA ? matchToDelete.teamBPlayers : matchToDelete.teamAPlayers
    ).map((p) => p.id);
    const partnerTeamId = isDeletingTeamA ? matchToDelete.teamBId : matchToDelete.teamAId;

    setSwipes((prev) => {
      const next = prev.map((s) => {
        if (
          s.teamId === userTeam.id &&
          s.targetTeamId === partnerTeamId &&
          s.isInterested &&
          arraysEqualIgnoreOrder(s.offeredPlayerIds, myOfferedIds) &&
          arraysEqualIgnoreOrder(s.targetPlayerIds, partnerTargetIds)
        ) {
          return { ...s, isInterested: false };
        }
        return s;
      });
      saveLocalSwipes(
        league.espnLeagueId,
        next.filter((s) => s.teamId === userTeam.id)
      );
      return next;
    });

    deleteMatchOnServer(
      league.espnLeagueId,
      userTeam.id,
      matchToDelete.id,
      league,
      matchToDelete
    ).then((serverView) => {
      if (!serverView || mutationVersionRef.current !== deleteVersion) return;
      const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
      const serverDeleted = serverView.deletedMatches || [];
      setDeletedMatches((prevDel) => {
        const nextDel = isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted;
        saveLocalDeletedMatches(league.espnLeagueId, nextDel);
        return nextDel;
      });
      setMatches((prev) => {
        const next = isMock
          ? mergeMatchesUnique(serverView.matches, prev, serverDeleted)
          : serverView.matches;
        saveLocalMatches(league.espnLeagueId, next);
        return next;
      });
    });
  };

  // Handle Delete All Matches for current user (removes from both users' active matches and archives under deletedMatches)
  const handleDeleteAllMatches = () => {
    if (!userTeam || !league) return;

    const myActiveMatches = matches.filter(
      (m) => m.teamAId === userTeam.id || m.teamBId === userTeam.id
    );
    if (myActiveMatches.length === 0) return;

    mutationVersionRef.current += 1;
    const deleteAllVersion = mutationVersionRef.current;

    const nowIso = new Date().toISOString();
    const deletedByName = userTeam.claimedBy || userTeam.ownerName || 'Manager';
    const newlyArchived: Match[] = myActiveMatches.map((m) => ({
      ...m,
      deletedAt: nowIso,
      deletedByTeamId: userTeam.id,
      deletedByName,
    }));

    setActiveMatchCelebration(null);
    setMatches([]);
    saveLocalMatches(league.espnLeagueId, []);

    setDeletedMatches((prev) => {
      const next = mergeMatchesUnique(newlyArchived, prev);
      saveLocalDeletedMatches(league.espnLeagueId, next);
      return next;
    });

    // Flip deleting user's swipes for all deleted matches to isInterested: false
    setSwipes((prev) => {
      const next = prev.map((s) => {
        if (s.teamId !== userTeam.id || !s.isInterested) return s;
        const wasInDeletedMatch = myActiveMatches.some((m) => {
          const isDeletingTeamA = m.teamAId === userTeam.id;
          const myOfferedIds = (isDeletingTeamA ? m.teamAPlayers : m.teamBPlayers).map((p) => p.id);
          const partnerTargetIds = (isDeletingTeamA ? m.teamBPlayers : m.teamAPlayers).map((p) => p.id);
          const partnerTeamId = isDeletingTeamA ? m.teamBId : m.teamAId;
          return (
            s.targetTeamId === partnerTeamId &&
            arraysEqualIgnoreOrder(s.offeredPlayerIds, myOfferedIds) &&
            arraysEqualIgnoreOrder(s.targetPlayerIds, partnerTargetIds)
          );
        });
        return wasInDeletedMatch ? { ...s, isInterested: false } : s;
      });
      saveLocalSwipes(
        league.espnLeagueId,
        next.filter((s) => s.teamId === userTeam.id)
      );
      return next;
    });

    deleteAllMatchesOnServer(
      league.espnLeagueId,
      userTeam.id,
      league,
      myActiveMatches
    ).then((serverView) => {
      if (!serverView || mutationVersionRef.current !== deleteAllVersion) return;
      const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
      const serverDeleted = serverView.deletedMatches || [];
      setDeletedMatches((prevDel) => {
        const nextDel = isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted;
        saveLocalDeletedMatches(league.espnLeagueId, nextDel);
        return nextDel;
      });
      setMatches(serverView.matches);
      saveLocalMatches(league.espnLeagueId, serverView.matches);
    });
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

            {/* Excluded Owner Notification Toast */}
            {excludeNotification && (
              <div className="w-full max-w-sm mb-3 px-3.5 py-2.5 rounded-2xl bg-slate-900 border border-rose-500/30 text-xs font-semibold flex items-center justify-between shadow-xl shadow-rose-950/20 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2 text-rose-300 truncate">
                  <UserX className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="truncate">{excludeNotification}</span>
                </div>
                <button
                  type="button"
                  onClick={handleIncludeAllTeams}
                  className="text-xs font-bold text-blue-400 hover:text-white underline ml-2 flex-shrink-0"
                >
                  Undo
                </button>
              </div>
            )}

            {/* Target Positions & Trade With Filter Bar */}
            <PositionFilterBar
              selectedPositions={selectedPositions}
              onTogglePosition={handleTogglePosition}
              onSelectAll={handleSelectAllPositions}
              onSelectPreset={handleSelectPresetPositions}
              availableCount={deckItems.length}
              offeredPlayerPosition={offeredPlayers[0]?.position}
              teams={allOpponentTeams}
              excludedTeamIds={excludedTeamIds}
              onToggleTeam={handleToggleTeamExcluded}
              onIncludeAllTeams={handleIncludeAllTeams}
              onExcludeAllTeams={handleExcludeAllTeams}
              onOnlyTradeWithTeam={handleOnlyTradeWithTeam}
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
                    onExcludeOwner={handleExcludeOwner}
                  />
                </AnimatePresence>
              ) : offeredPlayers.length < requiredOfferedCount ? (
                /* Empty or Incomplete Selection State */
                <div className="w-full h-[540px] rounded-3xl bg-slate-900/70 border border-dashed border-amber-500/30 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {offeredPlayers.length === 0 ? 'No Players on Trade Block' : 'Select 1 More Player to Offer'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                    {requiredOfferedCount === 2
                      ? `A ${tradeType} trade requires 2 players from your roster in your offered package.`
                      : 'Select 1 or 2 players from your roster that you are willing to shop to league opponents.'}
                  </p>
                  <button
                    onClick={() => setActiveTab('roster')}
                    className="mt-6 py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition"
                  >
                    Select Players to Shop
                  </button>
                </div>
              ) : allOpponentsExcluded ? (
                /* All Opponents Excluded State */
                <div className="w-full h-[540px] rounded-3xl bg-slate-900/70 border border-dashed border-rose-500/30 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                    <UserX className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-white">All Opponents Excluded</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                    You have excluded all {allOpponentTeams.length} opponent teams in the &quot;Trade With&quot; filter. Include at least one team to view trade cards.
                  </p>
                  <button
                    onClick={handleIncludeAllTeams}
                    className="mt-6 py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition flex items-center gap-2"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Include All Opponents</span>
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
                    You have reviewed all available {tradeType} opportunities for your selected positions and trade partners.
                  </p>

                  <div className="mt-6 flex flex-col gap-2.5 w-full max-w-xs">
                    {excludedTeamIds.length > 0 && (
                      <button
                        onClick={handleIncludeAllTeams}
                        className="py-2.5 px-4 rounded-xl bg-amber-600/30 hover:bg-amber-600/40 border border-amber-500/40 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Include {excludedTeamIds.length} Excluded Opponent{excludedTeamIds.length > 1 ? 's' : ''}</span>
                      </button>
                    )}
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
              deletedMatches={deletedMatches}
              currentTeamId={userTeamId}
              onStartSwiping={() => setActiveTab('deck')}
              onDeleteMatch={handleDeleteMatch}
              onDeleteAllMatches={handleDeleteAllMatches}
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
