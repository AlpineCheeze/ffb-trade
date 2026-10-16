'use client';

import React, { useState, useEffect } from 'react';
import { League, Team, UserAccount } from '@/types/fantasy';
import { claimTeam, claimTeamOnServer, saveLeague } from '@/lib/leagueStore';
import { linkTeamToAccount } from '@/lib/authStore';
import { fetchEspnLeague } from '@/lib/espn';
import { Users, Copy, Check, Sparkles, ArrowRight, ShieldCheck, Flame, UserCheck, AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';

interface LeagueLockerRoomProps {
  league: League;
  currentTeamId: string | null;
  currentUser?: UserAccount | null;
  onEnterDeck: (teamId: string) => void;
  onSwitchLeague: () => void;
  onUpdateLeague?: (league: League) => void;
  onOpenSync?: () => void;
  onOpenAuth?: () => void;
  onOpenResetSwipes?: () => void;
}

export const LeagueLockerRoom: React.FC<LeagueLockerRoomProps> = ({
  league,
  currentTeamId,
  currentUser,
  onEnterDeck,
  onSwitchLeague,
  onUpdateLeague,
  onOpenSync,
  onOpenAuth,
  onOpenResetSwipes,
}) => {
  const [copied, setCopied] = useState(false);
  const [claimingTeam, setClaimingTeam] = useState<Team | null>(null);
  const [managerName, setManagerName] = useState('');
  const [localLeague, setLocalLeague] = useState<League>(league);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    setLocalLeague(league);
  }, [league]);

  const claimedCount = localLeague.teams.filter((t) => t.isClaimed || t.id === currentTeamId).length;
  const totalCount = localLeague.teams.length;
  const percentClaimed = Math.round((claimedCount / (totalCount || 1)) * 100);

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}?leagueId=${localLeague.espnLeagueId}`
    : `http://localhost:3000?leagueId=${localLeague.espnLeagueId}`;

  const handleRefreshRosters = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);

    try {
      // Check if credentials are saved in sessionStorage for this private league
      let storedCreds: { espnS2?: string; swid?: string } = {};
      if (typeof window !== 'undefined') {
        try {
          const raw = sessionStorage.getItem(`espn_creds_${localLeague.espnLeagueId}`);
          if (raw) storedCreds = JSON.parse(raw);
        } catch {}
      }

      // Fetch latest rosters from ESPN (bypassing stale snapshot)
      const freshLeague = await fetchEspnLeague({
        leagueId: localLeague.espnLeagueId,
        seasonId: localLeague.seasonId,
        espnS2: storedCreds.espnS2,
        swid: storedCreds.swid,
        forceRefresh: true,
      });

      // Preserve local claimed status on teams
      const mergedTeams = freshLeague.teams.map((ft) => {
        const existing = localLeague.teams.find((lt) => lt.id === ft.id || lt.espnTeamId === ft.espnTeamId);
        if (existing && existing.isClaimed) {
          return {
            ...ft,
            isClaimed: true,
            claimedBy: existing.claimedBy,
          };
        }
        return ft;
      });

      const updated: League = {
        ...freshLeague,
        teams: mergedTeams,
        lastSyncedAt: new Date().toISOString(),
      };

      saveLeague(updated);
      setLocalLeague(updated);
      onUpdateLeague?.(updated);
      setRefreshMessage({ text: 'Rosters successfully updated from ESPN!' });
      setTimeout(() => setRefreshMessage(null), 4000);
    } catch (err: any) {
      if (err.isPrivate || err.message?.toLowerCase().includes('private') || err.message?.toLowerCase().includes('cookie')) {
        if (onOpenSync) {
          onOpenSync();
          setRefreshMessage({ text: 'Private league: Enter credentials to update rosters', isError: true });
        } else {
          setRefreshMessage({ text: 'Private league: Please provide credentials in sync settings', isError: true });
        }
      } else {
        setRefreshMessage({ text: err.message || 'Failed to refresh rosters', isError: true });
      }
      setTimeout(() => setRefreshMessage(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyInvite = async () => {
    const message = `🏈 Hey guys! I loaded our fantasy league "${localLeague.name}" on Trade Horny so we can swipe on trades. Claim your team here: ${inviteUrl}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch {
      window.prompt('Copy league invite:', message);
    }
  };

  const handleConfirmClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimingTeam) return;

    const name = managerName.trim() || currentUser?.username || claimingTeam.ownerName || 'Manager';
    const teamId = claimingTeam.id;
    const previousTeamId = currentTeamId;
    const userId = currentUser?.id || undefined;

    const updated = claimTeam(localLeague.espnLeagueId, teamId, name, previousTeamId, userId);
    if (updated) {
      setLocalLeague(updated);
      onUpdateLeague?.(updated);
    }

    // Persist claim to server so all other leaguemates see this team claimed (and previous team released)
    claimTeamOnServer(
      localLeague.espnLeagueId,
      teamId,
      name,
      updated || localLeague,
      previousTeamId,
      userId
    ).then((serverView) => {
      if (serverView?.league) {
        setLocalLeague(serverView.league);
        onUpdateLeague?.(serverView.league);
      }
    });

    if (currentUser) {
      linkTeamToAccount(localLeague.espnLeagueId, teamId, currentUser.id);
    }

    setClaimingTeam(null);
    setManagerName('');
    onEnterDeck(teamId);
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4 animate-in fade-in duration-200">
      {/* Top Banner / Locker Room Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400 mb-1">
              <Users className="w-4 h-4" />
              <span>League Locker Room</span>
              <span>•</span>
              <span className="text-slate-400">Season {localLeague.seasonId}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {localLeague.name}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              ESPN League #{localLeague.espnLeagueId}
              {localLeague.lastSyncedAt && (
                <span className="ml-2 text-slate-500">
                  • Synced {new Date(localLeague.lastSyncedAt).toLocaleDateString()} {new Date(localLeague.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshRosters}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-white px-3.5 py-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 transition disabled:opacity-50 shadow-sm"
              title="Refresh and sync latest rosters from ESPN"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Rosters'}</span>
            </button>

            {onOpenResetSwipes && (
              <button
                onClick={onOpenResetSwipes}
                className="flex items-center gap-1.5 text-xs font-bold text-rose-300 hover:text-white px-3.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 transition shadow-sm"
                title="Reset all swipes and matches for this league to start fresh"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                <span>Reset Swipes</span>
              </button>
            )}

            <button
              onClick={onSwitchLeague}
              className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-xl border border-slate-800 hover:bg-slate-800 transition"
            >
              Switch League
            </button>
          </div>
        </div>

        {/* Refresh Rosters Feedback Banner */}
        {refreshMessage && (
          <div
            className={`mt-4 px-3.5 py-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200 ${
              refreshMessage.isError
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                refreshMessage.isError ? 'text-rose-400' : 'text-emerald-400'
              }`}
            />
            <span>{refreshMessage.text}</span>
          </div>
        )}

        {/* Participation Readiness Progress */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex justify-between items-center text-xs font-bold mb-2">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              League Swiping Readiness
            </span>
            <span className="text-emerald-400">
              {claimedCount} of {totalCount} Teams Active ({percentClaimed}%)
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
            <div
              style={{ width: `${percentClaimed}%` }}
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-500 shadow-sm shadow-emerald-500/50"
            />
          </div>
        </div>

        {/* Shareable League Invite Box */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-950/70 border border-blue-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              Get the whole league swiping:
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              Share this invite link to your league&apos;s GroupMe, Discord, or iMessage chat.
            </p>
          </div>

          <button
            onClick={handleCopyInvite}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30 transition hover:scale-[1.02] active:scale-95 flex-shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Invite Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy League Chat Invite</span>
              </>
            )}
          </button>
        </div>

        {/* Curiosity Teaser */}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
          <Flame className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>
            Trade swiping is live in this league! Claim your team below to enter the swipe deck and see mutual trade matches.
          </span>
        </div>
      </div>

      {/* Team Claiming Grid */}
      <div className="mb-4 flex items-center justify-between px-2">
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <span>Select Your Team</span>
        </h2>
        <span className="text-xs text-slate-400 font-semibold">
          Click an unclaimed team to manage it
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {localLeague.teams.map((team) => {
          const isUserCurrentTeam = team.id === currentTeamId;
          const isClaimedByOther = team.isClaimed && !isUserCurrentTeam;

          return (
            <div
              key={team.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                isUserCurrentTeam
                  ? 'bg-blue-950/60 border-blue-500 ring-1 ring-blue-500 shadow-lg shadow-blue-500/20'
                  : isClaimedByOther
                  ? 'bg-slate-900/40 border-slate-800/80 opacity-75'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-slate-700 shadow-xl cursor-pointer hover:scale-[1.01]'
              }`}
              onClick={() => {
                if (isUserCurrentTeam) {
                  onEnterDeck(team.id);
                } else if (!isClaimedByOther) {
                  setClaimingTeam(team);
                  setManagerName(currentUser?.username || team.ownerName || '');
                }
              }}
            >
              <div>
                {/* Team Header */}
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-base truncate">
                      {team.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium truncate">
                      ESPN Owner: {team.ownerName}
                    </p>
                  </div>

                  {/* Status Badge */}
                  {isUserCurrentTeam ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500 text-white flex items-center gap-1 shadow">
                      <UserCheck className="w-3 h-3" />
                      Your Team
                    </span>
                  ) : isClaimedByOther ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 border border-slate-700 text-slate-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      Claimed
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 animate-pulse">
                      Available
                    </span>
                  )}
                </div>

                {/* Star Player Previews */}
                <div className="mt-3 flex items-center gap-1.5">
                  {team.roster.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      className="w-9 h-9 rounded-full bg-slate-950 border border-slate-700 overflow-hidden flex-shrink-0 relative"
                      title={`${p.fullName} (${p.position})`}
                    >
                      <img
                        src={p.headshotUrl}
                        alt={p.fullName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {team.roster.length > 4 && (
                    <span className="text-[10px] text-slate-500 font-bold pl-1">
                      +{team.roster.length - 4} more
                    </span>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                {isUserCurrentTeam ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEnterDeck(team.id);
                    }}
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition"
                  >
                    <span>Enter Swipe Deck</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : isClaimedByOther ? (
                  <div className="text-center text-[11px] text-slate-500 font-medium">
                    Managed by <strong className="text-slate-300">{team.claimedBy || team.ownerName}</strong>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setClaimingTeam(team);
                      setManagerName(currentUser?.username || team.ownerName || '');
                    }}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Claim & Start Swiping</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Claim Team Modal */}
      {claimingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-black text-white">
              Claim {claimingTeam.name}
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              You will manage this roster and shop players from this team to league mates.
            </p>

            {currentUser ? (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium mb-4">
                <UserCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  Linking to account <strong className="text-white">@{currentUser.username}</strong>. This team will automatically sync across all your devices.
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-medium mb-4">
                <span>Want to access this team on other devices?</span>
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      setClaimingTeam(null);
                      onOpenAuth();
                    }}
                    className="underline font-bold text-white hover:text-blue-200 ml-2 flex-shrink-0"
                  >
                    Log In First
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleConfirmClaim} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Your Name or Fantasy Handle
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dave M. or @TouchdownKing"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 text-sm text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClaimingTeam(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30"
                >
                  Confirm & Start Swiping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
