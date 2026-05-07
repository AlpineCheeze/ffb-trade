export interface Player {
  id: string;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';
  team: string;
  elo: number;
  votes_count: number;
}

export interface TradeProposal {
  id: string;
  give_player_ids: string[];
  get_player_ids: string[];
  creator_id?: string;
  created_at?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  team_player_ids: string[];
  active_league_id?: string;
}

export interface League {
  id: string;
  name: string;
  creator_id: string;
  members: string[];
  created_at: string;
}

export interface PlayerStats {
  elo: number;
  votes_count: number;
}

export interface UserVote {
  trade_id: string;
  user_id: string;
  league_id: string;
  trade_players: {
    give: string[];
    get: string[];
  };
  choice: 'YES' | 'NO';
  score: number;
  label: string;
  timestamp: string;
}

export interface Match {
  id: string;
  league_id: string;
  user_a_id: string;
  user_b_id: string;
  user_a_email: string;
  user_b_email: string;
  player_ids_a: string[];
  player_ids_b: string[];
  timestamp: string;
}
