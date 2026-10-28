// ESPN data: parsing, which match to show (spec 5.1), refresh timing (spec 7.1) and error backoff (spec 8).

export const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export type Side = { name: string; short: string; abbr: string; logo: string; color?: string; score?: number; pen?: number; winner?: boolean };
export type Match = {
  id: string;
  date: string; // ISO, UTC
  league: string;
  state: "pre" | "in" | "post";
  detail: string; // status.type.shortDetail, e.g. 67', HT, FT
  postponed: boolean;
  home: Side;
  away: Side;
  goal?: string; // latest goal line, live only
};

const FRIENDLY = /^(club\.friendly|friendly\..+|esp\.joan_gamper)$/;
const num = (v: any) => (v == null ? undefined : Number(typeof v === "object" ? v.value : v));
const hex = (v: any) => (/^[0-9a-f]{6}$/i.test(v ?? "") ? `#${v}` : undefined);

function side(c: any): Side {
  const logos: any[] = c.team.logos ?? [];
  const logo = logos.find((l) => l.rel.includes("dark")) ?? logos.find((l) => l.rel.includes("default"));
  return {
    name: c.team.displayName,
    short: c.team.shortDisplayName,
    abbr: c.team.abbreviation || String(c.team.shortDisplayName ?? "").slice(0, 3).toUpperCase(), // rows show 3 letters
    logo: logo?.href ?? c.team.logo ?? "",
    color: hex(c.team.color),
    score: num(c.score),
    pen: num(c.shootoutScore),
    winner: c.winner,
  };
}

/** The goal that made the score `total`. ESPN can list a goal a poll before its score counts it; a line ahead of the
 *  score reads as the widget lagging, so the line waits and comes in with the score's roll. */
function goalLine(details: any[] = [], total: number): string | undefined {
  const d = details.filter((d) => d.scoringPlay && !d.shootout)[total - 1];
  if (!d) return;
  const who = (d.athletesInvolved?.[0]?.shortName ?? "").replace(/^(\S+\.\s+)+/, "");
  const tag = d.ownGoal ? " (OG)" : d.penaltyKick ? " (P)" : "";
  return `Goal! ${d.clock?.displayValue ?? ""} ${who}${tag}`.replace(/\s+/g, " ").trim();
}

/** One event from a team schedule or `/all/scoreboard/{id}`. Throws on missing required fields. */
export function parse(e: any, league: string = e.league.abbreviation): Match {
  const c = e.competitions[0];
  const type = (c.status ?? e.status).type;
  const get = (h: string) => side(c.competitors.find((x: any) => x.homeAway === h));
  const [home, away] = [get("home"), get("away")];
  const m: Match = {
    id: e.id,
    date: e.date,
    league,
    state: type.state,
    detail: type.shortDetail,
    postponed: type.name === "STATUS_POSTPONED",
    home,
    away,
    goal: type.state === "in" ? goalLine(c.details, (home.score ?? 0) + (away.score ?? 0)) : undefined,
  };
  if (!m.id || !m.date || !["pre", "in", "post"].includes(m.state)) throw new Error("bad event");
  return m;
}

/** Overlay a scoreboard response on a schedule match: it adds team colors and live details; logos stay the dark ones. */
export function refine(m: Match, scoreboard: any): Match {
  const n = parse(scoreboard, m.league);
  n.home.logo = m.home.logo;
  n.away.logo = m.away.logo;
  return n;
}

/** Spec 5.1: live, next within 24h, last within 48h, next, nothing. A malformed event is skipped so it can't hide
 *  the others; only a schedule with none readable throws (spec 8). */
export function pick(events: any[], now: number): Match | undefined {
  const real = events.filter((e) => !FRIENDLY.test(e.league?.slug ?? ""));
  const all = real.flatMap((e) => {
    try {
      return [parse(e)];
    } catch {
      return [];
    }
  });
  if (real.length && !all.length) throw new Error("no readable event");
  const t = (m: Match) => Date.parse(m.date);
  const live = all.find((m) => m.state === "in");
  if (live) return live;
  const next = all.filter((m) => (m.state === "pre" || m.postponed) && !(m.postponed && t(m) <= now)).sort((a, b) => t(a) - t(b))[0];
  const last = all.filter((m) => m.state === "post" && !m.postponed).sort((a, b) => t(b) - t(a))[0];
  if (next && t(next) - now <= DAY) return next;
  if (last && now - t(last) < 2 * DAY) return last;
  return next;
}

/** True while the shown match itself is polled via `/all/scoreboard/{id}` instead of the schedules. */
export function watching(m: Match | undefined, now: number): boolean {
  if (!m) return false;
  const ko = Date.parse(m.date);
  return m.state === "in" || (m.state === "pre" && !m.postponed && now >= ko - 5 * MIN && now < ko + 2 * HOUR);
}

export type Motion = "home" | "away" | "kickoff" | "halftime" | "secondhalf";

/** Design 2.7: the motion to play when an update replaces `old` with `m` on the same live match. A goal wins over a phase change. */
export function motion(old: Match | undefined, m: Match | undefined): Motion | undefined {
  if (!old || !m || m.state !== "in" || old.id !== m.id) return;
  const up = (k: "home" | "away") => (m[k].score ?? 0) > (old[k].score ?? 0);
  if (up("home")) return "home";
  if (up("away")) return "away";
  if (old.state === "pre") return "kickoff";
  if (old.state === "in" && (old.detail === "HT") !== (m.detail === "HT")) return m.detail === "HT" ? "halftime" : "secondhalf";
}

/** Spec 7.1: delay until the next refresh after a successful one. */
export function nextDelay(m: Match | undefined, now: number): number {
  if (m?.state === "in") return 10_000;
  if (watching(m, now)) return MIN;
  const untilWatch = m && m.state === "pre" && !m.postponed ? Date.parse(m.date) - 5 * MIN - now : Infinity;
  return untilWatch > 0 ? Math.min(HOUR, untilWatch) : HOUR;
}

export type Failure = { status?: number; code?: number; retryAfter?: number; network?: boolean };
export type Backoff = { delay: number; kind: "transient" | "limited" | "permanent" };

/** Spec 8: classify the n-th consecutive failure (n >= 1). */
export function backoff(f: Failure, n: number): Backoff {
  const grow = (base: number, cap: number) => Math.min(cap, base * 2 ** (n - 1));
  if (f.status === 429 || f.status === 403) return { kind: "limited", delay: f.retryAfter ? f.retryAfter * 1000 : grow(MIN, HOUR) };
  if (f.network || (f.status !== undefined && f.status >= 500 && f.code !== 2404)) return { kind: "transient", delay: grow(10_000, 5 * MIN) };
  return { kind: "permanent", delay: HOUR };
}

/** Teams whose refresh is due now. Ones due in the next 2 s come along, so teams playing at the same time stay
 *  on one beat and their goals in the same update play together. */
export const due = <T extends { due: number }>(teams: T[], now: number) => teams.filter((t) => t.due <= now + 2000);

/** Rows to hide, by position in the team list: a match a higher team already shows (picked teams playing each other). */
export const hidden = (ids: (string | undefined)[]) => ids.map((id, i) => !!id && ids.indexOf(id) < i);

/** Google search query, spec 5.2. */
export const searchUrl = (m: Match) =>
  "https://www.google.com/search?q=" + encodeURIComponent(`${m.league} ${m.home.name} vs ${m.away.name} ${m.date.slice(0, 10)}`);
