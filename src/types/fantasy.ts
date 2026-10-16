export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'FLEX';
export type InjuryStatus = 'ACTIVE' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'IR';
export type MatchupDifficulty = 'easy' | 'normal' | 'hard';

export interface PlayerStats {
  targets?: number;
  receptions?: number;
  rushingYards?: number;
  receivingYards?: number;
  passingYards?: number;
  touchdowns?: number;
  snapSharePercent?: number;
}

export interface Player {
  id: string;
  espnPlayerId: string;
  fullName: string;
  position: Position;
  nflTeam: string;
  jerseyNumber?: number;
  headshotUrl: string;
  projectedPoints: number;
  seasonAvgPoints: number;
  opponentDifficulty: MatchupDifficulty;
  nextOpponent: string;
  byeWeek: number;
  injuryStatus: InjuryStatus;
  stats?: PlayerStats;
}

export interface Team {
  id: string;
  espnTeamId: string;
  name: string;
  ownerName: string;
  logoUrl?: string;
  roster: Player[];
  isClaimed?: boolean;
  claimedBy?: string;
}

export interface League {
  id: string;
  espnLeagueId: string;
  seasonId: string;
  name: string;
  isPrivate: boolean;
  teams: Team[];
  lastSyncedAt: string;
  inviteCode?: string;
}

export type TradeType = '1-for-1' | '2-for-1' | '1-for-2' | '2-for-2';

export interface Swipe {
  id: string;
  teamId: string;
  tradeType: TradeType;
  offeredPlayerIds: string[];
  targetPlayerIds: string[];
  targetTeamId: string;
  isInterested: boolean;
  createdAt: string;
}

export interface Match {
  id: string;
  leagueId: string;
  tradeType: TradeType;
  teamAId: string;
  teamBId: string;
  teamAPlayers: Player[];
  teamBPlayers: Player[];
  teamA: Team;
  teamB: Team;
  createdAt: string;
  deletedAt?: string;
  deletedByTeamId?: string;
  deletedByName?: string;
}

export interface InternalEloRecord {
  playerId: string;
  rating: number; // default starts around 1500
  matchesCount: number;
  lastUpdated: string;
}

export interface ServerLeagueState {
  league: League;
  swipes: Swipe[];
  matches: Match[];
  deletedMatches?: Match[];
  elo: Record<string, InternalEloRecord>;
  updatedAt: string;
}

export interface ClientLeagueView {
  league: League;
  mySwipes: Swipe[];
  matches: Match[];
  deletedMatches?: Match[];
  matchFound?: Match | null;
}


