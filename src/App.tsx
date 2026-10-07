import { useEffect, useMemo, useRef, useState } from 'react';
import playersData from './data/players.json';
import { generateSchedule } from './scheduler';
import { Category, Match, Player, PlayerStats, Session } from './types';
import { LiveMessage, LiveStatus, liveSocketUrl } from './utils/liveSession';
import {
  clearLegacySession,
  clearSession,
  emptyStats,
  loadPlayers,
  loadSession,
  savePlayers,
  saveSession,
} from './utils/storage';
const cats: Category[] = ['MD', 'XD', 'WD', 'Random'];
function activePlayers(players: Player[]) {
  return players.filter((p) => !p.disabled);
}
function baseMatchesWithScores(session: Session): Match[] {
  const scoredMatches = new Map(session.matches.map((match) => [match.id, match]));
  return (session.baseMatches ?? session.matches).map((match) => {
    const scored = scoredMatches.get(match.id);
    return scored
      ? { ...match, scoreA: scored.scoreA ?? match.scoreA, scoreB: scored.scoreB ?? match.scoreB }
      : match;
  });
}
function pruneInactivePlayers(session: Session, players: Player[]): Session {
  const baseMatches = baseMatchesWithScores(session);
  const activeNames = new Set(activePlayers(players).map((p) => p.name));
  const matches = baseMatches
    .map((match) => {
      if (match.scoreA != null && match.scoreB != null) return match;
      const teamA = match.teamA.filter((name) => activeNames.has(name)) as [string, string];
      const teamB = match.teamB.filter((name) => activeNames.has(name)) as [string, string];
      if (teamA.length < 2 || teamB.length < 2) return null;
      return { ...match, teamA, teamB };
    })
    .filter((match): match is Match => match !== null);
  return { ...session, matches, baseMatches, stats: statsForMatches(matches, activePlayers(players)) };
}
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
  const [viewerMode, setViewerMode] = useState(
    () => new URLSearchParams(location.search).get('mode') === 'view'
  );
  const [session, setSession] = useState<Session | null>(() =>
    new URLSearchParams(location.search).get('room')?.trim() ? null : loadSession()
  );
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
  const didInitialScheduleScroll = useRef(false);
  useEffect(() => {
    if (!roomId.trim()) {
      setLiveStatus('disconnected');
      return;
    }
    clearLegacySession();
    setSession(null);
    setLiveStatus('connecting');
    const connection = new WebSocket(liveSocketUrl(roomId.trim()));
    socket.current = connection;
    connection.onopen = () => {
      if (socket.current === connection) setLiveStatus('connected');
    };
    connection.onmessage = (event) => {
      if (socket.current !== connection) return;
      const message = JSON.parse(event.data) as { type: string; value?: Session | null };
      if (message.type !== 'state') return;
      if (!message.value) {
        setSession(null);
        return;
      }
      const baseMatches = message.value.baseMatches ?? message.value.matches;
      const nextPlayers = message.value.players ?? playersRef.current;
      const next = {
        ...message.value,
        players: nextPlayers,
        baseMatches,
        stats: statsForMatches(message.value.matches, nextPlayers),
      };
      setPlayers(nextPlayers);
      if (!viewerMode) savePlayers(nextPlayers);
      setSession(next);
    };
    connection.onerror = () => {
      if (socket.current === connection) setLiveStatus('disconnected');
    };
    connection.onclose = () => {
      if (socket.current !== connection) return;
      socket.current = null;
      setLiveStatus('disconnected');
    };
    return () => {
      connection.close();
      if (socket.current === connection) socket.current = null;
    };
  }, [roomId, viewerMode]);
  const sendLive = (message: LiveMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  };
  const save = (s: Session) => {
    const full = { ...s, players, baseMatches: s.baseMatches ?? s.matches };
    setSession(full);
    if (!roomId.trim()) saveSession(full);
    sendLive({ type: 'replace', value: full });
  };
  const updatePlayers = (next: Player[]) => {
    setPlayers(next);
    savePlayers(next);
    if (session) {
      const merged = { ...session, players: next };
      setSession(merged);
      if (!roomId.trim()) saveSession(merged);
      sendLive({ type: 'replace', value: merged });
    }
  };
  const generate = () => {
    const active = activePlayers(players);
    const ms = generateSchedule(active, rounds, courts, selected);
    save({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      courts,
      rounds,
      categories: selected,
      matches: ms,
      players,
      baseMatches: ms,
      stats: emptyStats(active.map((p) => p.name)),
    });
  };
  const score = (id: string, a: number, b: number) => {
    if (!session) return;
    const baseMatches = session.baseMatches ?? session.matches;
    const ms = session.matches.map((m) => (m.id === id ? { ...m, scoreA: a, scoreB: b } : m));
    const next = {
      ...session,
      matches: ms,
      baseMatches: baseMatches.map((m) => (m.id === id ? { ...m, scoreA: a, scoreB: b } : m)),
      stats: statsForMatches(ms, players),
    };
    setSession(next);
    if (!roomId.trim()) saveSession(next);
    sendLive({ type: 'score', matchId: id, scoreA: a, scoreB: b });
  };
  const joinRoom = () => {
    const nextRoom = roomInput.trim().replace(/[^A-Za-z0-9_-]/g, '');
    if (!nextRoom) return;
    setRoomInput(nextRoom);
    if (nextRoom !== roomId.trim()) {
      setSession(null);
      clearLegacySession();
      setRoomId(nextRoom);
    }
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('room', nextRoom);
    if (viewerMode) nextUrl.searchParams.set('mode', 'view');
    else nextUrl.searchParams.delete('mode');
    history.replaceState(null, '', nextUrl);
  };
  const toggleViewerMode = () => {
    const nextViewerMode = !viewerMode;
    const url = new URL(location.href);
    if (nextViewerMode) url.searchParams.set('mode', 'view');
    else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
    setViewerMode(nextViewerMode);
  };
  const reset = () => {
    if (confirm('Reset current session?')) {
      setSession(null);
      if (roomId.trim()) {
        sendLive({ type: 'replace', value: null });
      } else {
        clearSession();
      }
    }
  };
  const reschedule = () => {
    if (!session || !confirm('Reschedule all unplayed matches? Completed scores will be kept.')) return;
    const baseMatches = baseMatchesWithScores(session);
    const completed = baseMatches.filter((match) => match.scoreA != null && match.scoreB != null);
    const firstPendingRound = Math.min(
      ...baseMatches
        .filter((match) => match.scoreA == null || match.scoreB == null)
        .map((match) => match.round),
      session.rounds
    );
    const replacements = generateSchedule(
      activePlayers(players),
      session.rounds - firstPendingRound + 1,
      session.courts,
      session.categories,
      completed,
      firstPendingRound
    );
    const matches = [...completed, ...replacements].sort(
      (a, b) => a.round - b.round || a.court - b.court
    );
    save({
      ...session,
      matches,
      baseMatches: matches,
      players,
      stats: statsForMatches(matches, players),
    });
  };
  const visibleSession = useMemo(() => (session ? pruneInactivePlayers(session, players) : null), [session, players]);
  const hasUnplayedMatches = !!session &&
    (session.baseMatches ?? session.matches).some(
      (match) => match.scoreA == null || match.scoreB == null
    );
  useEffect(() => {
    if (!visibleSession || tab !== 'schedule' || didInitialScheduleScroll.current) return;
    didInitialScheduleScroll.current = true;
    const firstUnscored = visibleSession.matches.find(
      (match) => match.scoreA == null || match.scoreB == null
    );
    if (!firstUnscored) return;
    requestAnimationFrame(() => {
      document.getElementById(`match-${firstUnscored.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [visibleSession, tab]);
  return (
    <div className="app">
      <header>
        <div>
          <b>🏸 SUPER-BADMIN</b>
          <small>Casual badminton matchmaker</small>
        </div>
        <div className="live-status">
          {viewerMode ? `Viewer · ${roomId || 'Local session'}` : roomId ? `${liveStatus} · ${roomId}` : 'Editor · Local session'}
        </div>
        {roomId.trim() && (
          <button className="mode-toggle" onClick={toggleViewerMode}>
            Switch to {viewerMode ? 'editor' : 'viewer'}
          </button>
        )}
        {!viewerMode && session && (
          <>
            <button
              className="reschedule"
              onClick={reschedule}
              disabled={
                !hasUnplayedMatches ||
                (!!roomId.trim() && liveStatus !== 'connected')
              }
            >
              Reschedule
            </button>
            <button
              className="danger"
              onClick={reset}
              disabled={!!roomId.trim() && liveStatus !== 'connected'}
            >
              Reset
            </button>
          </>
        )}
      </header>
      <nav>
        {(['schedule', 'leaderboard', 'players'] as const).map((x) => (
          <button className={tab === x ? 'active' : ''} onClick={() => setTab(x)} key={x}>
            {x}
          </button>
        ))}
      </nav>
      <main className={visibleSession && tab === 'schedule' ? 'has-round-nav' : ''}>
        {!viewerMode && (
          <div className="room-controls card">
            <label>
              Shared room
              <input value={roomInput} placeholder="e.g. friday-night" onChange={(e) => setRoomInput(e.target.value)} />
            </label>
            <button onClick={joinRoom}>Join room</button>
          </div>
        )}
        {!session && (
          viewerMode ? (
            <section className="card setup">
              <h1>No active session</h1>
              <p>There is no schedule in this room yet. The session will appear here when the editor creates one.</p>
            </section>
          ) : (
            <section className="card setup">
              <h1>Create session</h1>
              <p>
                {activePlayers(players).length} players · {courts} courts · doubles only. Rating balance is prioritized, then
                partner/opponent variety and playing load. Random allows any player pairing.
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
              <button
                className="primary"
                disabled={!selected.length || (!!roomId.trim() && liveStatus !== 'connected')}
                onClick={generate}
              >
                Generate {rounds * courts} games
              </button>
            </section>
          )
        )}
        {visibleSession && tab === 'schedule' && (
          <>
            <RoundNavigator matches={visibleSession.matches} />
            <Schedule session={visibleSession} onScore={score} readOnly={viewerMode} />
          </>
        )}{' '}
        {visibleSession && tab === 'leaderboard' && <Leaderboard players={players} stats={visibleSession.stats} />}{' '}
        {tab === 'players' && (
          <Players
            players={players}
            onChange={updatePlayers}
            hasSession={!!session}
            readOnly={viewerMode}
          />
        )}
      </main>
    </div>
  );
}
function Schedule({
  session,
  onScore,
  readOnly,
}: {
  session: Session;
  onScore: (id: string, a: number, b: number) => void;
  readOnly: boolean;
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
        <section className="round" id={`round-${r}`} key={r}>
          <div className="round-title">
            <h2>Round {r}</h2>
            <span>{ms.length} courts</span>
          </div>
          <div className="courts">
            {ms.map((m) => (
              <MatchCard key={m.id} match={m} onScore={onScore} readOnly={readOnly} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
function RoundNavigator({ matches }: { matches: Match[] }) {
  const rounds = [...new Set(matches.map((match) => match.round))];
  if (rounds.length < 2) return null;
  return (
    <aside className="round-nav" aria-label="Jump to round">
      {rounds.map((round) => (
        <button
          key={round}
          aria-label={`Jump to round ${round}`}
          title={`Round ${round}`}
          onClick={() =>
            document.getElementById(`round-${round}`)?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }
        >
          {round}
        </button>
      ))}
    </aside>
  );
}
function MatchCard({
  match,
  onScore,
  readOnly,
}: {
  match: Match;
  onScore: (id: string, a: number, b: number) => void;
  readOnly: boolean;
}) {
  const [a, setA] = useState(match.scoreA?.toString() ?? '');
  const [b, setB] = useState(match.scoreB?.toString() ?? '');
  useEffect(() => {
    setA(match.scoreA?.toString() ?? '');
    setB(match.scoreB?.toString() ?? '');
  }, [match.id, match.scoreA, match.scoreB]);
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
    <article className="card match" id={`match-${match.id}`}>
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
          readOnly={readOnly}
          aria-label={`Team A score, ${match.teamA.join(' and ')} versus ${match.teamB.join(' and ')}`}
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
          readOnly={readOnly}
          aria-label={`Team B score, ${match.teamB.join(' and ')} versus ${match.teamA.join(' and ')}`}
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
    .filter((x) => x.s.games > 0)
    .sort((a, b) => b.s.pointsFor - a.s.pointsFor || b.s.wins - a.s.wins || b.s.diff - a.s.diff);
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
              <th className="points-column" title="Total points scored">Point</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={x.p.name} className={x.p.disabled ? 'inactive-row' : ''}>
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
                <td className="points-column">{x.s.pointsFor}</td>
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
  readOnly,
}: {
  players: Player[];
  onChange: (players: Player[]) => void;
  hasSession: boolean;
  readOnly: boolean;
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
        <p>
          {readOnly
            ? 'Viewing the player roster. Only the editor can make changes.'
            : 'Changes are saved in this browser and apply when you generate or reschedule a session.'}
        </p>
        {!readOnly && hasSession && <p className="notice">Completed matches stay unchanged. Use Reschedule to update unplayed games after changing player availability.</p>}
      </div>
      <div className="players">
        {players.map((p, index) => (
          <div key={index} className="player-row">
            <strong aria-label={`Player number ${index + 1}`}>{index + 1}</strong>
            <span>
              <input aria-label={`Player ${index + 1} name`} value={p.name} readOnly={readOnly} onChange={(e) => update(index, { name: e.target.value })} />
              <small>{p.gender === 'F' ? 'Female' : 'Male'}</small>
            </span>
            <label>
              Rating
              <input type="number" min="1" max="5" value={p.rating} readOnly={readOnly} onChange={(e) => update(index, { rating: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
            </label>
            <label>
              Gender
              <select value={p.gender} disabled={readOnly} onChange={(e) => update(index, { gender: e.target.value as Player['gender'] })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </label>
            {!readOnly && (
              <>
                <button
                  className={p.disabled ? 'toggle inactive' : 'toggle'}
                  onClick={() => update(index, { disabled: !p.disabled })}
                >
                  {p.disabled ? 'Disabled' : 'Active'}
                </button>
                <button className="remove" aria-label={`Remove ${p.name || 'player'}`} onClick={() => remove(index)}>Remove</button>
              </>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="section player-actions">
          <button className="primary" onClick={() => onChange([...players, { name: 'New player', rating: 3, gender: 'M' }])}>
            Add player
          </button>
        </div>
      )}
    </section>
  );
}
