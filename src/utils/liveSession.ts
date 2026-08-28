import { Session } from '../types';

export type LiveStatus = 'connecting' | 'connected' | 'disconnected';

export type LiveMessage =
  | { type: 'replace'; value: Session }
  | { type: 'score'; matchId: string; scoreA: number; scoreB: number };

export function liveSocketUrl(roomId: string) {
  const configuredUrl =
    import.meta.env.VITE_LIVE_API_URL ||
    (import.meta.env.DEV ? 'http://localhost:8787' : 'https://super-badmin-api.super-badmin.workers.dev');
  const url = new URL(configuredUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/room/${encodeURIComponent(roomId)}`;
  return url.toString();
}