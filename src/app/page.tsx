'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { createMockLeague, fetchEspnLeague, sanitizeLeagueByeWeeks } from '@/lib/espn';
import {
  getLeagueById,
  saveLeague,
  getStoredUserClaim,
  saveStoredUserClaim,
  removeStoredUserClaim,
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
  resetLeagueSwipesOnServer,
  recyclePassesOnServer,
  resetTeamSwipesOnServer,
  claimTeamOnServer,
} from '@/lib/leagueStore';
import { getStoredUser, fetchCurrentUser, logoutAccount, linkTeamToAccount, AUTH_CHANGE_EVENT } from '@/lib/authStore';
import {
  checkForMutualMatch,
  createSeedOpponentSwipes,
  arraysEqualIgnoreOrder,
  generateDeckItems,
  computeIncomingActivityHints,
  computePriorityTargetKeys,
  computeWarmTradeLeads,
  generateSwipeKey,
  getReciprocalTradeType,
  DeckItem,
} from '@/lib/matchmaking';
import { recordPackageSwipeEloUpdate, resetInternalEloStore } from '@/lib/elo';
import {
  League,
  Team,
  Player,
  Swipe,
  Match,
  Position,
  TradeType,
  UserAccount,
  IncomingActivityHints,
  InterestedTeamDetail,
  WarmTradeLead,
  ResetScope,
} from '@/types/fantasy';
import { Navbar } from '@/components/Navbar';
import { SwipeCard, SwipeCardRef } from '@/components/SwipeCard';
import { ShoppingRoster } from '@/components/ShoppingRoster';
import { MatchesView } from '@/components/MatchesView';
import { MatchCelebrationModal } from '@/components/MatchCelebrationModal';
import { LeagueSyncModal } from '@/components/LeagueSyncModal';
import { AuthModal } from '@/components/AuthModal';
import { ResetLeagueModal } from '@/components/ResetLeagueModal';
import { SuperUserModal } from '@/components/SuperUserModal';
import { PositionFilterBar, ALL_POSITIONS } from '@/components/PositionFilterBar';
import { HomeHero } from '@/components/HomeHero';
import { LeagueLockerRoom } from '@/components/LeagueLockerRoom';
import { X, Check, RotateCcw, UserCheck, Sparkles, UserX, Users, AlertCircle } from 'lucide-react';

function getMatchSignature(m: Match): string {
  const pairTeams = [m.teamAId, m.teamBId].sort().join('|');
  const aIds = m.teamAPlayers.map((p) => p.id).sort().join(',');
  const bIds = m.teamBPlayers.map((p) => p.id).sort().join(',');
  const pairPlayers = [aIds, bIds].sort().join('::');
  return `${pairTeams}#${pairPlayers}`;
}

