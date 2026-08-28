import { useEffect, useMemo, useRef, useState } from 'react';
import playersData from './data/players.json';
import { generateSchedule } from './scheduler';
import { Category, Match, Player, PlayerStats, Session } from './types';
import { LiveMessage, LiveStatus, liveSocketUrl } from './utils/liveSession';
import { clearSession, emptyStats, loadPlayers, loadSession, savePlayers, saveSession } from './utils/storage';
const cats: Category[] = ['MD', 'XD', 'WD'];
function statsForMatches(ms: Match[], players: Player[]) {
  const names = new Set(players.map((p) => p.name));
  ms.forEach((m) => [...m.teamA, ...m.teamB].forEach((name) => names.add(name)));
  const s = emptyStats([...names]);
  for (const m of ms) {
    if (m.scoreA == null || m.scoreB == null) continue;
    const aw = m.scoreA > m.scoreB;
    for (const n of m.teamA) {
      s[n].games++;
      s[n].pointsFor += m.scoreA;
      s[n].pointsAgainst += m.scoreB;
      s[n].diff += m.scoreA - m.scoreB;
      aw ? s[n].wins++ : s[n].losses++;
    }
    for (const n of m.teamB) {
      s[n].games++;
      s[n].pointsFor += m.scoreB;
      s[n].pointsAgainst += m.scoreA;
      s[n].diff += m.scoreB - m.scoreA;
      aw ? s[n].losses++ : s[n].wins++;
    }
  }
  return s;
}
export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [players, setPlayers] = useState<Player[]>(() => loadPlayers(playersData as Player[]));
  const [rounds, setRounds] = useState(20);
  const [courts, setCourts] = useState(3);
  const [selected, setSelected] = useState<Category[]>(cats);
  const [tab, setTab] = useState<'schedule' | 'leaderboard' | 'players'>('schedule');
  const [roomId, setRoomId] = useState(() => new URLSearchParams(location.search).get('room') ?? '');
  const [roomInput, setRoomInput] = useState(() => new URLSearchParams(location.search).get('room') ?? '');
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('disconnected');
  const socket = useRef<WebSocket | null>(null);
  const playersRef = useRef(players);
  playersRef.current = players;
  useEffect(() => {
    if (!roomId.trim()) {
      setLiveStatus('disconnected');
      return;
    }
    setLiveStatus('connecting');
    const connection = new WebSocket(liveSocketUrl(roomId.trim()));
    socket.current = connection;
    connection.onopen = () => setLiveStatus('connected');
    connection.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; value?: Session };
      if (message.type !== 'state' || !message.value) return;
      const next = {
        ...message.value,
        stats: statsForMatches(message.value.matches, playersRef.current),
      };
      setSession(next);
      saveSession(next);
    };
    connection.onerror = () => setLiveStatus('disconnected');
    connection.onclose = () => {
      if (socket.current === connection) socket.current = null;
      setLiveStatus('disconnected');
    };
    return () => {
      connection.close();
      if (socket.current === connection) socket.current = null;
    };
  }, [roomId]);
  const sendLive = (message: LiveMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  };
  const save = (s: Session) => {
    setSession(s);
    saveSession(s);
    sendLive({ type: 'replace', value: s });
  };
  const updatePlayers = (next: Player[]) => {
    setPlayers(next);
    savePlayers(next);
  };
  const generate = () => {
    const ms = generateSchedule(players, rounds, courts, selected);
    save({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      courts,
      rounds,
      categories: selected,
      matches: ms,
      stats: emptyStats(players.map((p) => p.name)),
    });
  };
  const score = (id: string, a: number, b: number) => {
    if (!session) return;
    const ms = session.matches.map((m) => (m.id === id ? { ...m, scoreA: a, scoreB: b } : m));
    const next = { ...session, matches: ms, stats: statsForMatches(ms, players) };
    setSession(next);
    saveSession(next);
    sendLive({ type: 'score', matchId: id, scoreA: a, scoreB: b });
  };
  const joinRoom = () => {
    const nextRoom = roomInput.trim().replace(/[^A-Za-z0-9_-]/g, '');
    if (!nextRoom) return;
    setRoomInput(nextRoom);
    setRoomId(nextRoom);
    history.replaceState(null, '', `?room=${encodeURIComponent(nextRoom)}`);
  };
  const reset = () => {
    if (confirm('Reset current session?')) {
      clearSession();
      setSession(null);
    }
  };
  return (
    <div className="app">
      <header>
        <div>
          <b>🏸 SUPER-BADMIN</b>
          <small>Casual badminton matchmaker</small>
        </div>
        <div className="live-status">
          {roomId ? `${liveStatus} · ${roomId}` : 'Local session'}
        </div>
        {session && (
          <button className="danger" onClick={reset}>
            Reset
          </button>
        )}
      </header>
      <nav>
        {(['schedule', 'leaderboard', 'players'] as const).map((x) => (
          <button className={tab === x ? 'active' : ''} onClick={() => setTab(x)} key={x}>
            {x}
          </button>
        ))}
      </nav>
      <main>
        <div className="room-controls card">
          <label>
            Shared room
            <input value={roomInput} placeholder="e.g. friday-night" onChange={(e) => setRoomInput(e.target.value)} />
          </label>
          <button onClick={joinRoom}>Join room</button>
        </div>
        {!session && (
          <section className="card setup">
            <h1>Create session</h1>
            <p>
              24 players · 3 courts · doubles only. Rating balance is prioritized, then
              partner/opponent variety and playing load.
            </p>
            <div className="grid">
              <label>
                Rounds
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={rounds}
                  onChange={(e) => setRounds(+e.target.value)}
                />
              </label>
              <label>
                Courts
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={courts}
                  onChange={(e) => setCourts(+e.target.value)}
                />
              </label>
            </div>
            <label>
              Categories
              <div className="chips">
                {cats.map((c) => (
                  <button
                    key={c}
                    className={selected.includes(c) ? 'chip on' : 'chip'}
                    onClick={() =>
                      setSelected((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </label>
            <button className="primary" disabled={!selected.length} onClick={generate}>
              Generate {rounds * courts} games
            </button>
          </section>
        )}
        {session && tab === 'schedule' && <Schedule session={session} onScore={score} />}{' '}
        {session && tab === 'leaderboard' && <Leaderboard players={players} stats={session.stats} />}{' '}
        {tab === 'players' && <Players players={players} onChange={updatePlayers} hasSession={!!session} />}
      </main>
    </div>
  );
}
function Schedule({
  session,
  onScore,
}: {
  session: Session;
  onScore: (id: string, a: number, b: number) => void;
}) {
  const rounds = useMemo(() => {
    const m = new Map<number, Match[]>();
    session.matches.forEach((x) => {
      if (!m.has(x.round)) m.set(x.round, []);
      m.get(x.round)!.push(x);
    });
    return [...m];
  }, [session]);
  const done = session.matches.filter((m) => m.scoreA != null && m.scoreB != null).length;
  return (
    <>
      <div className="card summary">
        <div>
          <b>{session.matches.length} games</b>
          <span>
            {session.rounds} rounds · {session.courts} courts
          </span>
        </div>
        <div>
          <b>
            {done}/{session.matches.length}
          </b>
          <span>completed</span>
        </div>
      </div>
      {rounds.map(([r, ms]) => (
        <section className="round" key={r}>
          <div className="round-title">
            <h2>Round {r}</h2>
            <span>{ms.length} courts</span>
          </div>
          <div className="courts">
            {ms.map((m) => (
              <MatchCard key={m.id} match={m} onScore={onScore} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
function MatchCard({
  match,
  onScore,
}: {
  match: Match;
  onScore: (id: string, a: number, b: number) => void;
}) {
  const [a, setA] = useState(match.scoreA?.toString() ?? '');
  const [b, setB] = useState(match.scoreB?.toString() ?? '');
  const updateScore = (nextA: string, nextB: string) => {
    const scoreA = Number(nextA);
    const scoreB = Number(nextB);
    if (
      nextA !== '' &&
      nextB !== '' &&
      Number.isFinite(scoreA) &&
      Number.isFinite(scoreB) &&
      scoreA >= 0 &&
      scoreB >= 0
    ) {
      onScore(match.id, scoreA, scoreB);
    }
  };
  return (
    <article className="card match">
      <div className="top">
        <span className={'cat ' + match.category.toLowerCase()}>{match.category}</span>
        <span>Court {match.court}</span>
      </div>
      <div className="teams">
        <div>
          <b>{match.teamA[0]}</b>
          <b>{match.teamA[1]}</b>
          {/* <em>{ra}</em> */}
        </div>
        <span>VS</span>
        <div className="right">
          <b>{match.teamB[0]}</b>
          <b>{match.teamB[1]}</b>
          {/* <em>{rb}</em> */}
        </div>
      </div>
      <div className="score">
        <input
          inputMode="numeric"
          value={a}
          placeholder="0"
          onChange={(e) => {
            setA(e.target.value);
            updateScore(e.target.value, b);
          }}
        />
        <span>—</span>
        <input
          inputMode="numeric"
          value={b}
          placeholder="0"
          onChange={(e) => {
            setB(e.target.value);
            updateScore(a, e.target.value);
          }}
        />
      </div>
    </article>
  );
}
function Leaderboard({ players, stats }: { players: Player[]; stats: Record<string, PlayerStats> }) {
  const rows = players
    .map((p) => ({ p, s: stats[p.name] ?? emptyStats([p.name])[p.name] }))
    .sort((a, b) => b.s.wins - a.s.wins || b.s.diff - a.s.diff || b.s.pointsFor - a.s.pointsFor);
  return (
    <section className="card">
      <div className="section">
        <h1>Leaderboard</h1>
      </div>
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              {/* <th>R</th> */}
              <th>G</th>
              <th>W-L</th>
              <th>DIFF</th>
              <th>PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={x.p.name}>
                <td>{i + 1}</td>
                <td>
                  <b>{x.p.name}</b>
                </td>
                {/* <td>{x.p.rating}</td> */}
                <td>{x.s.games}</td>
                <td>
                  {x.s.wins}-{x.s.losses}
                </td>
                <td className={x.s.diff >= 0 ? 'pos' : 'neg'}>{x.s.diff}</td>
                <td>{x.s.pointsFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Players({
  players,
  onChange,
  hasSession,
}: {
  players: Player[];
  onChange: (players: Player[]) => void;
  hasSession: boolean;
}) {
  const update = (index: number, changes: Partial<Player>) =>
    onChange(players.map((player, i) => (i === index ? { ...player, ...changes } : player)));
  const remove = (index: number) => {
    if (confirm(`Remove ${players[index].name || 'this player'} from the roster?`)) {
      onChange(players.filter((_, i) => i !== index));
    }
  };
  return (
    <section className="card">
      <div className="section">
        <h1>Players</h1>
        <p>Changes are saved in this browser and apply when you generate a new session.</p>
        {hasSession && <p className="notice">Current matches keep their existing players. Reset the session to generate a new schedule.</p>}
      </div>
      <div className="players">
        {players.map((p, index) => (
          <div key={index} className="player-row">
            <span>
              <input aria-label={`Player ${index + 1} name`} value={p.name} onChange={(e) => update(index, { name: e.target.value })} />
              <small>{p.gender === 'F' ? 'Female' : 'Male'}</small>
            </span>
            <label>
              Rating
              <input type="number" min="1" max="5" value={p.rating} onChange={(e) => update(index, { rating: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
            </label>
            <label>
              Gender
              <select value={p.gender} onChange={(e) => update(index, { gender: e.target.value as Player['gender'] })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </label>
            <button className="remove" aria-label={`Remove ${p.name || 'player'}`} onClick={() => remove(index)}>Remove</button>
          </div>
        ))}
      </div>
      <div className="section player-actions">
        <button className="primary" onClick={() => onChange([...players, { name: 'New player', rating: 3, gender: 'M' }])}>
          Add player
        </button>
      </div>
    </section>
  );
}
