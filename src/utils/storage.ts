import { PlayerStats, Session } from '../types';
const KEY = 'super-badmin-session-v1';
export function loadSession(): Session | null {
  try {
    const x = localStorage.getItem(KEY);
    return x ? JSON.parse(x) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
export function clearSession() {
  localStorage.removeItem(KEY);
}
export function emptyStats(names: string[]): Record<string, PlayerStats> {
  return Object.fromEntries(
    names.map((n) => [n, { games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 }])
  );
}
