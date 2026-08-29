import { Category, Match, Player } from './types';
type Pair = [Player, Player];
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
function shuffle<T>(xs: T[]) {
  return [...xs].sort(() => Math.random() - 0.5);
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
  return ps
    .filter((p) => p.gender === 'M')
    .flatMap((m) => ps.filter((p) => p.gender === 'F').map((f) => [m, f] as Pair));
}
function candidates(ps: Player[], c: Category) {
  const ps2 = pairs(ps, c),
    out: { category: Category; teamA: Pair; teamB: Pair; score: number }[] = [];
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
  c: any,
  g: Record<string, number>,
  partners: Map<string, number>,
  opps: Map<string, number>,
  recent: Set<string>
) {
  const ns = [c.teamA[0].name, c.teamA[1].name, c.teamB[0].name, c.teamB[1].name];
  let s = c.score + ns.reduce((x, n) => x + (g[n] ?? 0) * 7, 0);
  s += (partners.get(teamKey(c.teamA)) ?? 0) * 45 + (partners.get(teamKey(c.teamB)) ?? 0) * 45;
  for (const a of c.teamA) for (const b of c.teamB) s += (opps.get(key(a.name, b.name)) ?? 0) * 8;
  s += ns.reduce((x, n) => x + (recent.has(n) ? 30 : 0), 0);
  return s;
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
  for (let r = 1; r <= rounds; r++) {
    const used = new Set<string>(),
      matches: Match[] = [];
    for (const c of shuffle(cats)) {
      if (matches.length >= courts) break;
      const cs = candidates(activePlayers, c).sort(
        (a, b) =>
          candidateScore(a, g, partners, opps, recent) -
          candidateScore(b, g, partners, opps, recent)
      );
      for (const x of cs) {
        const ns = [x.teamA[0].name, x.teamA[1].name, x.teamB[0].name, x.teamB[1].name];
        if (ns.some((n) => used.has(n))) continue;
        const m: Match = {
          id: crypto.randomUUID(),
          round: r,
          court: matches.length + 1,
          category: c,
          teamA: [x.teamA[0].name, x.teamA[1].name],
          teamB: [x.teamB[0].name, x.teamB[1].name],
        };
        matches.push(m);
        ns.forEach((n) => {
          used.add(n);
          g[n]++;
        });
        partners.set(teamKey(x.teamA), (partners.get(teamKey(x.teamA)) ?? 0) + 1);
        partners.set(teamKey(x.teamB), (partners.get(teamKey(x.teamB)) ?? 0) + 1);
        for (const a of x.teamA)
          for (const b of x.teamB)
            opps.set(key(a.name, b.name), (opps.get(key(a.name, b.name)) ?? 0) + 1);
        if (matches.length >= courts) break;
      }
    }
    while (matches.length < courts) {
      let added = false;
      for (const c of shuffle(cats)) {
        const cs = candidates(activePlayers, c).sort(
          (a, b) =>
            candidateScore(a, g, partners, opps, recent) -
            candidateScore(b, g, partners, opps, recent)
        );
        const x = cs.find((z) =>
          [z.teamA[0].name, z.teamA[1].name, z.teamB[0].name, z.teamB[1].name].every(
            (n) => !used.has(n)
          )
        );
        if (!x) continue;
        const m: Match = {
          id: crypto.randomUUID(),
          round: r,
          court: matches.length + 1,
          category: c,
          teamA: [x.teamA[0].name, x.teamA[1].name],
          teamB: [x.teamB[0].name, x.teamB[1].name],
        };
        matches.push(m);
        const ns = [...m.teamA, ...m.teamB];
        ns.forEach((n) => {
          used.add(n);
          g[n]++;
        });
        added = true;
        break;
      }
      if (!added) break;
    }
    all.push(...matches);
    recent = used;
  }
  return all;
}
