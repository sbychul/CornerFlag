// Run: npm test (Node 24 strips the types from espn.ts)
import assert from "node:assert/strict";
import { backoff, motion, nextDelay, parse, pick, searchUrl } from "./espn.ts";

const H = 3_600_000;
const now = Date.parse("2026-10-19T12:00Z");
const at = (h) => new Date(now + h * H).toISOString();
const team = (name, color) => ({ displayName: name, shortDisplayName: name, color, logos: [{ rel: ["full", "dark"], href: `${name}.png` }] });
const ev = (id, h, state, { slug = "eng.1", name = "STATUS_X", home = 0, away = 0, details } = {}) => ({
  id, date: at(h), league: { slug, abbreviation: "Premier League" },
  competitions: [{
    status: { type: { state, name, shortDetail: "67'" } }, details,
    competitors: [
      { homeAway: "home", team: team("Home", "99c5ea"), score: { value: home }, winner: home > away },
      { homeAway: "away", team: team("Away", "nope"), score: String(away) },
    ],
  }],
});

// 5.1 order
assert.equal(pick([ev("last", -10, "post"), ev("live", -1, "in"), ev("next", 5, "pre")], now).id, "live");
assert.equal(pick([ev("last", -10, "post"), ev("next", 20, "pre")], now).id, "next");
assert.equal(pick([ev("last", -10, "post"), ev("next", 30, "pre")], now).id, "last");
assert.equal(pick([ev("last", -50, "post"), ev("far", 300, "pre"), ev("near", 30, "pre")], now).id, "near");
assert.equal(pick([ev("old", -50, "post")], now), undefined);
assert.equal(pick([ev("friendly", -1, "in", { slug: "club.friendly" }), ev("gamper", -2, "post", { slug: "esp.joan_gamper" })], now), undefined);
// postponed: shown until the original kickoff, then skipped
assert.equal(pick([ev("pp", 3, "post", { name: "STATUS_POSTPONED" }), ev("n", 100, "pre")], now).id, "pp");
assert.equal(pick([ev("pp", -1, "post", { name: "STATUS_POSTPONED" }), ev("n", 100, "pre")], now).id, "n");

// parsing
const details = [
  { scoringPlay: true, clock: { displayValue: "19'" }, athletesInvolved: [{ shortName: "P. Foden" }] },
  { scoringPlay: true, penaltyKick: true, clock: { displayValue: "67'" }, athletesInvolved: [{ shortName: "E. Haaland" }] },
  { scoringPlay: false, clock: { displayValue: "70'" }, athletesInvolved: [{ shortName: "X. Card" }] },
];
const live = parse(ev("g", 0, "in", { home: 2, away: 0, details }));
assert.equal(live.goal, "Goal! 67' Haaland (P)");
assert.deepEqual([live.home.score, live.away.score, live.home.color, live.away.color], [2, 0, "#99c5ea", undefined]);
// a goal listed before the score counts it waits for the score; one counted before it is listed shows no line
assert.equal(parse(ev("g", 0, "in", { home: 1, details })).goal, "Goal! 19' Foden");
assert.equal(parse(ev("g", 0, "in", { details })).goal, undefined);
assert.equal(parse(ev("g", 0, "in", { home: 2, away: 1, details })).goal, undefined);
assert.throws(() => parse({ id: "x" }));
assert.equal(searchUrl(live), "https://www.google.com/search?q=" + encodeURIComponent(`Premier League Home vs Away ${at(0).slice(0, 10)}`));

// design 2.7 motion
const at2 = (s, h, a, detail = "67'") => ({ ...live, state: s, detail, home: { ...live.home, score: h }, away: { ...live.away, score: a } });
assert.equal(motion(at2("in", 1, 0), at2("in", 2, 0)), "home");
assert.equal(motion(at2("in", 2, 0), at2("in", 2, 1)), "away");
assert.equal(motion(at2("in", 0, 0), at2("in", 1, 1)), "home");
assert.equal(motion(at2("pre", undefined, undefined), at2("in", 0, 0, "1'")), "kickoff");
assert.equal(motion(at2("in", 1, 0, "45'+2'"), at2("in", 1, 0, "HT")), "halftime");
assert.equal(motion(at2("in", 1, 0, "HT"), at2("in", 1, 0, "46'")), "secondhalf");
assert.equal(motion(at2("in", 1, 0, "HT"), at2("in", 2, 0, "46'")), "home");
assert.equal(motion(at2("in", 1, 0), at2("in", 1, 0, "68'")), undefined);
assert.equal(motion(at2("in", 1, 0), { ...at2("in", 2, 0), id: "other" }), undefined);
assert.equal(motion(at2("in", 1, 0), at2("post", 1, 0, "FT")), undefined);
assert.equal(motion(undefined, at2("in", 1, 0)), undefined);

// 7.1 timing
const m = (h, state) => parse(ev("m", h, state));
assert.equal(nextDelay(undefined, now), H);
assert.equal(nextDelay(m(0, "in"), now), 10_000);
assert.equal(nextDelay(m(0.05, "pre"), now), 60_000); // inside kickoff - 5 min
assert.equal(nextDelay(m(0.5, "pre"), now), 0.5 * H - 300_000);
assert.equal(nextDelay(m(-3, "pre"), now), H); // 2h past kickoff and still not started
assert.equal(nextDelay(m(-1, "post"), now), H);

// 8 errors
assert.deepEqual(backoff({ network: true }, 1), { kind: "transient", delay: 10_000 });
assert.deepEqual(backoff({ status: 503 }, 10), { kind: "transient", delay: 300_000 });
assert.deepEqual(backoff({ status: 500, code: 2404 }, 1), { kind: "permanent", delay: H });
assert.deepEqual(backoff({ status: 429 }, 2), { kind: "limited", delay: 120_000 });
assert.deepEqual(backoff({ status: 403, retryAfter: 30 }, 5), { kind: "limited", delay: 30_000 });
assert.deepEqual(backoff({}, 1), { kind: "permanent", delay: H }); // parse failure
console.log("espn ok");
