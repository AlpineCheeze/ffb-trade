import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, signIn, signOut } from './lib/firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, getDocs, query, where, documentId, setDoc, getDoc } from 'firebase/firestore';
import { Player, TradeProposal, UserVote, League, PlayerStats, Match } from './types';
import { INITIAL_PLAYERS } from './data/initialPlayers';
import { calculateNewRatings, getAverageElo } from './lib/elo';
import { TinderCard } from './components/TinderCard';
import { Trophy, Users, RefreshCw, LogIn, LogOut, ChevronRight, BarChart2, ThumbsUp, ThumbsDown, Settings, X, Plus, Minus, List, SlidersHorizontal, Shield, Share2, Copy, Check, Globe, Map, Undo2, Heart } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';

export default function App() {
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [user, setUser] = useState(auth.currentUser);
  const [activeTab, setActiveTab] = useState<'swipe' | 'leaderboard' | 'team'>('swipe');
  const [marketMode, setMarketMode] = useState<'global' | 'league'>('global');
  const [currentTrade, setCurrentTrade] = useState<{ give: Player[], get: Player[] } | null>(null);
  const [loading, setLoading] = useState(true);

  // League State
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeague, setActiveLeague] = useState<League | null>(null);
  const [leagueStats, setLeagueStats] = useState<Record<string, PlayerStats>>({});
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [pendingLeagueId, setPendingLeagueId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Matches State
  const [matches, setMatches] = useState<Match[]>([]);
  const [newMatch, setNewMatch] = useState<Match | null>(null);

  // Undo State
  const [lastAction, setLastAction] = useState<{
    playersBefore: Player[];
    leagueStatsBefore: Record<string, PlayerStats>;
    trade: { give: Player[], get: Player[] };
    voteId?: string;
  } | null>(null);

  // Roster State
  const [userRoster, setUserRoster] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditingRoster, setIsEditingRoster] = useState(false);
  
  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tradeSettings, setTradeSettings] = useState({
    giveCount: 1,
    getCount: 1,
    viewMode: 'swipe' as 'swipe' | 'feed'
  });

  // Sync auth
  useEffect(() => {
    return auth.onAuthStateChanged(u => {
      setUser(u);
      // Check for league join link in URL
      const params = new URLSearchParams(window.location.search);
      const lid = params.get('leagueId');
      if (lid) {
        setPendingLeagueId(lid);
        setIsJoinModalOpen(true);
      }
    });
  }, []);

  // Sync leagues
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'leagues'), (snap) => {
      const lData = snap.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as League))
        .filter(l => l.members.includes(user.uid));
      setLeagues(lData);
      
      // Auto-select first league if none active
      if (lData.length > 0 && !activeLeague) {
        setActiveLeague(lData[0]);
      }
    });
    return unsub;
  }, [user]);
  
  // Sync league-specific player stats
  useEffect(() => {
    if (!user || !activeLeague) {
       setLeagueStats({});
       return;
    }
    const unsub = onSnapshot(collection(db, 'leagues', activeLeague.id, 'player_stats'), (snap) => {
      const stats: Record<string, PlayerStats> = {};
      snap.docs.forEach(doc => {
        stats[doc.id] = doc.data() as PlayerStats;
      });
      setLeagueStats(stats);
    });
    return unsub;
  }, [user, activeLeague]);

  // Sync Matches
  useEffect(() => {
    if (!user) {
      setMatches([]);
      return;
    }
    const qA = query(collection(db, 'matches'), where('user_a_id', '==', user.uid));
    const qB = query(collection(db, 'matches'), where('user_b_id', '==', user.uid));
    
    let matchesList: Match[] = [];
    const unsubA = onSnapshot(qA, (snap) => {
      const mA = snap.docs.map(d => ({ ...d.data(), id: d.id } as Match));
      const merged = [...mA, ...matchesList.filter(m => m.user_b_id === user.uid)];
      
      // Check for new matches to notify
      const currentIds = matches.map(m => m.id);
      const newlyAdded = mA.find(m => !currentIds.includes(m.id));
      if (newlyAdded && newlyAdded.timestamp > new Date(Date.now() - 5000).toISOString()) {
        setNewMatch(newlyAdded);
      }
      
      setMatches(merged);
      matchesList = merged;
    });

    const unsubB = onSnapshot(qB, (snap) => {
      const mB = snap.docs.map(d => ({ ...d.data(), id: d.id } as Match));
      const merged = [...mB, ...matchesList.filter(m => m.user_a_id === user.uid)];

      // Check for new matches to notify
      const currentIds = matches.map(m => m.id);
      const newlyAdded = mB.find(m => !currentIds.includes(m.id));
      if (newlyAdded && newlyAdded.timestamp > new Date(Date.now() - 5000).toISOString()) {
        setNewMatch(newlyAdded);
      }

      setMatches(merged);
      matchesList = merged;
    });

    return () => { unsubA(); unsubB(); };
  }, [user]);

  // Sync User Roster/Team
  useEffect(() => {
    if (!user) {
      setUserRoster([]);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserRoster(data.team_player_ids || []);
      }
    });
    return unsub;
  }, [user]);

  // Sync players from Firestore (if available)
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'players'), (snap) => {
        if (!snap.empty) {
          const pData = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Player));
          setPlayers(pData);
        }
        setLoading(false);
      }, (err) => {
        console.error("Firestore error, using mock data", err);
        setLoading(false);
      });
      return unsub;
    } catch (e) {
      setLoading(false);
    }
  }, []);

  // Generate a random trade based on settings
  const generateRandomTrade = () => {
    if (players.length < 10) return;
    
    const shuffled = [...players].sort(() => 0.5 - Math.random());
    const giveCount = Math.min(tradeSettings.giveCount, 5);
    const getCount = Math.min(tradeSettings.getCount, 5);
    
    if (shuffled.length < giveCount + getCount) return;

    setCurrentTrade({
      give: shuffled.slice(0, giveCount),
      get: shuffled.slice(giveCount, giveCount + getCount)
    });
  };

  const generatedFeed = useMemo(() => {
    // Generate 10 sample trades for the "All Trades" feed
    const feed = [];
    if (players.length < 10) return [];
    for (let i = 0; i < 15; i++) {
        const shuffled = [...players].sort(() => 0.5 - Math.random());
        feed.push({
            id: `feed-${i}`,
            give: shuffled.slice(0, tradeSettings.giveCount),
            get: shuffled.slice(tradeSettings.giveCount, tradeSettings.giveCount + tradeSettings.getCount)
        });
    }
    return feed;
  }, [players, tradeSettings.giveCount, tradeSettings.getCount, activeTab]);

  useEffect(() => {
    if (!loading && !currentTrade) {
      generateRandomTrade();
    }
  }, [loading, players, currentTrade]);

  const handleSwipe = async (choice: 'YES' | 'NO', score: number, label: string) => {
    if (!currentTrade) return;

    // Capture state for undo
    const playersBefore = [...players];
    const leagueStatsBefore = { ...leagueStats };

    // --- 1. GLOBAL ELO UPDATE ---
    const avgGiveGlobal = getAverageElo(currentTrade.give);
    const avgGetGlobal = getAverageElo(currentTrade.get);
    const ratingsGlobal = calculateNewRatings(avgGiveGlobal, avgGetGlobal, score);
    
    const diffAGlobal = (ratingsGlobal.newRatingA - avgGiveGlobal) / currentTrade.give.length;
    const diffBGlobal = (ratingsGlobal.newRatingB - avgGetGlobal) / currentTrade.get.length;

    // Update global state optimistically
    const updatedPlayers = players.map(p => {
      if (currentTrade.give.find(gp => gp.id === p.id)) {
        return { ...p, elo: p.elo + diffAGlobal, votes_count: p.votes_count + 1 };
      }
      if (currentTrade.get.find(gp => gp.id === p.id)) {
        return { ...p, elo: p.elo + diffBGlobal, votes_count: p.votes_count + 1 };
      }
      return p;
    });
    setPlayers(updatedPlayers);

    // --- 2. LEAGUE ELO UPDATE (if active) ---
    let leagueEloUpdates: Record<string, PlayerStats> = {};
    if (activeLeague) {
      const getLeagueElo = (p: Player) => leagueStats[p.id]?.elo || 1500;
      const avgGiveLeague = currentTrade.give.reduce((sum, p) => sum + getLeagueElo(p), 0) / currentTrade.give.length;
      const avgGetLeague = currentTrade.get.reduce((sum, p) => sum + getLeagueElo(p), 0) / currentTrade.get.length;
      
      const ratingsLeague = calculateNewRatings(avgGiveLeague, avgGetLeague, score);
      const diffALeague = (ratingsLeague.newRatingA - avgGiveLeague) / currentTrade.give.length;
      const diffBLeague = (ratingsLeague.newRatingB - avgGetLeague) / currentTrade.get.length;

      const newStats = { ...leagueStats };
      currentTrade.give.forEach(p => {
        const current = leagueStats[p.id] || { elo: 1500, votes_count: 0 };
        newStats[p.id] = { elo: current.elo + diffALeague, votes_count: current.votes_count + 1 };
        leagueEloUpdates[p.id] = newStats[p.id];
      });
      currentTrade.get.forEach(p => {
        const current = leagueStats[p.id] || { elo: 1500, votes_count: 0 };
        newStats[p.id] = { elo: current.elo + diffBLeague, votes_count: current.votes_count + 1 };
        leagueEloUpdates[p.id] = newStats[p.id];
      });
      setLeagueStats(newStats);
    }

    // Persist to Firebase if authenticated
    if (user) {
      try {
        // Update players (Global)
        for (const p of [...currentTrade.give, ...currentTrade.get]) {
          const pDoc = doc(db, 'players', p.id);
          const currentP = updatedPlayers.find(up => up.id === p.id);
          if (currentP) {
            await updateDoc(pDoc, { 
              elo: currentP.elo, 
              votes_count: currentP.votes_count 
            });
          }

          // Update League Stats
          if (activeLeague && leagueEloUpdates[p.id]) {
            const statsDoc = doc(db, 'leagues', activeLeague.id, 'player_stats', p.id);
            try {
               await setDoc(statsDoc, leagueEloUpdates[p.id], { merge: true });
            } catch (e) { console.error("League update failed", e); }
          }
        }

        // Record vote
        const voteRef = await addDoc(collection(db, 'votes'), {
          user_id: user.uid,
          league_id: activeLeague?.id || 'global',
          trade_players: {
            give: currentTrade.give.map(p => p.id),
            get: currentTrade.get.map(p => p.id)
          },
          choice,
          score,
          label,
          timestamp: new Date().toISOString()
        });

        // Match Logic: If swipe is YES, check for inverse swipe
        if (choice === 'YES') {
          const giveIds = currentTrade.give.map(p => p.id).sort();
          const getIds = currentTrade.get.map(p => p.id).sort();
          
          const votesRef = collection(db, 'votes');
          const q = query(
            votesRef,
            where('league_id', '==', activeLeague?.id || 'global'),
            where('choice', '==', 'YES')
          );
          
          const snap = await getDocs(q);
          const inverseVote = snap.docs.find(doc => {
            const data = doc.data();
            const dGive = (data.trade_players.give as string[]).sort();
            const dGet = (data.trade_players.get as string[]).sort();
            
            return data.user_id !== user.uid && 
                   JSON.stringify(dGive) === JSON.stringify(getIds) && 
                   JSON.stringify(dGet) === JSON.stringify(giveIds);
          });

          if (inverseVote) {
             const vData = inverseVote.data();
             // Create Match
             await addDoc(collection(db, 'matches'), {
                league_id: activeLeague?.id || 'global',
                user_a_id: user.uid,
                user_b_id: vData.user_id,
                user_a_email: user.email,
                user_b_email: 'Opponent', // We might not have their email easily without separate lookup
                player_ids_a: giveIds,
                player_ids_b: getIds,
                timestamp: new Date().toISOString()
             });
          }
        }

        // Store action for undo
        setLastAction({
          playersBefore,
          leagueStatsBefore,
          trade: currentTrade,
          voteId: voteRef.id
        });
      } catch (e) {
        console.error("Failed to persist vote", e);
      }
    }

    setCurrentTrade(null);
  };

  const handleUndo = async () => {
    if (!lastAction) return;
    const { playersBefore, leagueStatsBefore, trade, voteId } = lastAction;

    // Reset local state
    setPlayers(playersBefore);
    setLeagueStats(leagueStatsBefore);
    setCurrentTrade(trade); // Put the trade back up
    setLastAction(null);

    // Revert Firebase if authenticated
    if (user) {
      try {
        // Revert global elos
        for (const p of [...trade.give, ...trade.get]) {
          const pBefore = playersBefore.find(pb => pb.id === p.id);
          if (pBefore) {
            await updateDoc(doc(db, 'players', p.id), {
              elo: pBefore.elo,
              votes_count: pBefore.votes_count
            });
          }

          // Revert league elos
          if (activeLeague) {
            const statsBefore = leagueStatsBefore[p.id];
            const statsDoc = doc(db, 'leagues', activeLeague.id, 'player_stats', p.id);
            if (statsBefore) {
              await setDoc(statsDoc, statsBefore);
            } else {
              await setDoc(statsDoc, { elo: 1500, votes_count: 0 });
            }
          }
        }

        // Delete the vote record
        if (voteId) {
          const { deleteDoc } = await import('firebase/firestore');
          await deleteDoc(doc(db, 'votes', voteId));
        }
      } catch (e) {
        console.error("Undo persist failed", e);
      }
    }
  };

  const createLeague = async () => {
    if (!user) return;
    const name = prompt("Enter League Name:");
    if (!name) return;

    try {
      const docRef = await addDoc(collection(db, 'leagues'), {
        name,
        creator_id: user.uid,
        members: [user.uid],
        created_at: new Date().toISOString()
      });
      alert(`League created! ID: ${docRef.id}`);
    } catch (e) {
      console.error("Error creating league", e);
    }
  };

  const joinLeague = async (leagueId: string) => {
    if (!user) return;
    try {
      const lDoc = doc(db, 'leagues', leagueId);
      const snap = await getDocs(query(collection(db, 'leagues'), where(documentId(), '==', leagueId)));
      if (snap.empty) {
        alert("League not found.");
        return;
      }
      
      const leagueData = snap.docs[0].data() as League;
      if (leagueData.members.includes(user.uid)) {
        alert("You are already in this league.");
        return;
      }

      await updateDoc(lDoc, {
        members: [...leagueData.members, user.uid]
      });
      setIsJoinModalOpen(false);
      setPendingLeagueId(null);
    } catch (e) {
      console.error("Error joining league", e);
    }
  };

  const copyInviteLink = (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?leagueId=${id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleRosterPlayer = async (playerId: string) => {
    if (!user) return;
    const newRoster = userRoster.includes(playerId)
      ? userRoster.filter(id => id !== playerId)
      : [...userRoster, playerId];
    
    // Optimistic update
    setUserRoster(newRoster);

    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        team_player_ids: newRoster
      }, { merge: true });
    } catch (e) {
      console.error("Error updating roster", e);
    }
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const eloA = marketMode === 'league' ? (leagueStats[a.id]?.elo || 1500) : a.elo;
      const eloB = marketMode === 'league' ? (leagueStats[b.id]?.elo || 1500) : b.elo;
      return eloB - eloA;
    });
  }, [players, leagueStats, marketMode]);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-green-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50 pt-[var(--safe-top)]">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <RefreshCw size={18} className="text-black" />
            </div>
            <h1 className="font-black italic text-xl tracking-tighter uppercase">Trade Tinder</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-zinc-500 hover:text-white transition-colors relative"
            >
              <Settings size={20} />
              {(tradeSettings.giveCount > 1 || tradeSettings.getCount > 1) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </button>

            {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest leading-none">Scout</div>
                <div className="text-xs font-bold text-zinc-300">{user.email?.split('@')[0]}</div>
              </div>
              <button onClick={() => signOut()} className="p-2 text-zinc-500 hover:text-white transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => signIn()}
              className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full text-xs font-bold hover:bg-green-500 transition-colors uppercase tracking-wider"
            >
              <LogIn size={14} />
              Join League
            </button>
          )}
        </div>
      </div>
    </header>

      <main className="max-w-2xl mx-auto px-6 py-8 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'swipe' && (
            <motion.div
              key="swipe"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1" />
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-black uppercase tracking-tighter italic">
                    {tradeSettings.viewMode === 'swipe' ? 'Evaluate Trade' : 'Trade Feed'}
                  </h2>
                </div>
                <div className="flex-1 flex justify-end">
                   <button 
                    onClick={() => setTradeSettings(s => ({ ...s, viewMode: s.viewMode === 'swipe' ? 'feed' : 'swipe' }))}
                    className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 rounded-xl text-zinc-400 hover:text-white transition-colors"
                  >
                    {tradeSettings.viewMode === 'swipe' ? <List size={18} /> : <RefreshCw size={18} />}
                  </button>
                </div>
              </div>

              {tradeSettings.viewMode === 'swipe' ? (
                <>
                  {currentTrade ? (
                    <TinderCard 
                      givePlayers={currentTrade.give} 
                      getPlayers={currentTrade.get} 
                      onSwipe={handleSwipe}
                      leagueStats={activeLeague ? leagueStats : undefined}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-zinc-800 rounded-3xl space-y-4">
                      <RefreshCw className="animate-spin text-zinc-700" size={32} />
                      <p className="text-zinc-600 font-mono text-xs uppercase tracking-widest">Scouting new trades...</p>
                    </div>
                  )}

                  <div className="flex justify-center items-center gap-6 pt-4">
                    <button 
                      onClick={() => handleSwipe('NO', 0.8, 'NO THANKS')}
                      className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-colors shadow-lg"
                    >
                      <ThumbsDown size={24} />
                    </button>
                    <button 
                      onClick={() => handleUndo()}
                      disabled={!lastAction}
                      className={`w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center transition-colors ${lastAction ? 'text-zinc-500 hover:text-white cursor-pointer' : 'text-zinc-800 cursor-not-allowed'}`}
                      title="Undo Last Swipe"
                    >
                      <Undo2 size={18} />
                    </button>
                    <button 
                      onClick={() => setCurrentTrade(null)}
                      className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                      title="Refresh Trade"
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button 
                      onClick={() => handleSwipe('YES', 0.2, 'SOLID YES')}
                      className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-green-500 hover:bg-green-500/10 transition-colors shadow-lg"
                    >
                      <ThumbsUp size={24} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {generatedFeed.map((trade, idx) => (
                    <motion.div 
                      key={trade.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4 group"
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-zinc-600 uppercase">Give</span>
                          <div className="flex -space-x-2">
                            {trade.give.map(p => (
                              <div key={p.id} className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-black flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                {p.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-green-600 uppercase">Get</span>
                          <div className="flex -space-x-2">
                            {trade.get.map(p => (
                              <div key={p.id} className="w-8 h-8 rounded-full bg-green-900/20 border-2 border-black flex items-center justify-center text-[10px] font-bold text-green-400">
                                {p.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                         <button 
                          onClick={() => {
                            setCurrentTrade(trade);
                            setTradeSettings(s => ({ ...s, viewMode: 'swipe' }));
                          }}
                          className="bg-zinc-800 hover:bg-green-500 text-zinc-400 hover:text-black p-2 rounded-xl transition-all"
                         >
                            <ChevronRight size={18} />
                         </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'leaderboard' && (
             <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="space-y-4">
                <div className="flex items-end justify-between border-b-2 border-zinc-800 pb-4">
                  <div>
                    <h2 className="text-4xl font-black uppercase tracking-tighter italic leading-none">The Market</h2>
                    <p className="text-zinc-500 text-sm mt-2">Community player desirability ranking.</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Trophy size={48} className="text-green-500/20" />
                  </div>
                </div>

                {/* Market Toggle */}
                {activeLeague && (
                  <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
                    <button 
                      onClick={() => setMarketMode('global')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${marketMode === 'global' ? 'bg-zinc-800 text-green-500 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Globe size={14} />
                      Global
                    </button>
                    <button 
                      onClick={() => setMarketMode('league')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${marketMode === 'league' ? 'bg-zinc-800 text-green-500 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Shield size={14} />
                      {activeLeague.name}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                {sortedPlayers.map((p, i) => {
                  const currentElo = marketMode === 'league' ? (leagueStats[p.id]?.elo || 1500) : p.elo;
                  const currentVotes = marketMode === 'league' ? (leagueStats[p.id]?.votes_count || 0) : p.votes_count;
                  
                  return (
                    <div key={p.id} className="group flex items-center hover:bg-zinc-800/30 p-3 rounded-2xl transition-colors border border-transparent hover:border-zinc-800">
                      <div className="w-8 font-mono text-zinc-600 group-hover:text-green-500 transition-colors">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-zinc-100">{p.name}</div>
                        <div className="text-xs text-zinc-500 uppercase font-mono tracking-tighter">{p.position} • {p.team}</div>
                      </div>
                      <div className="text-right">
                         <div className="font-black italic text-lg">{Math.round(currentElo)}</div>
                         <div className="text-[10px] text-zinc-600 font-mono uppercase leading-none">
                            {marketMode === 'league' ? (
                               <span>{Math.round(p.elo)} Global</span>
                            ) : (
                               <span>{currentVotes} SWIPES</span>
                            )}
                         </div>
                      </div>
                      <ChevronRight size={16} className="ml-4 text-zinc-800 group-hover:text-zinc-500 transition-colors" />
                    </div>
                  );
                })}
              </div>

              {players.length < 10 && user && (
                <div className="pt-8 flex justify-center">
                   <button 
                    onClick={async () => {
                      for (const p of INITIAL_PLAYERS) {
                        try {
                          await setDoc(doc(db, 'players', p.id), p);
                        } catch (e) { console.error(e); }
                      }
                    }}
                    className="bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                  >
                    Seed Market Data
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'team' && (
            <motion.div
              key="team"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Matches Section */}
              {matches.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-pink-500">
                    <Heart size={18} fill="currentColor" />
                    <h3 className="font-mono text-[10px] uppercase tracking-widest font-black">Success Matches</h3>
                  </div>
                  <div className="space-y-2">
                    {matches.map(m => (
                      <div key={m.id} className="bg-gradient-to-br from-pink-500/10 to-transparent border border-pink-500/20 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] bg-pink-500 text-black px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Match</span>
                            <span className="text-zinc-500 text-[10px] font-mono">{new Date(m.timestamp).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 space-y-1">
                              <div className="text-[8px] text-zinc-500 uppercase font-mono">You Send</div>
                              <div className="flex -space-x-1">
                                {m.player_ids_a.map(pid => {
                                  const p = players.find(x => x.id === pid);
                                  return (
                                    <div key={pid} className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-black flex items-center justify-center text-[10px] font-bold" title={p?.name}>
                                      {p?.name.split(' ').map(n => n[0]).join('')}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="text-pink-500">
                              <RefreshCw size={14} className="rotate-45" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="text-[8px] text-zinc-500 uppercase font-mono">You Receive</div>
                              <div className="flex -space-x-1">
                                {m.player_ids_b.map(pid => {
                                  const p = players.find(x => x.id === pid);
                                  return (
                                    <div key={pid} className="w-8 h-8 rounded-full bg-green-900/20 border-2 border-black flex items-center justify-center text-[10px] font-bold text-green-400" title={p?.name}>
                                      {p?.name.split(' ').map(n => n[0]).join('')}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                        <button className="bg-pink-500 text-black p-3 rounded-xl hover:scale-105 transition-transform active:scale-95">
                           <Share2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* League Selector */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest font-black">Your Leagues</h3>
                  <button 
                    onClick={createLeague}
                    className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl text-xs font-bold text-green-500 hover:bg-green-500/10 transition-colors"
                  >
                    <Plus size={14} />
                    New League
                  </button>
                </div>
                
                <div className="space-y-2">
                  {leagues.length > 0 ? (
                    leagues.map(l => (
                      <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeLeague?.id === l.id ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                              <Shield size={20} />
                            </div>
                            <div>
                               <div className="font-bold">{l.name}</div>
                               <div className="text-[10px] text-zinc-500 uppercase font-mono">{l.members.length} Members</div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2">
                            <button 
                              onClick={() => copyInviteLink(l.id)}
                              className="p-2 bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
                              title="Copy Invite Link"
                            >
                              {copied ? <Check size={16} className="text-green-500" /> : <Share2 size={16} />}
                            </button>
                            {activeLeague?.id !== l.id && (
                               <button 
                                onClick={() => setActiveLeague(l)}
                                className="px-3 py-1.5 bg-zinc-800 rounded-xl text-xs font-bold hover:text-white transition-colors"
                               >
                                Select
                               </button>
                            )}
                         </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed border-zinc-800 rounded-3xl">
                       <p className="text-zinc-500 italic text-sm">No leagues yet. Create one to invite friends!</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-zinc-800" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-black uppercase tracking-tighter italic">Your Roster</h2>
                    <p className="text-zinc-500 text-sm">Players on your fantasy team.</p>
                  </div>
                  <button 
                    onClick={() => setIsEditingRoster(!isEditingRoster)}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isEditingRoster ? 'bg-green-500 text-black shadow-lg shadow-green-500/20' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}
                  >
                    {isEditingRoster ? 'Done Editing' : 'Edit Roster'}
                  </button>
                </div>

                {isEditingRoster && (
                  <div className="space-y-4">
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Search players..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-green-500 transition-colors uppercase font-mono placeholder:text-zinc-700"
                      />
                    </div>
                    
                    <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 scrollbar-hide">
                      {players
                        .filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map(p => (
                          <button 
                            key={p.id}
                            onClick={() => toggleRosterPlayer(p.id)}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${userRoster.includes(p.id) ? 'bg-green-500/10 border-green-500/50' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'}`}
                          >
                            <div className="text-left">
                              <div className="font-bold text-sm">{p.name}</div>
                              <div className="text-[10px] text-zinc-500 uppercase font-mono">{p.position} • {p.team}</div>
                            </div>
                            {userRoster.includes(p.id) ? (
                              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-black">
                                <Check size={14} />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-600">
                                <Plus size={14} />
                              </div>
                            )}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  {players.filter(p => userRoster.includes(p.id)).length > 0 ? (
                    players.filter(p => userRoster.includes(p.id)).map(p => (
                      <div 
                        key={p.id}
                        className="flex items-center justify-between p-5 rounded-3xl bg-zinc-900 border border-zinc-800 group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-lg font-black italic text-zinc-500 group-hover:text-green-500 transition-colors">
                            {p.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">{p.position}</div>
                            <div className="font-black text-lg tracking-tight uppercase italic">{p.name}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-zinc-500 uppercase font-mono mb-1">Market Elo</div>
                          <div className="text-xl font-black italic text-zinc-100">{Math.round(p.elo)}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    !isEditingRoster && (
                      <div className="text-center py-12 bg-zinc-900/30 border-2 border-dashed border-zinc-800 rounded-[32px] space-y-4">
                        <Users size={40} className="mx-auto text-zinc-800" />
                        <div className="space-y-1">
                          <p className="text-zinc-500 font-bold">Your roster is empty</p>
                          <p className="text-zinc-600 text-xs">Edit your roster to add players from your league.</p>
                        </div>
                        <button 
                          onClick={() => setIsEditingRoster(true)}
                          className="px-6 py-2 bg-green-500 text-black rounded-full text-xs font-black uppercase tracking-widest"
                        >
                          Add Players
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
              
              <div className="p-8 border-2 border-dashed border-zinc-800 rounded-3xl text-center space-y-4">
                 <p className="text-zinc-500 italic">"Coming soon: Sync your real Fantasy Football league via API."</p>
                 <button className="bg-zinc-800 text-zinc-400 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest">Connect Sleeper / ESPN</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Overlay */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-[32px] p-8 z-[101] shadow-2xl pb-[calc(2rem+var(--safe-bottom))]"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
                  <SlidersHorizontal size={20} className="text-green-500" />
                  Trade Builder
                </h3>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-zinc-800 rounded-full text-zinc-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="flex items-center justify-between bg-zinc-800/50 p-6 rounded-3xl border border-zinc-800">
                  <div className="space-y-1">
                    <div className="font-bold text-zinc-100">You Give</div>
                    <div className="text-xs text-zinc-500">Number of players on side A</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setTradeSettings(s => ({ ...s, giveCount: Math.max(1, s.giveCount - 1) }))}
                      className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="font-mono font-black text-xl w-6 text-center">{tradeSettings.giveCount}</span>
                    <button 
                      onClick={() => setTradeSettings(s => ({ ...s, giveCount: Math.min(5, s.giveCount + 1) }))}
                      className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-zinc-800/50 p-6 rounded-3xl border border-zinc-800">
                  <div className="space-y-1">
                    <div className="font-bold text-zinc-100">You Get</div>
                    <div className="text-xs text-zinc-500">Number of players on side B</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setTradeSettings(s => ({ ...s, getCount: Math.max(1, s.getCount - 1) }))}
                      className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="font-mono font-black text-xl w-6 text-center">{tradeSettings.getCount}</span>
                    <button 
                      onClick={() => setTradeSettings(s => ({ ...s, getCount: Math.min(5, s.getCount + 1) }))}
                      className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setCurrentTrade(null);
                    setIsSettingsOpen(false);
                  }}
                  className="w-full bg-green-500 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-green-400 transition-colors shadow-lg active:scale-95 duration-75"
                >
                  Generate New Trades
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Join League Modal */}
      <AnimatePresence>
        {isJoinModalOpen && pendingLeagueId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200]"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-x-6 top-1/2 -translate-y-1/2 bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 z-[201] max-w-sm mx-auto shadow-2xl"
            >
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-green-500 rounded-2xl mx-auto flex items-center justify-center text-black">
                  <Shield size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black uppercase italic tracking-tighter">Join League?</h3>
                  <p className="text-zinc-500 text-sm">You've been invited to join a private trading league.</p>
                </div>
                
                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={() => joinLeague(pendingLeagueId)}
                    className="w-full bg-green-500 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-green-400 transition-colors"
                  >
                    Accept Invite
                  </button>
                  <button 
                    onClick={() => {
                      setIsJoinModalOpen(false);
                      setPendingLeagueId(null);
                      window.history.replaceState({}, '', window.location.pathname);
                    }}
                    className="w-full bg-zinc-800 text-zinc-400 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:text-white transition-colors"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Match Celebration */}
      <AnimatePresence>
        {newMatch && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="w-full max-w-sm bg-gradient-to-br from-pink-500 to-rose-600 rounded-[40px] p-8 text-center space-y-6 shadow-2xl shadow-pink-500/20"
            >
              <div className="flex justify-center">
                 <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-pink-500 shadow-xl">
                    <Heart size={48} fill="currentColor" />
                 </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">It's a Match!</h2>
                <p className="text-pink-100 font-medium">Both managers agreed to this trade.</p>
              </div>
              <div className="bg-black/20 rounded-3xl p-6 backdrop-blur-md flex items-center justify-center gap-6">
                <div className="flex -space-x-2">
                  {newMatch.player_ids_a.slice(0, 2).map(pid => (
                    <div key={pid} className="w-12 h-12 rounded-full border-4 border-white/20 bg-zinc-900 flex items-center justify-center font-bold text-xs overflow-hidden">
                      {players.find(p => p.id === pid)?.name[0]}
                    </div>
                  ))}
                </div>
                <RefreshCw size={24} className="text-white/40 rotate-45" />
                <div className="flex -space-x-2">
                   {newMatch.player_ids_b.slice(0, 2).map(pid => (
                    <div key={pid} className="w-12 h-12 rounded-full border-4 border-white/20 bg-zinc-900 flex items-center justify-center font-bold text-xs overflow-hidden">
                      {players.find(p => p.id === pid)?.name[0]}
                    </div>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => setNewMatch(null)}
                className="w-full bg-white text-pink-600 py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:bg-pink-50 transition-colors"
              >
                Awesome
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur-xl z-50 pb-[var(--safe-bottom)]">
        <div className="max-w-2xl mx-auto px-6 h-20 flex items-center justify-around">
          <button 
            onClick={() => setActiveTab('swipe')}
            className={`flex flex-col items-center gap-1 transition-colors min-w-[70px] py-2 ${activeTab === 'swipe' ? 'text-green-500' : 'text-zinc-500 hover:text-white'}`}
          >
            <RefreshCw size={24} />
            <span className="text-[10px] uppercase font-mono tracking-widest font-black">Swipe</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('leaderboard')}
            className={`flex flex-col items-center gap-1 transition-colors min-w-[70px] py-2 ${activeTab === 'leaderboard' ? 'text-green-500' : 'text-zinc-500 hover:text-white'}`}
          >
            <BarChart2 size={24} />
            <span className="text-[10px] uppercase font-mono tracking-widest font-black">Market</span>
          </button>

          <button 
            onClick={() => setActiveTab('team')}
            className={`flex flex-col items-center gap-1 transition-colors min-w-[70px] py-2 ${activeTab === 'team' ? 'text-green-500' : 'text-zinc-500 hover:text-white'}`}
          >
            <Users size={24} />
            <span className="text-[10px] uppercase font-mono tracking-widest font-black">My Team</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
