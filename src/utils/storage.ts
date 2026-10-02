import { Player, PlayerStats, Session } from '../types';
const KEY = 'super-badmin-session-v1';
const LOCAL_SESSION_KEY = 'super-badmin-local-session-v1';
const PLAYERS_KEY = 'super-badmin-players-v3';
export function loadSession(): Session | null {
  try {
    const x = localStorage.getItem(LOCAL_SESSION_KEY) ?? localStorage.getItem(KEY);
    if (x && !localStorage.getItem(LOCAL_SESSION_KEY)) {
      localStorage.setItem(LOCAL_SESSION_KEY, x);
      localStorage.removeItem(KEY);
    }
    return x ? JSON.parse(x) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session) {
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(s));
  localStorage.removeItem(KEY);
}
export function clearSession() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  localStorage.removeItem(KEY);
}
export function clearLegacySession() {
  localStorage.removeItem(KEY);
}
export function loadPlayers(fallback: Player[]): Player[] {
  try {
    const x = localStorage.getItem(PLAYERS_KEY);
    return x ? JSON.parse(x) : fallback;
  } catch {
    return fallback;
  }
}
export function savePlayers(players: Player[]) {
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
}
export function emptyStats(names: string[]): Record<string, PlayerStats> {
  return Object.fromEntries(
    names.map((n) => [n, { games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 }])
  );
}
