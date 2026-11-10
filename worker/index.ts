interface Env {
  SESSIONS: DurableObjectNamespace;
}

interface RoomState {
  value: unknown;
  updatedAt: string;
  processedScoreIds?: string[];
}

type ClientMessage =
  | { type: 'replace'; value: unknown }
  | {
      type: 'score';
      requestId: string;
      sessionId: string;
      matchId: string;
      scoreA: number;
      scoreB: number;
    };

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
    server.send(
      JSON.stringify(
        stored
          ? { type: 'state', value: stored.value, updatedAt: stored.updatedAt }
          : { type: 'state', value: null }
      )
    );

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
        if (
          typeof message.requestId !== 'string' ||
          message.requestId.length === 0 ||
          message.requestId.length > 128 ||
          typeof message.sessionId !== 'string' ||
          typeof message.matchId !== 'string' ||
          !Number.isFinite(message.scoreA) ||
          !Number.isFinite(message.scoreB) ||
          message.scoreA < 0 ||
          message.scoreB < 0
        ) {
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid score update' }));
          return;
        }
        await this.updateScore(socket, message);
        return;
      }
      socket.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  }

  private async replace(value: unknown) {
    const room = await this.state.storage.transaction(async (transaction) => {
      const current = await transaction.get<RoomState>('room');
      const next = {
        value,
        updatedAt: new Date().toISOString(),
        processedScoreIds: current?.processedScoreIds ?? [],
      } satisfies RoomState;
      await transaction.put('room', next);
      return next;
    });
    this.broadcast({ type: 'state', value: room.value, updatedAt: room.updatedAt });
  }

  private async updateScore(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: 'score' }>
  ) {
    const result = await this.state.storage.transaction(async (transaction) => {
      const room = await transaction.get<RoomState>('room');
      if (!room || !isSessionValue(room.value) || room.value.id !== message.sessionId) {
        return {
          room: null,
          duplicate: false,
          error: 'The room session changed before this score was saved.',
        };
      }
      const processedScoreIds = room.processedScoreIds ?? [];
      if (processedScoreIds.includes(message.requestId)) {
        return { room, duplicate: true, error: null };
      }
      if (!room.value.matches.some((match) => match.id === message.matchId)) {
        return {
          room: null,
          duplicate: false,
          error: 'This match is no longer in the room schedule.',
        };
      }

      const updateMatches = (matches: Array<{ id: string }>) =>
        matches.map((match) =>
          match.id === message.matchId
            ? { ...match, scoreA: message.scoreA, scoreB: message.scoreB }
            : match
        );
      const value = {
        ...room.value,
        matches: updateMatches(room.value.matches),
        ...(Array.isArray(room.value.baseMatches)
          ? { baseMatches: updateMatches(room.value.baseMatches) }
          : {}),
      };
      const nextRoom = {
        ...room,
        value,
        updatedAt: new Date().toISOString(),
        processedScoreIds: [...processedScoreIds, message.requestId].slice(-1000),
      } satisfies RoomState;
      await transaction.put('room', nextRoom);
      return { room: nextRoom, duplicate: false, error: null };
    });

    if (!result.room) {
      socket.send(
        JSON.stringify({
          type: 'error',
          requestId: message.requestId,
          message: result.error,
        })
      );
      return;
    }

    socket.send(JSON.stringify({ type: 'ack', requestId: message.requestId }));
    if (!result.duplicate) {
      this.broadcast({
        type: 'state',
        value: result.room.value,
        updatedAt: result.room.updatedAt,
      });
    }
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

function isSessionValue(
  value: unknown
): value is {
  id: string;
  matches: Array<{ id: string }>;
  baseMatches?: Array<{ id: string }>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'matches' in value &&
    Array.isArray(value.matches)
  );
}