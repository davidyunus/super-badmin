import { Category, Match, Player } from './types';
type Pair = [Player, Player];
interface Candidate {
  category: Category;
  teamA: Pair;
  teamB: Pair;
  score: number;
}
const key = (a: string, b: string) => [a, b].sort().join('|');
const teamKey = (t: Pair) => key(t[0].name, t[1].name);
function combos<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  const go = (i: number, a: T[]) => {
    if (a.length === n) {
      out.push([...a]);
      return;
    }
    for (let j = i; j < xs.length; j++) {
      a.push(xs[j]);
      go(j + 1, a);
      a.pop();
    }
  };
  go(0, []);
  return out;
}
function rating(t: Pair) {
  return t[0].rating + t[1].rating;
}
function pairs(ps: Player[], c: Category): Pair[] {
  if (c === 'MD')
    return combos(
      ps.filter((p) => p.gender === 'M'),
      2
    ) as Pair[];
  if (c === 'WD')
    return combos(
      ps.filter((p) => p.gender === 'F'),
      2
    ) as Pair[];
  if (c === 'Random') return combos(ps, 2) as Pair[];
  return ps
    .filter((p) => p.gender === 'M')
    .flatMap((m) => ps.filter((p) => p.gender === 'F').map((f) => [m, f] as Pair));
}
function candidates(ps: Player[], c: Category) {
  const ps2 = pairs(ps, c),
    out: Candidate[] = [];
  for (let i = 0; i < ps2.length; i++)
    for (let j = i + 1; j < ps2.length; j++) {
      const a = ps2[i],
        b = ps2[j],
        names = new Set([a[0].name, a[1].name, b[0].name, b[1].name]);
      if (names.size < 4) continue;
      const d = Math.abs(rating(a) - rating(b));
      if (d > 1) continue;
      out.push({ category: c, teamA: a, teamB: b, score: d * 100 + Math.random() * 10 });
    }
  return out;
}
function candidateScore(
  c: Candidate,
  partners: Map<string, number>,
  opps: Map<string, number>,
  recent: Set<string>
) {
  const ns = [c.teamA[0].name, c.teamA[1].name, c.teamB[0].name, c.teamB[1].name];
  let s = c.score;
  s += (partners.get(teamKey(c.teamA)) ?? 0) * 45 + (partners.get(teamKey(c.teamB)) ?? 0) * 45;
  for (const a of c.teamA) for (const b of c.teamB) s += (opps.get(key(a.name, b.name)) ?? 0) * 8;
  s += ns.reduce((x, n) => x + (recent.has(n) ? 30 : 0), 0);
  return s;
}
function compareCandidates(
  a: Candidate,
  b: Candidate,
  games: Record<string, number>,
  partners: Map<string, number>,
  opps: Map<string, number>,
  recent: Set<string>
) {
  const loads = (candidate: Candidate) =>
    [candidate.teamA[0], candidate.teamA[1], candidate.teamB[0], candidate.teamB[1]]
      .map((player) => games[player.name] ?? 0)
      .sort((x, y) => y - x);
  const aLoads = loads(a);
  const bLoads = loads(b);
  for (let i = 0; i < aLoads.length; i++) {
    if (aLoads[i] !== bLoads[i]) return aLoads[i] - bLoads[i];
  }
  return (
    candidateScore(a, partners, opps, recent) -
    candidateScore(b, partners, opps, recent)
  );
}
export function generateSchedule(
  players: Player[],
  rounds: number,
  courts: number,
  cats: Category[]
): Match[] {
  const activePlayers = players.filter((p) => !p.disabled);
  const all: Match[] = [];
  const g: Record<string, number> = Object.fromEntries(activePlayers.map((p) => [p.name, 0]));
  const partners = new Map<string, number>(),
    opps = new Map<string, number>();
  let recent = new Set<string>();
  const selectedCategories = [...new Set(cats)];
  const candidatePool = selectedCategories.flatMap((category) =>
    candidates(activePlayers, category)
  );
  for (let r = 1; r <= rounds; r++) {
    const used = new Set<string>(),
      matches: Match[] = [];
    while (matches.length < courts) {
      let x: Candidate | undefined;
      for (const candidate of candidatePool) {
        const names = [
          candidate.teamA[0].name,
          candidate.teamA[1].name,
          candidate.teamB[0].name,
          candidate.teamB[1].name,
        ];
        if (names.some((name) => used.has(name))) continue;
        const comparison = x ? compareCandidates(candidate, x, g, partners, opps, recent) : -1;
        if (comparison < 0) {
          x = candidate;
        }
      }
      if (!x) break;

      const m: Match = {
        id: crypto.randomUUID(),
        round: r,
        court: matches.length + 1,
        category: x.category,
        teamA: [x.teamA[0].name, x.teamA[1].name],
        teamB: [x.teamB[0].name, x.teamB[1].name],
      };
      matches.push(m);
      const ns = [...m.teamA, ...m.teamB];
      ns.forEach((n) => {
        used.add(n);
        g[n]++;
      });
      partners.set(teamKey(x.teamA), (partners.get(teamKey(x.teamA)) ?? 0) + 1);
      partners.set(teamKey(x.teamB), (partners.get(teamKey(x.teamB)) ?? 0) + 1);
      for (const a of x.teamA)
        for (const b of x.teamB)
          opps.set(key(a.name, b.name), (opps.get(key(a.name, b.name)) ?? 0) + 1);
    }
    all.push(...matches);
    recent = used;
  }
  return all;
}
