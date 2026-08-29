export type Gender = 'M' | 'F';
export type Category = 'MD' | 'XD' | 'WD';
export interface Player {
  name: string;
  rating: number;
  gender: Gender;
  disabled?: boolean;
}
export interface PlayerStats {
  games: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
}
export interface Match {
  id: string;
  round: number;
  court: number;
  category: Category;
  teamA: [string, string];
  teamB: [string, string];
  scoreA?: number;
  scoreB?: number;
}
export interface Session {
  id: string;
  createdAt: string;
  courts: number;
  rounds: number;
  categories: Category[];
  matches: Match[];
  players?: Player[];
  baseMatches?: Match[];
  stats: Record<string, PlayerStats>;
}