function mergeMatchesUnique(primary: Match[], secondary: Match[], excludeDeleted: Match[] = []): Match[] {
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
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'register' | 'login'>('register');
  const [isSuperUserModalOpen, setIsSuperUserModalOpen] = useState(false);
  const currentUserRef = useRef<UserAccount | null>(null);
  const [pendingLeagueId, setPendingLeagueId] = useState<string | null>(null);

  const [league, setLeague] = useState<League | null>(null);
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [tradeType, setTradeType] = useState<TradeType>('1-for-1');
  const [selectedOfferedPlayerIds, setSelectedOfferedPlayerIds] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Position[]>(ALL_POSITIONS);
  const [activeTab, setActiveTab] = useState<'deck' | 'matches' | 'roster' | 'lobby'>('lobby');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isPackageMinimized, setIsPackageMinimized] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pasta_loft_package_minimized');
        if (stored !== null) return stored === 'true';
      } catch {
        // ignore
      }
    }
    return false;
  });

  // Swipes and matches state
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [deletedMatches, setDeletedMatches] = useState<Match[]>([]);
  const [activeMatchCelebration, setActiveMatchCelebration] = useState<Match | null>(null);

  // Server-computed matchmaking hints, priority keys, and warm leads
  const [serverIncomingHints, setServerIncomingHints] = useState<IncomingActivityHints | null>(null);
  const [serverPriorityKeys, setServerPriorityKeys] = useState<string[]>([]);
  const [serverWarmLeads, setServerWarmLeads] = useState<WarmTradeLead[]>([]);

  // Excluded opponent teams in trade deck filter
  const [excludedTeamIds, setExcludedTeamIds] = useState<string[]>([]);
  const [excludeNotification, setExcludeNotification] = useState<string | null>(null);

  // Reset League Swipes modal and notification state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResettingSwipes, setIsResettingSwipes] = useState(false);
  const [resetNotification, setResetNotification] = useState<string | null>(null);
  const [errorNotification, setErrorNotification] = useState<string | null>(null);

  // Session deck seed for stable randomized candidate player pool
  const [deckSeed, setDeckSeed] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const stored = window.sessionStorage.getItem('pasta_loft_deck_seed');
        if (stored) return stored;
        const generated = `seed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        window.sessionStorage.setItem('pasta_loft_deck_seed', generated);
        return generated;
      } catch {
        // Fallback if sessionStorage is blocked
      }
    }
    return 'seed_static_pasta_loft';
  });

  // Refs to prevent stale closures and out-of-order network race conditions
  const leagueRef = useRef<League | null>(null);
  const mutationVersionRef = useRef(0);
  const lastResetAtRef = useRef<string | undefined>(undefined);
  const undoneSwipeIdsRef = useRef<Set<string>>(new Set());
  const mutationQueueRef = useRef<Promise<any>>(Promise.resolve());
  const buttonSwipeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (buttonSwipeTimeoutRef.current) {
        clearTimeout(buttonSwipeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    // 1. Initial cached user load
    const stored = getStoredUser();
    if (stored) {
      setCurrentUser(stored);
      currentUserRef.current = stored;
    }
    // 2. Fetch fresh user details & claims from server in background
    fetchCurrentUser().then((fresh) => {
      if (fresh) {
        setCurrentUser(fresh);
        currentUserRef.current = fresh;
      }
    });

    // 3. React to auth changes across windows / components
    const handleAuthEvent = (e: Event) => {
      const custom = e as CustomEvent<UserAccount | null>;
      const user = custom.detail || null;
      setCurrentUser(user);
      currentUserRef.current = user;

      // Auto-connect claimed team in active league if user just logged in
      const activeLeague = leagueRef.current;
      if (activeLeague && user) {
        const cleanLeagueId = activeLeague.espnLeagueId;
        const targetTeamId =
          user.claimedTeams[cleanLeagueId] ||
          activeLeague.teams.find(
            (t) =>
              t.claimedByUserId === user.id ||
              (t.isClaimed &&
                t.claimedBy &&
                t.claimedBy.trim().toLowerCase() === user.username.toLowerCase())
          )?.id;

        if (targetTeamId && activeLeague.teams.some((t) => t.id === targetTeamId)) {
          setUserTeamId(targetTeamId);
          const team = activeLeague.teams.find((t) => t.id === targetTeamId);
          if (team && team.roster.length > 0) {
            setSelectedOfferedPlayerIds([team.roster[0].id]);
          }
        }
      }
    };

    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthEvent);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthEvent);
  }, []);

  useEffect(() => {
    leagueRef.current = league;
  }, [league]);

  const handleSelectLeagueRef = useRef<(selectedLeague: League, forcedTeamId?: string) => void>(() => {});

  // Check URL query parameters on initial mount (e.g. ?leagueId=12345678)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryLeagueId = params.get('leagueId');

      if (queryLeagueId) {
        setPendingLeagueId(queryLeagueId);
        const stored = getStoredUser();
        // If user is already authenticated on this device, proceed to load their league
        if (stored) {
          const found = getLeagueById(queryLeagueId);
          if (found) {
            handleSelectLeagueRef.current(found);
            setActiveTab('lobby');
            return;
          } else {
            // If a league link was shared with someone who has not cached it yet, fetch from server/ESPN
            fetchEspnLeague({ leagueId: queryLeagueId })
              .then((fetched) => {
                const saved = saveLeague(fetched);
                handleSelectLeagueRef.current(saved);
                setActiveTab('lobby');
              })
              .catch(() => {
                // If private or error, user remains on HomeHero to input cookies/search
              });
          }
        }
        // If not logged in, user encounters HomeHero Screen 1 (Login/Register)
        // with invite banner: "You've been invited to join ESPN League #{pendingLeagueId}!"
      }
      // Cold visits with no query parameter will stay on HomeHero (league = null)
    }
  }, []);

  const handleSelectLeague = (selectedLeague: League, forcedTeamId?: string) => {
    mutationVersionRef.current += 1;
    const reqVersion = mutationVersionRef.current;

    const safeLeague = sanitizeLeagueByeWeeks(selectedLeague);
    setLeague(safeLeague);
    leagueRef.current = safeLeague;
    setTradeType('1-for-1');

    const seedSwipes = createSeedOpponentSwipes(safeLeague);
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
    setServerIncomingHints(null);
    setServerPriorityKeys([]);
    setServerWarmLeads([]);
    lastResetAtRef.current = undefined;

    // Check if the current user has a claimed team on their account or on this device
    let resolvedTeamId: string | null = null;
    const cleanLeagueId = selectedLeague.espnLeagueId;
    const activeUser = currentUserRef.current;

    // 0. Forced team ID if passed (e.g. from claimed leagues navigator)
    if (forcedTeamId && selectedLeague.teams.some((t) => t.id === forcedTeamId)) {
      resolvedTeamId = forcedTeamId;
    }

    // 1. Check user account claimed teams
    if (!resolvedTeamId && activeUser && activeUser.claimedTeams && activeUser.claimedTeams[cleanLeagueId]) {
      const accountTeamId = activeUser.claimedTeams[cleanLeagueId];
      if (selectedLeague.teams.some((t) => t.id === accountTeamId)) {
        resolvedTeamId = accountTeamId;
      }
    }

    // 2. Check league teams claimed by user's ID or username
    if (!resolvedTeamId && activeUser) {
      const userClaimedTeam = selectedLeague.teams.find(
        (t) =>
          t.claimedByUserId === activeUser.id ||
          (t.isClaimed &&
            t.claimedBy &&
            t.claimedBy.trim().toLowerCase() === activeUser.username.toLowerCase())
      );
      if (userClaimedTeam) {
        resolvedTeamId = userClaimedTeam.id;
      }
    }

    // 3. Fallback to localStorage user claim
    if (!resolvedTeamId) {
      const storedClaimedTeamId = getStoredUserClaim(cleanLeagueId);
      if (storedClaimedTeamId && selectedLeague.teams.some((t) => t.id === storedClaimedTeamId)) {
        resolvedTeamId = storedClaimedTeamId;
      }
    }

    const isMock = Boolean(selectedLeague.isMock || selectedLeague.id === 'league_mock_123' || selectedLeague.espnLeagueId === '12345678');

    if (resolvedTeamId) {
      setUserTeamId(resolvedTeamId);
      saveStoredUserClaim(cleanLeagueId, resolvedTeamId);
      const team = selectedLeague.teams.find((t) => t.id === resolvedTeamId);
      if (team && team.roster.length > 0) {
        setSelectedOfferedPlayerIds([team.roster[0].id]);
      } else {
        setSelectedOfferedPlayerIds([]);
      }
      if (forcedTeamId) {
        setActiveTab('deck');
      }
      if (isMock && activeUser) {
        saveStoredUserClaim(cleanLeagueId, resolvedTeamId);
        linkTeamToAccount(cleanLeagueId, resolvedTeamId, activeUser.id);
        claimTeamOnServer(
          cleanLeagueId,
          resolvedTeamId,
          activeUser.username || team?.ownerName || 'Manager',
          selectedLeague,
          undefined,
          activeUser.id
        );
      }
    } else {
      // In demo league, default user to Team 1 ("You (Manager)")
      if (isMock && selectedLeague.teams.length > 0) {
        const firstTeam = selectedLeague.teams[0];
        resolvedTeamId = firstTeam.id;
        setUserTeamId(firstTeam.id);
        if (firstTeam.roster.length > 0) {
          setSelectedOfferedPlayerIds([firstTeam.roster[0].id]);
        }
        if (activeUser) {
          saveStoredUserClaim(cleanLeagueId, resolvedTeamId);
          linkTeamToAccount(cleanLeagueId, resolvedTeamId, activeUser.id);
          claimTeamOnServer(
            cleanLeagueId,
            resolvedTeamId,
            activeUser.username || firstTeam.ownerName || 'Manager',
            selectedLeague,
            undefined,
            activeUser.id
          );
        }
      } else {
        // In real leagues, let manager pick their team in the Locker Room
        setUserTeamId(null);
        setSelectedOfferedPlayerIds([]);
        setActiveTab('lobby');
      }
    }
    setExcludedTeamIds(getLocalExcludedTeamIds(selectedLeague.espnLeagueId, resolvedTeamId));

    // Hydrate latest team claims, user swipes, matches, and deleted matches from backend server
    syncLeagueStateWithServer(selectedLeague, resolvedTeamId).then((serverView) => {
      if (!serverView || !serverView.league || mutationVersionRef.current !== reqVersion) return;
      setLeague(serverView.league);
      leagueRef.current = serverView.league;
      lastResetAtRef.current = serverView.lastResetAt;
      if (serverView.incomingActivityHints !== undefined) {
        setServerIncomingHints(serverView.incomingActivityHints || null);
      }
      if (serverView.priorityTargetKeys !== undefined) {
        setServerPriorityKeys(serverView.priorityTargetKeys || []);
      }
      if (serverView.warmLeads !== undefined) {
        setServerWarmLeads(serverView.warmLeads || []);
      }

      // If user had not resolved a team yet, check if server league links to their account
      const currentAuthedUser = currentUserRef.current;
      if (!resolvedTeamId && currentAuthedUser) {
        const serverUserTeam = serverView.league.teams.find(
          (t) =>
            t.claimedByUserId === currentAuthedUser.id ||
            (t.isClaimed &&
              t.claimedBy &&
              t.claimedBy.trim().toLowerCase() === currentAuthedUser.username.toLowerCase())
        );
        if (serverUserTeam) {
          resolvedTeamId = serverUserTeam.id;
          setUserTeamId(serverUserTeam.id);
          saveStoredUserClaim(cleanLeagueId, serverUserTeam.id);
          if (serverUserTeam.roster.length > 0) {
            setSelectedOfferedPlayerIds([serverUserTeam.roster[0].id]);
          }
        }
      }

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
  handleSelectLeagueRef.current = handleSelectLeague;

  const handleSelectLeagueAndTeam = async (leagueId: string, teamId: string) => {
    let targetLeague = getLeagueById(leagueId);
    if (!targetLeague) {
      try {
        const res = await fetch(`/api/league?leagueId=${encodeURIComponent(leagueId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.league) {
            targetLeague = saveLeague(data.league);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch league from server store:', err);
      }
    }
    if (!targetLeague) {
      try {
        const fetched = await fetchEspnLeague({ leagueId });
        targetLeague = saveLeague(fetched);
      } catch (err) {
        console.error('Failed to fetch ESPN league for claim:', err);
      }
    }
    if (targetLeague) {
      handleSelectLeague(targetLeague, teamId);
      setActiveTab('deck');
    }
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
        const sendCount = parseInt(tradeType.split('-for-')[0], 10) || 1;
        if (team.roster.length >= sendCount) {
          setSelectedOfferedPlayerIds(team.roster.slice(0, sendCount).map((p) => p.id));
        } else {
          setTradeType('1-for-1');
          setSelectedOfferedPlayerIds([team.roster[0].id]);
        }
      }

      // Sync swipes and matches for this newly claimed team from backend
      syncLeagueStateWithServer(currentLeague, teamId).then((serverView) => {
        if (!serverView || !serverView.league || mutationVersionRef.current !== reqVersion) return;
        setLeague(serverView.league);
        leagueRef.current = serverView.league;
        lastResetAtRef.current = serverView.lastResetAt;
        if (serverView.incomingActivityHints !== undefined) {
          setServerIncomingHints(serverView.incomingActivityHints || null);
        }
        if (serverView.priorityTargetKeys !== undefined) {
          setServerPriorityKeys(serverView.priorityTargetKeys || []);
        }
        if (serverView.warmLeads !== undefined) {
          setServerWarmLeads(serverView.warmLeads || []);
        }
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

    let isMounted = true;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const latestLeague = leagueRef.current;
      if (!latestLeague) return;
      const pollVersion = mutationVersionRef.current;

      syncLeagueStateWithServer(latestLeague, userTeamId).then((serverView) => {
        if (!isMounted || !serverView) return;
        if (serverView.status === 401 && currentUserRef.current) {
          setErrorNotification('Your session has expired. Please log in again.');
          handleOpenAuth('login');
          return;
        }
        if (serverView.status === 403) {
          setErrorNotification(serverView.error || 'Team ownership has changed or access was denied (403).');
          return;
        }
        if (!serverView.league || mutationVersionRef.current !== pollVersion) return;
        setLeague(serverView.league);
        leagueRef.current = serverView.league;
        if (serverView.incomingActivityHints !== undefined) {
          setServerIncomingHints(serverView.incomingActivityHints || null);
        }
        if (serverView.priorityTargetKeys !== undefined) {
          setServerPriorityKeys(serverView.priorityTargetKeys || []);
        }
        if (serverView.warmLeads !== undefined) {
          setServerWarmLeads(serverView.warmLeads || []);
        }
        const isMock =
          serverView.league.id === 'league_mock_123' || serverView.league.espnLeagueId === '12345678';
        const serverDeleted = serverView.deletedMatches || [];

        // Only trigger a client reset if the server explicitly stamped a new lastResetAt timestamp
        // (avoids false-positive deckSeed reshuffling every 8s when a user simply has 0 swipes/0 matches)
        const hasNewServerResetTimestamp =
          Boolean(serverView.lastResetAt) &&
          serverView.lastResetAt !== lastResetAtRef.current;
        if (serverView.lastResetAt) {
          lastResetAtRef.current = serverView.lastResetAt;
        }
        const isServerReset =
          hasNewServerResetTimestamp &&
          serverView.matches.length === 0 &&
          serverDeleted.length === 0 &&
          serverView.mySwipes.length === 0;

        if (isServerReset && latestLeague?.espnLeagueId) {
          saveLocalMatches(latestLeague.espnLeagueId, []);
          saveLocalDeletedMatches(latestLeague.espnLeagueId, []);
          saveLocalSwipes(latestLeague.espnLeagueId, []);
          const freshSeed = `seed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          setDeckSeed(freshSeed);
          if (typeof window !== 'undefined' && window.sessionStorage) {
            try {
              window.sessionStorage.setItem('pasta_loft_deck_seed', freshSeed);
            } catch {
              // Ignore
            }
          }
        }

        setDeletedMatches((prevDel) =>
          isServerReset
            ? []
            : isMock
            ? mergeMatchesUnique(serverDeleted, prevDel)
            : serverDeleted
        );
        setMatches((prevMatches) => {
          const nextMatches = isServerReset
            ? []
            : isMock
            ? mergeMatchesUnique(serverView.matches, prevMatches, serverDeleted)
            : serverView.matches;
          // If a leaguemate just completed a mutual match with our team, celebrate!
          if (userTeamId && nextMatches.length > prevMatches.length) {
            const brandNewMatch = nextMatches.find(
              (sm) =>
                (sm.teamAId === userTeamId || sm.teamBId === userTeamId) &&
                !prevMatches.some((pm) => pm.id === sm.id)
            );
            if (brandNewMatch && isMounted) {
              setActiveMatchCelebration(brandNewMatch);
            }
          }
          return nextMatches;
        });

        // Keep client swipes in sync with server swipes (especially when leaguemates or commissioner reset swipes)
        if (userTeamId && isMounted) {
          const seeds = createSeedOpponentSwipes(serverView.league);
          setSwipes([
            ...seeds,
            ...serverView.mySwipes.filter((ms) => !seeds.some((s) => s.id === ms.id)),
          ]);
        }
      });
    }, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
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

  const requiredOfferedCount = parseInt(tradeType.split('-for-')[0], 10) || 1;

  // Handle Trade Type change (adjusting offered player counts)
  const handleTradeTypeChange = (newType: TradeType) => {
    setTradeType(newType);
    if (!userTeam) return;

    const newSendCount = parseInt(newType.split('-for-')[0], 10) || 1;
    if (selectedOfferedPlayerIds.length > newSendCount) {
      setSelectedOfferedPlayerIds(selectedOfferedPlayerIds.slice(0, newSendCount));
    } else if (selectedOfferedPlayerIds.length < newSendCount) {
      const needed = newSendCount - selectedOfferedPlayerIds.length;
      const additional = userTeam.roster
        .filter((p) => !selectedOfferedPlayerIds.includes(p.id))
        .slice(0, needed)
        .map((p) => p.id);
      setSelectedOfferedPlayerIds([...selectedOfferedPlayerIds, ...additional]);
    }
  };

  // Toggle player selection in ShoppingRoster
  const handleToggleOfferedPlayer = (player: Player) => {
    const sendCount = parseInt(tradeType.split('-for-')[0], 10) || 1;

    if (sendCount === 1) {
      setSelectedOfferedPlayerIds([player.id]);
    } else {
      if (selectedOfferedPlayerIds.includes(player.id)) {
        setSelectedOfferedPlayerIds((prev) => prev.filter((id) => id !== player.id));
      } else {
        if (selectedOfferedPlayerIds.length < sendCount) {
          setSelectedOfferedPlayerIds((prev) => [...prev, player.id]);
        } else {
          // FIFO replace: drop oldest player to allow rotating positions freely
          setSelectedOfferedPlayerIds((prev) => [...prev.slice(1), player.id]);
        }
      }
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

  // Combine server-computed incoming activity hints, priority target keys, and warm leads with local seed swipes
  const effectiveIncomingHints = useMemo<IncomingActivityHints | undefined>(() => {
    if (!userTeam) return undefined;
    const localHints = computeIncomingActivityHints(swipes, userTeam.id, matches, league?.teams);
    if (!serverIncomingHints) return localHints;

    const mergedTradeTypes = Array.from(
      new Set([
        ...(localHints.interestedTradeTypes || []),
        ...(serverIncomingHints.interestedTradeTypes || []),
      ])
    );
    const mergedTargetedIds = Array.from(
      new Set([
        ...(localHints.targetedPlayerIds || []),
        ...(serverIncomingHints.targetedPlayerIds || []),
      ])
    );

    const mergedPlayerInterestedTeams: Record<string, InterestedTeamDetail[]> = {};
    const allPlayerIds = new Set([
      ...Object.keys(localHints.playerInterestedTeams || {}),
      ...Object.keys(serverIncomingHints.playerInterestedTeams || {}),
    ]);

    for (const pid of allPlayerIds) {
      const localList = localHints.playerInterestedTeams?.[pid] || [];
      const serverList = serverIncomingHints.playerInterestedTeams?.[pid] || [];
      const teamMap = new Map<string, InterestedTeamDetail>();

      for (const t of [...serverList, ...localList]) {
        if (!teamMap.has(t.teamId)) {
          teamMap.set(t.teamId, { ...t });
        } else {
          const existing = teamMap.get(t.teamId)!;
          if (t.tradeTypes && t.tradeTypes.length > 0) {
            const combinedTypes = Array.from(new Set([...(existing.tradeTypes || []), ...t.tradeTypes]));
            teamMap.set(t.teamId, { ...existing, tradeTypes: combinedTypes });
          }
        }
      }
      mergedPlayerInterestedTeams[pid] = Array.from(teamMap.values());
    }

    return {
      interestedTradeTypes: mergedTradeTypes,
      targetedPlayerIds: mergedTargetedIds,
      totalIncomingCount: Math.max(
        localHints.totalIncomingCount || 0,
        serverIncomingHints.totalIncomingCount || 0
      ),
      playerInterestedTeams: mergedPlayerInterestedTeams,
    };
  }, [userTeam, swipes, matches, league?.teams, serverIncomingHints]);

  const effectivePriorityTargetKeys = useMemo<string[]>(() => {
    if (!userTeam) return [];
    const localKeys = computePriorityTargetKeys(swipes, userTeam.id, matches);
    const excludedKeys = new Set(
      swipes
        .filter((s) => s.teamId === userTeam.id)
        .map((s) => generateSwipeKey(s.tradeType, s.offeredPlayerIds || [], s.targetPlayerIds || []))
    );
    for (const m of matches) {
      if (!m || m.deletedAt) continue;
      if (m.teamAId === userTeam.id) {
        excludedKeys.add(
          generateSwipeKey(
            m.tradeType,
            m.teamAPlayers.map((p) => p.id),
            m.teamBPlayers.map((p) => p.id)
          )
        );
      } else if (m.teamBId === userTeam.id) {
        excludedKeys.add(
          generateSwipeKey(
            getReciprocalTradeType(m.tradeType),
            m.teamBPlayers.map((p) => p.id),
            m.teamAPlayers.map((p) => p.id)
          )
        );
      }
    }
    const filteredServerKeys = serverPriorityKeys.filter((k) => !excludedKeys.has(k));
    return Array.from(new Set([...localKeys, ...filteredServerKeys]));
  }, [userTeam, swipes, serverPriorityKeys, matches]);

  const effectiveWarmLeads = useMemo<WarmTradeLead[]>(() => {
    if (!league || !userTeam) return [];
    const localLeads = computeWarmTradeLeads(swipes, matches, league, userTeam.id);
    const seen = new Set<string>();
    const combined: WarmTradeLead[] = [];
    for (const lead of [...serverWarmLeads, ...localLeads]) {
      if (!seen.has(lead.id)) {
        seen.add(lead.id);
        combined.push(lead);
      }
    }
    return combined;
  }, [league, userTeam, swipes, matches, serverWarmLeads]);

  // Explore a Warm Trade Lead in 1 click (sets reciprocal tradeType, pre-selects overlapping offered players, isolates partner team, opens deck)
  const handleExploreWarmLead = (lead: WarmTradeLead) => {
    if (!userTeam || !league) return;
    const suggestedType = lead.suggestedTradeType;
    const sendCount = parseInt(suggestedType.split('-for-')[0], 10) || 1;
    setTradeType(suggestedType);

    const overlapIds = (lead.myOfferedPlayers || [])
      .map((p) => p.id)
      .filter((id) => userTeam.roster.some((rp) => rp.id === id));
    let nextSelected = overlapIds.slice(0, sendCount);
    if (nextSelected.length < sendCount) {
      const additional = userTeam.roster
        .filter((p) => !nextSelected.includes(p.id))
        .slice(0, sendCount - nextSelected.length)
        .map((p) => p.id);
      nextSelected = [...nextSelected, ...additional];
    }
    setSelectedOfferedPlayerIds(nextSelected);
    handleOnlyTradeWithTeam(lead.partnerTeamId);
    setActiveTab('deck');
  };

  // Generate randomized swipe deck based on tradeType (1, 2, or 3 targets), active team/position filters, priorityTargetKeys, and stable session deckSeed
  const deckItems = useMemo<DeckItem[]>(() => {
    if (!league || !userTeam || offeredPlayers.length !== requiredOfferedCount) return [];

    const activeOfferedIds = offeredPlayers.map((p) => p.id);
    const sortedOfferedIds = [...activeOfferedIds].sort().join(',');
    const activeSeed = `${deckSeed}_${league.espnLeagueId || league.id}_${userTeam.id}_${tradeType}_${sortedOfferedIds}`;

    return generateDeckItems({
      league,
      userTeam,
      tradeType,
      offeredPlayerIds: activeOfferedIds,
      swipes,
      matches,
      selectedPositions,
      includedOpponentTeams,
      seed: activeSeed,
      priorityTargetKeys: effectivePriorityTargetKeys,
    });
  }, [
    league,
    userTeam,
    offeredPlayers,
    requiredOfferedCount,
    tradeType,
    swipes,
    matches,
    selectedPositions,
    includedOpponentTeams,
    deckSeed,
    effectivePriorityTargetKeys,
  ]);

  // Current top item to swipe on
  const currentCard = deckItems[0] || null;
  const nextCard = deckItems[1] || null;

  const cardRef = useRef<SwipeCardRef | null>(null);
  const [isSwipingCard, setIsSwipingCard] = useState(false);

  // Handle programmatic button swipe with smooth card & badge animation
  const handleButtonSwipe = (isInterested: boolean) => {
    if (isSwipingCard) return;
    if (buttonSwipeTimeoutRef.current) {
      clearTimeout(buttonSwipeTimeoutRef.current);
      buttonSwipeTimeoutRef.current = null;
    }
    if (cardRef.current) {
      setIsSwipingCard(true);
      cardRef.current.swipe(isInterested);
      // Safety timeout to reset isSwipingCard in case animation is interrupted
      buttonSwipeTimeoutRef.current = setTimeout(() => {
        setIsSwipingCard(false);
        buttonSwipeTimeoutRef.current = null;
      }, 600);
    } else {
      handleSwipe(isInterested);
    }
  };

  // Handle Swipe (Interested or Pass)
  const handleSwipe = (isInterested: boolean) => {
    if (buttonSwipeTimeoutRef.current) {
      clearTimeout(buttonSwipeTimeoutRef.current);
      buttonSwipeTimeoutRef.current = null;
    }
    setIsSwipingCard(false);
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

    // Sequence server swipe in mutation queue to prevent out-of-order race conditions on rapid swipe
    mutationQueueRef.current = mutationQueueRef.current
      .then(async () => {
        const serverView = await recordSwipeOnServer(league.espnLeagueId, newSwipe, league);
        if (!serverView) return;

        // Session / permission error handling
        if (serverView.status === 401) {
          setErrorNotification('Your session has expired. Please log in again.');
          setTimeout(() => setErrorNotification(null), 5000);
          handleOpenAuth('login');
          return;
        }
        if (serverView.status === 403 || serverView.status === 409) {
          setErrorNotification(
            serverView.error ||
              (serverView.status === 403
                ? 'Team ownership has changed or access was denied (403)'
                : 'Team claim conflict (409)')
          );
          setTimeout(() => setErrorNotification(null), 5000);
          return;
        }

        // Celebrate and merge match found by this swipe even if subsequent rapid swipes happened,
        // as long as the user did NOT undo this specific swipe
        if (serverView.matchFound && !undoneSwipeIdsRef.current.has(newSwipe.id)) {
          setMatches((prev) => {
            const next = mergeMatchesUnique([serverView.matchFound!], prev);
            saveLocalMatches(league.espnLeagueId, next);
            return next;
          });
          if (!triggeredLocalMatch) {
            setActiveMatchCelebration(serverView.matchFound);
          }
        }

        if (mutationVersionRef.current !== swipeVersion) return;
        if (serverView.incomingActivityHints !== undefined) {
          setServerIncomingHints(serverView.incomingActivityHints || null);
        }
        if (serverView.priorityTargetKeys !== undefined) {
          setServerPriorityKeys(serverView.priorityTargetKeys || []);
        }
        if (serverView.warmLeads !== undefined) {
          setServerWarmLeads(serverView.warmLeads || []);
        }
        const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
        const serverDeleted = serverView.deletedMatches || [];
        setDeletedMatches((prevDel) =>
          isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted
        );
        if (serverView.matches) {
          const serverMatches = serverView.matches;
          setMatches((prev) => {
            const next = isMock
              ? mergeMatchesUnique(serverMatches, prev, serverDeleted)
              : serverMatches;
            saveLocalMatches(league.espnLeagueId, next);
            return next;
          });
        }
      })
      .catch((err) => {
        console.error('Failed to record swipe on server:', err);
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
    undoneSwipeIdsRef.current.add(lastSwipe.id);

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

    // Sequence undo mutation in mutationQueueRef
    mutationQueueRef.current = mutationQueueRef.current
      .then(async () => {
        const serverView = await undoSwipeOnServer(
          league.espnLeagueId,
          userTeam.id,
          tradeType,
          activeOfferedIds
        );
        if (!serverView) return;

        if (serverView.status === 401) {
          setErrorNotification('Your session has expired. Please log in again.');
          setTimeout(() => setErrorNotification(null), 5000);
          handleOpenAuth('login');
          return;
        }
        if (serverView.status === 403 || serverView.status === 409) {
          setErrorNotification(
            serverView.error ||
              (serverView.status === 403
                ? 'Team ownership has changed or access was denied (403)'
                : 'Undo conflict (409)')
          );
          setTimeout(() => setErrorNotification(null), 5000);
          return;
        }

        if (mutationVersionRef.current !== undoVersion) return;
        if (serverView.incomingActivityHints !== undefined) {
          setServerIncomingHints(serverView.incomingActivityHints || null);
        }
        if (serverView.priorityTargetKeys !== undefined) {
          setServerPriorityKeys(serverView.priorityTargetKeys || []);
        }
        if (serverView.warmLeads !== undefined) {
          setServerWarmLeads(serverView.warmLeads || []);
        }
        const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
        const serverDeleted = serverView.deletedMatches || [];
        setDeletedMatches((prevDel) =>
          isMock ? mergeMatchesUnique(serverDeleted, prevDel) : serverDeleted
        );
        if (serverView.matches) {
          const serverMatches = serverView.matches;
          setMatches((prev) => {
            const next = isMock
              ? mergeMatchesUnique(prev, serverMatches, serverDeleted)
              : serverMatches;
            saveLocalMatches(league.espnLeagueId, next);
            return next;
          });
        }
      })
      .catch((err) => {
        console.error('Failed to undo swipe on server:', err);
      });
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
      if (!serverView || !serverView.matches || mutationVersionRef.current !== deleteVersion) return;
      if (serverView.incomingActivityHints !== undefined) {
        setServerIncomingHints(serverView.incomingActivityHints || null);
      }
      if (serverView.priorityTargetKeys !== undefined) {
        setServerPriorityKeys(serverView.priorityTargetKeys || []);
      }
      if (serverView.warmLeads !== undefined) {
        setServerWarmLeads(serverView.warmLeads || []);
      }
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
      if (!serverView || !serverView.matches || mutationVersionRef.current !== deleteAllVersion) return;
      if (serverView.incomingActivityHints !== undefined) {
        setServerIncomingHints(serverView.incomingActivityHints || null);
      }
      if (serverView.priorityTargetKeys !== undefined) {
        setServerPriorityKeys(serverView.priorityTargetKeys || []);
      }
      if (serverView.warmLeads !== undefined) {
        setServerWarmLeads(serverView.warmLeads || []);
      }
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

  // Handle Scoped Reset Swipes ('recycle_passes' | 'reset_team' | 'reset_league')
  const handleResetLeagueSwipes = async (scope: ResetScope = 'reset_league') => {
    if (!league) return;

    mutationVersionRef.current += 1;
    const resetVersion = mutationVersionRef.current;

    setIsResettingSwipes(true);

    try {
      const isMock = league.id === 'league_mock_123' || league.espnLeagueId === '12345678';
      const seedSwipes = isMock ? createSeedOpponentSwipes(league) : [];

      if (scope === 'recycle_passes' && userTeamId) {
        // Optimistically remove only pass swipes (isInterested === false) for this team
        setSwipes((prev) => {
          const next = prev.filter((s) => !(s.teamId === userTeamId && !s.isInterested));
          saveLocalSwipes(
            league.espnLeagueId,
            next.filter((s) => s.teamId === userTeamId)
          );
          return next;
        });

        const serverView = await recyclePassesOnServer(
          league.espnLeagueId,
          userTeamId,
          league
        );

        if (serverView && serverView.league && mutationVersionRef.current === resetVersion) {
          setLeague(serverView.league);
          leagueRef.current = serverView.league;
          if (serverView.incomingActivityHints !== undefined) {
            setServerIncomingHints(serverView.incomingActivityHints || null);
          }
          if (serverView.priorityTargetKeys !== undefined) {
            setServerPriorityKeys(serverView.priorityTargetKeys || []);
          }
          if (serverView.warmLeads !== undefined) {
            setServerWarmLeads(serverView.warmLeads || []);
          }
          const freshSeeds = isMock ? createSeedOpponentSwipes(serverView.league) : [];
          setSwipes([
            ...freshSeeds,
            ...(serverView.mySwipes || []).filter((ms) => !freshSeeds.some((s) => s.id === ms.id)),
          ]);
        }

        setIsResetModalOpen(false);
        setResetNotification(
          `Passed cards for ${userTeam?.name || 'your team'} have been recycled back into the deck!`
        );
        setTimeout(() => setResetNotification(null), 5000);
        return;
      }

      if (scope === 'reset_team' && userTeamId) {
        // Optimistically clear this team's swipes and matches
        setSwipes((prev) => {
          const next = prev.filter((s) => s.teamId !== userTeamId);
          saveLocalSwipes(league.espnLeagueId, []);
          return next;
        });
        setMatches((prev) => {
          const next = prev.filter((m) => m.teamAId !== userTeamId && m.teamBId !== userTeamId);
          saveLocalMatches(league.espnLeagueId, next);
          return next;
        });
        setActiveMatchCelebration(null);

        const serverView = await resetTeamSwipesOnServer(
          league.espnLeagueId,
          userTeamId,
          league
        );

        if (serverView && serverView.league && mutationVersionRef.current === resetVersion) {
          setLeague(serverView.league);
          leagueRef.current = serverView.league;
          if (serverView.incomingActivityHints !== undefined) {
            setServerIncomingHints(serverView.incomingActivityHints || null);
          }
          if (serverView.priorityTargetKeys !== undefined) {
            setServerPriorityKeys(serverView.priorityTargetKeys || []);
          }
          if (serverView.warmLeads !== undefined) {
            setServerWarmLeads(serverView.warmLeads || []);
          }
          const freshSeeds = isMock ? createSeedOpponentSwipes(serverView.league) : [];
          setSwipes([
            ...freshSeeds,
            ...(serverView.mySwipes || []).filter((ms) => !freshSeeds.some((s) => s.id === ms.id)),
          ]);
          setMatches(serverView.matches || []);
          setDeletedMatches(serverView.deletedMatches || []);
        }

        const freshSeed = `seed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        setDeckSeed(freshSeed);
        if (typeof window !== 'undefined' && window.sessionStorage) {
          try {
            window.sessionStorage.setItem('pasta_loft_deck_seed', freshSeed);
          } catch {
            // Ignore
          }
        }

        setIsResetModalOpen(false);
        setResetNotification(
          `Swipes and matches for ${userTeam?.name || 'your team'} have been reset!`
        );
        setTimeout(() => setResetNotification(null), 5000);
        return;
      }

      // Default: 'reset_league' — resets all swipes & matches across the league (Super User only)
      const isSuper = Boolean(
        currentUser?.isSuperUser || currentUser?.username?.toLowerCase() === 'superu'
      );
      if (!isSuper) {
        setErrorNotification(
          'Only the super user (superu) can perform a league-wide swipe reset. You can reset your own team swipes.'
        );
        setTimeout(() => setErrorNotification(null), 5000);
        setIsResetModalOpen(false);
        setIsResettingSwipes(false);
        return;
      }

      setSwipes(seedSwipes);
      setMatches([]);
      setDeletedMatches([]);
      setActiveMatchCelebration(null);

      // Reset client-side Elo ratings
      resetInternalEloStore();

      saveLocalSwipes(league.espnLeagueId, []);
      saveLocalMatches(league.espnLeagueId, []);
      saveLocalDeletedMatches(league.espnLeagueId, []);

      const serverView = await resetLeagueSwipesOnServer(
        league.espnLeagueId,
        userTeamId,
        league
      );

      if (serverView && serverView.league && mutationVersionRef.current === resetVersion) {
        setLeague(serverView.league);
        leagueRef.current = serverView.league;
        if (serverView.lastResetAt) {
          lastResetAtRef.current = serverView.lastResetAt;
        }
        if (serverView.incomingActivityHints !== undefined) {
          setServerIncomingHints(serverView.incomingActivityHints || null);
        }
        if (serverView.priorityTargetKeys !== undefined) {
          setServerPriorityKeys(serverView.priorityTargetKeys || []);
        }
        if (serverView.warmLeads !== undefined) {
          setServerWarmLeads(serverView.warmLeads || []);
        }
        const freshSeeds = isMock ? createSeedOpponentSwipes(serverView.league) : [];
        setSwipes([
          ...freshSeeds,
          ...(serverView.mySwipes || []).filter((ms) => !freshSeeds.some((s) => s.id === ms.id)),
        ]);
        setMatches(serverView.matches || []);
        setDeletedMatches(serverView.deletedMatches || []);
      }

      // Rotate deck seed on league reset to provide a fresh shuffle
      const freshSeed = `seed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setDeckSeed(freshSeed);
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          window.sessionStorage.setItem('pasta_loft_deck_seed', freshSeed);
        } catch {
          // Ignore
        }
      }

      setIsResetModalOpen(false);
      setResetNotification(
        `All swipes and trade matches for "${league.name}" have been reset! Starting fresh.`
      );
      setTimeout(() => setResetNotification(null), 5000);
    } catch (err: any) {
      console.error('Failed to reset league swipes:', err);
    } finally {
      setIsResettingSwipes(false);
    }
  };

  // Desktop Keyboard Shortcuts on the Swipe Deck (ArrowLeft = Pass, ArrowRight = Want, Z/Backspace = Undo, Space/I = Toggle Stats)
  const keyboardHandlersRef = useRef({
    handleButtonSwipe,
    handleUndo,
    currentCard,
    isSwipingCard,
  });
  useEffect(() => {
    keyboardHandlersRef.current = {
      handleButtonSwipe,
      handleUndo,
      currentCard,
      isSwipingCard,
    };
  });

  useEffect(() => {
    if (
      activeTab !== 'deck' ||
      !league ||
      !userTeam ||
      isSyncModalOpen ||
      isAuthModalOpen ||
      isResetModalOpen ||
      isSuperUserModalOpen ||
      Boolean(activeMatchCelebration)
    ) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const {
        handleButtonSwipe: triggerSwipe,
        handleUndo: triggerUndo,
        currentCard: activeCard,
        isSwipingCard: swiping,
      } = keyboardHandlersRef.current;

      if (e.key === 'ArrowLeft') {
        if (activeCard && !swiping) {
          e.preventDefault();
          if (target && target.tagName === 'BUTTON') target.blur();
          triggerSwipe(false);
        }
      } else if (e.key === 'ArrowRight') {
        if (activeCard && !swiping) {
          e.preventDefault();
          if (target && target.tagName === 'BUTTON') target.blur();
          triggerSwipe(true);
        }
      } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
        if (!swiping) {
          e.preventDefault();
          triggerUndo();
        }
      } else if (e.key === ' ' || e.key === 'i' || e.key === 'I') {
        if (e.key === ' ' && target && target.tagName === 'BUTTON') {
          return;
        }
        if (activeCard && cardRef.current) {
          e.preventDefault();
          cardRef.current.toggleStats();
        }
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsPackageMinimized((prev) => {
          const next = !prev;
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('pasta_loft_package_minimized', String(next));
            } catch {
              // ignore
            }
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    league,
    userTeam,
    isSyncModalOpen,
    isAuthModalOpen,
    isResetModalOpen,
    isSuperUserModalOpen,
    activeMatchCelebration,
  ]);

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

  const handleUserChange = (newUser: UserAccount | null) => {
    setCurrentUser(newUser);
    currentUserRef.current = newUser;

    // If there is a pending league invite from URL query param, automatically navigate to it
    if (newUser && pendingLeagueId && !leagueRef.current) {
      const targetId = pendingLeagueId;
      setPendingLeagueId(null);
      const found = getLeagueById(targetId);
      if (found) {
        handleSelectLeague(found);
        setActiveTab('lobby');
      } else {
        fetchEspnLeague({ leagueId: targetId })
          .then((fetched) => {
            const saved = saveLeague(fetched);
            handleSelectLeague(saved);
            setActiveTab('lobby');
          })
          .catch(() => {});
      }
      return;
    }

    // If a league is already loaded and the user has a claimed team in it, auto-link
    const currentLeague = leagueRef.current;
    if (currentLeague && newUser) {
      const cleanLeagueId = currentLeague.espnLeagueId;
      const targetTeamId =
        newUser.claimedTeams[cleanLeagueId] ||
        currentLeague.teams.find(
          (t) =>
            t.claimedByUserId === newUser.id ||
            (t.isClaimed &&
              t.claimedBy &&
              t.claimedBy.trim().toLowerCase() === newUser.username.toLowerCase())
        )?.id;

      if (targetTeamId && currentLeague.teams.some((t) => t.id === targetTeamId)) {
        setUserTeamId(targetTeamId);
        const team = currentLeague.teams.find((t) => t.id === targetTeamId);
        if (team && team.roster.length > 0) {
          setSelectedOfferedPlayerIds([team.roster[0].id]);
        }
      }
    }
  };

  const handleLogout = async () => {
    await logoutAccount();
    if (league) {
      removeStoredUserClaim(league.espnLeagueId);
    }
    setLeague(null);
    setUserTeamId(null);
    setSelectedOfferedPlayerIds([]);
    setSwipes([]);
    setMatches([]);
    setDeletedMatches([]);
    handleUserChange(null);
  };

  const handleOpenAuth = (mode: 'register' | 'login' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleSuperUserRefresh = () => {
    const activeLeague = leagueRef.current || league;
    if (activeLeague) {
      syncLeagueStateWithServer(activeLeague, userTeamId).then((serverView) => {
        if (serverView?.league) {
          setLeague(serverView.league);
          leagueRef.current = serverView.league;
        }
      });
    }
  };

  // 1. FIRST SCREEN IS ALWAYS USER LOGIN / CREATE ACCOUNT ONLY
  if (!currentUser) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-slate-950">
        <Navbar
          league={null}
          currentTeam={null}
          currentUser={null}
          activeTab="lobby"
          matchCount={0}
          onTabChange={() => {}}
          onGoHome={handleGoHome}
          onOpenSync={() => {}}
          onOpenAuth={() => handleOpenAuth('login')}
          onLogout={handleLogout}
        />
        <main className="flex-1 flex flex-col justify-start sm:justify-center items-center py-6 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <HomeHero
            currentUser={null}
            onUserChange={handleUserChange}
            onSelectLeague={handleSelectLeague}
            onSelectLeagueAndTeam={handleSelectLeagueAndTeam}
            pendingLeagueId={pendingLeagueId}
          />
        </main>
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode={authModalMode}
          onSuccess={handleUserChange}
        />
      </div>
    );
  }

  // 2. USER IS LOGGED IN: If no league selected, show User Dashboard (Leagues & Claimed Teams Hub)
  if (!league) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <Navbar
          league={null}
          currentTeam={null}
          currentUser={currentUser}
          activeTab="lobby"
          matchCount={0}
          onTabChange={() => {}}
          onGoHome={handleGoHome}
          onOpenSync={() => setIsSyncModalOpen(true)}
          onOpenAuth={() => handleOpenAuth('login')}
          onLogout={handleLogout}
          onOpenSuperUser={() => setIsSuperUserModalOpen(true)}
        />
        <main className="flex-1 flex flex-col justify-start sm:justify-center items-center py-6 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <HomeHero
            currentUser={currentUser}
            onUserChange={handleUserChange}
            onSelectLeague={(l) => {
              handleSelectLeague(l);
              setActiveTab('lobby');
            }}
            onSelectLeagueAndTeam={handleSelectLeagueAndTeam}
            onOpenDemo={() => {
              const demo = getLeagueById('12345678') || createMockLeague();
              handleSelectLeague(demo);
              setActiveTab('lobby');
            }}
            pendingLeagueId={pendingLeagueId}
            onOpenSuperUser={() => setIsSuperUserModalOpen(true)}
          />
        </main>
        {isSyncModalOpen && (
          <LeagueSyncModal
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            onLeagueLoaded={handleLeagueLoaded}
            initialLeagueId={pendingLeagueId || undefined}
            currentLeague={null}
          />
        )}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode={authModalMode}
          onSuccess={handleUserChange}
        />
        <SuperUserModal
          isOpen={isSuperUserModalOpen}
          onClose={() => setIsSuperUserModalOpen(false)}
          onRefreshAppState={handleSuperUserRefresh}
        />
      </div>
    );
  }

  // If the user hasn't claimed a team in this league yet, show the Locker Room
  if (!userTeam) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <Navbar
          league={league}
          currentTeam={null}
          currentUser={currentUser}
          activeTab="lobby"
          matchCount={matches.length}
          onTabChange={setActiveTab}
          onGoHome={handleGoHome}
          onOpenSync={() => setIsSyncModalOpen(true)}
          onOpenAuth={() => handleOpenAuth('login')}
          onLogout={handleLogout}
          onOpenResetSwipes={() => setIsResetModalOpen(true)}
          onOpenSuperUser={() => setIsSuperUserModalOpen(true)}
        />
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6">
          {/* Floating Notification Toasts */}
          <div className="fixed top-[calc(4.5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm pointer-events-none flex flex-col gap-2">
            {resetNotification && (
              <div className="pointer-events-auto w-full px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-emerald-500/40 text-xs font-semibold flex items-center justify-between shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2 text-emerald-300">
                  <RotateCcw className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{resetNotification}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setResetNotification(null)}
                  className="text-xs text-slate-400 hover:text-white ml-2 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {errorNotification && (
              <div className="pointer-events-auto w-full px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/40 text-xs font-semibold flex items-center justify-between shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>{errorNotification}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorNotification(null)}
                  className="text-xs text-slate-400 hover:text-white ml-2 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <LeagueLockerRoom
            league={league}
            currentTeamId={userTeamId}
            currentUser={currentUser}
            onEnterDeck={handleClaimAndEnterDeck}
            onSwitchLeague={handleGoHome}
            onUpdateLeague={setLeague}
            onOpenSync={() => setIsSyncModalOpen(true)}
            onOpenAuth={() => handleOpenAuth('register')}
            onOpenResetSwipes={() => setIsResetModalOpen(true)}
          />
        </main>
        {isSyncModalOpen && (
          <LeagueSyncModal
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            onLeagueLoaded={handleLeagueLoaded}
            initialLeagueId={league.espnLeagueId}
            currentLeague={league}
          />
        )}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode={authModalMode}
          onSuccess={handleUserChange}
        />
        {league && (
          <ResetLeagueModal
            isOpen={isResetModalOpen}
            leagueName={league.name}
            teamName={null}
            hasTeam={false}
            isSuperUser={Boolean(currentUser?.isSuperUser || currentUser?.username?.toLowerCase() === 'superu')}
            onClose={() => setIsResetModalOpen(false)}
            onConfirm={handleResetLeagueSwipes}
            isResetting={isResettingSwipes}
          />
        )}
        <SuperUserModal
          isOpen={isSuperUserModalOpen}
          onClose={() => setIsSuperUserModalOpen(false)}
          onRefreshAppState={handleSuperUserRefresh}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Top Navigation */}
      <Navbar
        league={league}
        currentTeam={userTeam}
        currentUser={currentUser}
        activeTab={activeTab}
        matchCount={matches.length}
        onTabChange={setActiveTab}
        onGoHome={handleGoHome}
        onOpenSync={() => setIsSyncModalOpen(true)}
        onOpenAuth={() => handleOpenAuth('login')}
        onLogout={handleLogout}
        onOpenResetSwipes={() => setIsResetModalOpen(true)}
        onOpenSuperUser={() => setIsSuperUserModalOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 flex flex-col items-center justify-start sm:justify-center">
        {/* Floating Notification Toasts */}
        <div className="fixed top-[calc(4.5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm pointer-events-none flex flex-col gap-2">
          {resetNotification && (
            <div className="pointer-events-auto w-full px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-emerald-500/40 text-xs font-semibold flex items-center justify-between shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 text-emerald-300">
                <RotateCcw className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{resetNotification}</span>
              </div>
              <button
                type="button"
                onClick={() => setResetNotification(null)}
                className="text-xs text-slate-400 hover:text-white ml-2 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {excludeNotification && (
            <div className="pointer-events-auto w-full px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-rose-500/40 text-xs font-semibold flex items-center justify-between shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
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

          {errorNotification && (
            <div className="pointer-events-auto w-full px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/40 text-xs font-semibold flex items-center justify-between shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>{errorNotification}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorNotification(null)}
                className="text-xs text-slate-400 hover:text-white ml-2 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* TAB 0: LEAGUE LOCKER ROOM (LOBBY & TEAM CLAIMING) */}
        {activeTab === 'lobby' && (
          <LeagueLockerRoom
            league={league}
            currentTeamId={userTeamId}
            currentUser={currentUser}
            onEnterDeck={handleClaimAndEnterDeck}
            onSwitchLeague={handleGoHome}
            onUpdateLeague={setLeague}
            onOpenSync={() => setIsSyncModalOpen(true)}
            onOpenAuth={() => handleOpenAuth('register')}
            onOpenResetSwipes={() => setIsResetModalOpen(true)}
          />
        )}

        {/* TAB 1: SWIPE DECK */}
        {activeTab === 'deck' && (
          <div className="w-full flex flex-col items-center">
            {/* Unified Deck Control Bar (Inline Package Switcher + Target Positions + Trade With Filter) */}
            <PositionFilterBar
              isMinimized={isPackageMinimized}
              onToggleMinimize={setIsPackageMinimized}
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
              userTeam={userTeam}
              tradeType={tradeType}
              offeredPlayers={offeredPlayers}
              selectedOfferedPlayerIds={selectedOfferedPlayerIds}
              onTradeTypeChange={handleTradeTypeChange}
              onToggleOfferedPlayer={handleToggleOfferedPlayer}
              onOpenFullRoster={() => setActiveTab('roster')}
              incomingActivityHints={effectiveIncomingHints}
            />

            {/* The Interactive Card Stack */}
            <div className="card-stack relative mb-4 sm:mb-6">
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
                    ref={cardRef}
                    key={currentCard.id}
                    players={currentCard.players}
                    ownerTeam={currentCard.ownerTeam}
                    isFront={true}
                    onSwipe={handleSwipe}
                    onSwipeStart={() => setIsSwipingCard(true)}
                    onExcludeOwner={handleExcludeOwner}
                  />
                </AnimatePresence>
              ) : offeredPlayers.length < requiredOfferedCount ? (
                /* Empty or Incomplete Selection State */
                <div className="w-full h-full min-h-[380px] sm:min-h-[500px] rounded-3xl bg-slate-900/70 border border-dashed border-amber-500/30 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {offeredPlayers.length === 0
                      ? 'No Players on Trade Block'
                      : `Select ${requiredOfferedCount - offeredPlayers.length} More Player${requiredOfferedCount - offeredPlayers.length > 1 ? 's' : ''} to Offer`}
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                    {requiredOfferedCount > 1
                      ? `A ${tradeType} trade requires ${requiredOfferedCount} players from your roster in your offered package.`
                      : 'Select 1 player from your roster that you are willing to shop to league opponents.'}
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
                <div className="w-full h-full min-h-[380px] sm:min-h-[500px] rounded-3xl bg-slate-900/70 border border-dashed border-rose-500/30 flex flex-col items-center justify-center p-8 text-center">
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
                <div className="w-full h-full min-h-[380px] sm:min-h-[500px] rounded-3xl bg-slate-900/70 border border-dashed border-slate-800 flex flex-col items-center justify-center p-8 text-center">
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
                    <button
                      onClick={() => setIsResetModalOpen(true)}
                      className="py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4 text-rose-400" />
                      <span>Reset League Swipes (Start Fresh)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Floating Control Buttons */}
            {currentCard && (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-6">
                  {/* PASS BUTTON */}
                  <button
                    onClick={() => handleButtonSwipe(false)}
                    disabled={isSwipingCard}
                    className="w-16 h-16 rounded-full bg-slate-900 border-2 border-rose-500/40 hover:border-rose-500 text-rose-400 hover:text-white hover:bg-rose-600 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center shadow-xl shadow-rose-950/40 transition-all hover:scale-110 active:scale-95"
                    title="Pass (Swipe Left or ←)"
                  >
                    <X className="w-8 h-8 stroke-[2.5]" />
                  </button>

                  {/* UNDO BUTTON */}
                  <button
                    onClick={handleUndo}
                    disabled={isSwipingCard}
                    className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
                    title="Undo Last Swipe (Z or Backspace)"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>

                  {/* WANT BUTTON */}
                  <button
                    onClick={() => handleButtonSwipe(true)}
                    disabled={isSwipingCard}
                    className="w-16 h-16 rounded-full bg-slate-900 border-2 border-emerald-500/40 hover:border-emerald-500 text-emerald-400 hover:text-white hover:bg-emerald-600 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center shadow-xl shadow-emerald-950/40 transition-all hover:scale-110 active:scale-95"
                    title="Want / Interested (Swipe Right or →)"
                  >
                    <Check className="w-8 h-8 stroke-[3]" />
                  </button>
                </div>

                {/* Subtle Desktop Keyboard Shortcut Legend */}
                <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold">
                      ←
                    </kbd>{' '}
                    Pass
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold">
                      Z
                    </kbd>{' '}
                    Undo
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold">
                      Space
                    </kbd>{' '}
                    Stats
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-bold">
                      →
                    </kbd>{' '}
                    Want
                  </span>
                </div>
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
              warmLeads={effectiveWarmLeads}
              currentTeamId={userTeamId}
              onStartSwiping={() => setActiveTab('deck')}
              onExploreWarmLead={handleExploreWarmLead}
              onDeleteMatch={handleDeleteMatch}
              onDeleteAllMatches={handleDeleteAllMatches}
              onResetSwipes={() => setIsResetModalOpen(true)}
            />
          </div>
        )}

        {/* TAB 3: ROSTER & PACKAGE CONFIGURATOR */}
        {activeTab === 'roster' && (
          <div className="w-full">
            <ShoppingRoster
              userTeam={userTeam}
              allTeams={league?.teams || []}
              tradeType={tradeType}
              selectedPlayerIds={selectedOfferedPlayerIds}
              onTradeTypeChange={handleTradeTypeChange}
              onTogglePlayer={handleToggleOfferedPlayer}
              onDoneShopping={() => setActiveTab('deck')}
              incomingActivityHints={effectiveIncomingHints}
              onTradeWithTeam={(player, teamDetail) => {
                setSelectedOfferedPlayerIds([player.id]);
                if (teamDetail.tradeTypes && teamDetail.tradeTypes.length > 0) {
                  handleTradeTypeChange(teamDetail.tradeTypes[0]);
                }
                setActiveTab('deck');
              }}
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
        initialLeagueId={league?.espnLeagueId || pendingLeagueId || undefined}
        currentLeague={league}
      />

      {/* Universal Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
        onSuccess={handleUserChange}
      />

      {/* Reset League Swipes Modal */}
      {league && (
        <ResetLeagueModal
          isOpen={isResetModalOpen}
          leagueName={league.name}
          teamName={userTeam?.name || null}
          hasTeam={Boolean(userTeamId)}
          isSuperUser={Boolean(currentUser?.isSuperUser || currentUser?.username?.toLowerCase() === 'superu')}
          onClose={() => setIsResetModalOpen(false)}
          onConfirm={handleResetLeagueSwipes}
          isResetting={isResettingSwipes}
        />
      )}

      {/* Super User Console Modal */}
      <SuperUserModal
        isOpen={isSuperUserModalOpen}
        onClose={() => setIsSuperUserModalOpen(false)}
        onRefreshAppState={handleSuperUserRefresh}
      />
    </div>
  );
}
