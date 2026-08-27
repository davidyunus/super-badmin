import { useMemo, useState } from 'react';
import playersData from './data/players.json';
import { generateSchedule } from './scheduler';
import { Category, Match, Player, PlayerStats, Session } from './types';
import { clearSession, emptyStats, loadSession, saveSession } from './utils/storage';
const players = playersData as Player[];
const cats: Category[] = ['MD', 'XD', 'WD'];
const rating = (n: string) => players.find((p) => p.name === n)?.rating ?? 0;
function statsForMatches(ms: Match[]) {
  const s = emptyStats(players.map((p) => p.name));
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
  const [rounds, setRounds] = useState(20);
  const [courts, setCourts] = useState(3);
  const [selected, setSelected] = useState<Category[]>(cats);
  const [tab, setTab] = useState<'schedule' | 'leaderboard' | 'players'>('schedule');
  const save = (s: Session) => {
    setSession(s);
    saveSession(s);
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
    save({ ...session, matches: ms, stats: statsForMatches(ms) });
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
        {!session && (
          <section className="card setup">
            <h1>Create session</h1>
            <p>
              23 players · 3 courts · doubles only. Rating balance is prioritized, then
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
        {session && tab === 'leaderboard' && <Leaderboard stats={session.stats} />}{' '}
        {tab === 'players' && <Players />}
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
  const save = () => {
    const x = Number(a),
      y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0) onScore(match.id, x, y);
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
          onChange={(e) => setA(e.target.value)}
        />
        <span>—</span>
        <input
          inputMode="numeric"
          value={b}
          placeholder="0"
          onChange={(e) => setB(e.target.value)}
        />
        <button onClick={save}>Save</button>
      </div>
    </article>
  );
}
function Leaderboard({ stats }: { stats: Record<string, PlayerStats> }) {
  const rows = players
    .map((p) => ({ p, s: stats[p.name] }))
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
function Players() {
  return (
    <section className="card">
      <div className="section">
        <h1>Players</h1>
        <p>
          Edit <code>src/data/players.json</code> to change the roster.
        </p>
      </div>
      <div className="players">
        {players.map((p) => (
          <div key={p.name}>
            <span>
              <b>{p.name}</b>
              <small>{p.gender === 'F' ? 'Female' : 'Male'}</small>
            </span>
            <strong>{p.rating}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
