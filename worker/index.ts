interface Env {
  SESSIONS: DurableObjectNamespace;
}

interface RoomState {
  value: unknown;
  updatedAt: string;
}

type ClientMessage =
  | { type: 'replace'; value: unknown }
  | { type: 'score'; matchId: string; scoreA: number; scoreB: number };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]+)$/);

    if (url.pathname === '/') {
      return Response.json({ service: 'super-badmin-api', status: 'ok' });
    }

    if (!match) {
      return Response.json({ error: 'Use /room/:roomId' }, { status: 404 });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'WebSocket upgrade required' }, { status: 426 });
    }

    const roomId = env.SESSIONS.idFromName(match[1]);
    return env.SESSIONS.get(roomId).fetch(request);
  },
};

export class SessionRoom {
  private readonly sockets = new Set<WebSocket>();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sockets.add(server);

    server.addEventListener('message', (event) => {
      void this.handleMessage(server, String(event.data));
    });
    server.addEventListener('close', () => this.sockets.delete(server));
    server.addEventListener('error', () => this.sockets.delete(server));

    const stored = await this.state.storage.get<RoomState>('room');
    if (stored) server.send(JSON.stringify({ type: 'state', ...stored }));

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(socket: WebSocket, raw: string) {
    try {
      const message = JSON.parse(raw) as ClientMessage;
      if (message.type === 'replace') {
        await this.replace(message.value);
        return;
      }
      if (message.type === 'score') {
        await this.updateScore(message);
        return;
      }
      socket.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  }

  private async replace(value: unknown) {
    const room = { value, updatedAt: new Date().toISOString() } satisfies RoomState;
    await this.state.storage.put('room', room);
    this.broadcast({ type: 'state', ...room });
  }

  private async updateScore(message: Extract<ClientMessage, { type: 'score' }>) {
    const room = await this.state.storage.get<RoomState>('room');
    if (!room || !isSessionValue(room.value)) return;

    const matches = room.value.matches.map((match) =>
      match.id === message.matchId
        ? { ...match, scoreA: message.scoreA, scoreB: message.scoreB }
        : match
    );
    await this.replace({ ...room.value, matches });
  }

  private broadcast(message: unknown) {
    const serialized = JSON.stringify(message);
    for (const socket of this.sockets) {
      try {
        socket.send(serialized);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
}

function isSessionValue(value: unknown): value is { matches: Array<{ id: string }> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'matches' in value &&
    Array.isArray(value.matches)
  );
}