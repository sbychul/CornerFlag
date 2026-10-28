// The desktop card and the rows of the other teams: data loop (spec 7, 8), rendering (design 2, Figma Multi-team)
// and click/drag/menu (design 3).
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize, PhysicalPosition, getCurrentWindow, monitorFromPoint, primaryMonitor } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ICON, REPO, crest, crestFallback, esc, fmtDate, fmtTime, keepOnScreen, load, newerRelease, read, spot, spotLength, write } from "./common.ts";
import { BASE, backoff, due, hidden, motion, nextDelay, pick, refine, searchUrl, watching } from "./espn.ts";
import type { Settings, Team } from "./common.ts";
import type { Backoff, Failure, Match, Motion, Side } from "./espn.ts";

/** One followed team: what it shows and when it refreshes next. */
type Slot = {
  team: Team;
  shown?: Match;
  loading: boolean; // no match yet for this team: "Loading…" until the first answer, then "No upcoming matches"
  cached: boolean; // `shown` came from the last session: changes since then are not news, so no motion
  fails: number;
  failure?: Backoff;
  period: number; // current refresh interval, for resume
  due: number; // next refresh, ms since epoch
  row: HTMLElement; // its thin row while it is not the main team
};

const ROW = 50; // row height 44 + gap 6, CSS px at 100% size
const win = getCurrentWindow();
const stack = document.createElement("div");
const card = document.createElement("div");
let s = load();
let slots: Slot[] = [];
let busy = false;
let timer: number | undefined;
let lastTick = 0;
let cooldownUntil = 0;
let blockedUntil = 0;
let update: string | undefined; // newer release version, shown as the Update badge
// One ↻ for the card's lifetime: re-rendering would replace the element and cut its spin short.
const refreshButton = Object.assign(document.createElement("button"), { className: "refresh", title: "Refresh", innerHTML: ICON.refresh });

// Clamped: setTimeout wraps its delay to int32, so the first tick's 5000 - Date.now() became a wait of up to 24.8 days.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Keeps a team's state across a settings change (reorder, other teams added or removed). */
function slotFor(team: Team, old: Slot[]): Slot {
  const had = old.find((t) => t.team.id === team.id);
  if (had) return Object.assign(had, { team });
  const shown = read<Match>(`cf.match.${team.id}`);
  return { team, shown, loading: !shown, cached: !!shown, fails: 0, period: 0, due: 0, row: document.createElement("div") };
}

// Spec 7.3: one request at a time (the loop is serial); refreshes start at least 5 s apart (tick).
async function get(path: string) {
  let r: Response;
  try {
    r = await fetch(BASE + path, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw { network: true } satisfies Failure;
  }
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw { status: r.status, code: body.code, retryAfter: Number(r.headers.get("Retry-After")) || undefined } satisfies Failure;
  }
  return r.json();
}

type Board = (id: string) => Promise<any>;
type Move = [how: Motion | undefined, prev: Match | undefined];
const still: Move = [undefined, undefined];

async function full(team: string, board: Board) {
  const past = await get(`/all/teams/${team}/schedule`);
  const next = await get(`/all/teams/${team}/schedule?fixture=true`);
  const m = pick([...past.events, ...next.events], Date.now());
  return m && refine(m, await board(m.id));
}

async function fetchSlot(t: Slot, board: Board) {
  let m = t.shown;
  if (m && watching(m, Date.now())) {
    m = refine(m, await board(m.id));
    if (m.state === "post") m = await full(t.team.id, board);
  } else m = await full(t.team.id, board);
  return m;
}

/** Refresh every team that is due, one request at a time, then draw them all at once: goals from the same tick play
 *  together. A rate limit stops every team; other failures back off per team. */
async function tick() {
  clearTimeout(timer);
  if (!slots.length) return;
  checkUpdate(3_600_000);
  busy = true;
  await sleep(lastTick + 5000 - Date.now());
  lastTick = Date.now();
  const boards = new Map<string, Promise<any>>(); // teams playing each other share one scoreboard request
  const board: Board = (id) => boards.get(id) ?? boards.set(id, get(`/all/scoreboard/${id}`)).get(id)!;
  const moves = new Map<Slot, Move>();
  const ran: Slot[] = [];
  for (const t of due(slots, Date.now())) {
    if (Date.now() < blockedUntil) break;
    ran.push(t);
    try {
      const m = await fetchSlot(t, board);
      if (!slots.includes(t)) continue; // removed in Settings meanwhile
      moves.set(t, [t.cached ? undefined : motion(t.shown, m), t.shown]);
      Object.assign(t, { shown: m, loading: false, cached: false, fails: 0, failure: undefined, period: nextDelay(m, Date.now()) });
      write(`cf.match.${t.team.id}`, m ?? null);
      write(`cf.lastOk.${t.team.id}`, Date.now());
    } catch (e) {
      t.failure = backoff(e as Failure, ++t.fails);
      t.period = t.failure.delay;
      if (t.failure.kind === "limited") blockedUntil = Date.now() + t.period;
    }
  }
  // One clock for the whole tick: timed from each team's own answer, slow requests pushed the later teams out of
  // due()'s 2 s window and onto a beat of their own for good.
  const end = Date.now();
  for (const t of ran) t.due = end + t.period;
  for (const t of slots) t.due = Math.max(t.due, blockedUntil);
  write("cf.cooldown", Math.max(cooldownUntil, blockedUntil));
  busy = false;
  render(moves);
  schedule();
}

/** Next tick when the earliest team is due; a team added in Settings is due at once. At most an hour ahead:
 *  setTimeout wraps delays past int32, and a long Retry-After would fire at once. */
function schedule() {
  clearTimeout(timer);
  if (slots.length) timer = setTimeout(tick, Math.min(Math.max(0, Math.min(...slots.map((t) => t.due)) - Date.now()), 3_600_000));
}

/** Same check as About, with every refresh: at most hourly from the timer and once a minute from ↻, as GitHub allows
 *  60 unauthenticated calls/h. A failed check keeps the last answer. */
let checkedAt = 0;
async function checkUpdate(every: number) {
  if (Date.now() - checkedAt < every) return;
  checkedAt = Date.now();
  const latest = await newerRelease(await getVersion()).catch(() => update);
  if (latest !== update) (update = latest), render();
}

function refresh() {
  keepOnScreen(win); // Refresh now in the menu also brings back a card stranded off screen
  checkUpdate(60_000);
  const now = Date.now();
  if (busy || now < Math.max(cooldownUntil, blockedUntil)) return;
  cooldownUntil = now + 5000;
  write("cf.cooldown", cooldownUntil);
  // Fixed 2 s spin, whatever the network takes. A script animation survives the re-render's detach/re-attach.
  refreshButton.classList.add("spinning");
  refreshButton.firstElementChild!
    .animate([{ transform: "rotate(0)" }, { transform: "rotate(720deg)" }], { duration: 2000, easing: "cubic-bezier(.4, 0, .2, 1)" })
    .finished.then(() => refreshButton.classList.remove("spinning"));
  for (const t of slots) t.due = 0; // every team
  tick();
}

const lead = (m: Match): "home" | "away" | undefined => {
  if (m.state === "post") return m.home.winner ? "home" : m.away.winner ? "away" : undefined;
  if (m.state !== "in" || m.home.score === m.away.score) return;
  return (m.home.score ?? 0) > (m.away.score ?? 0) ? "home" : "away";
};

const badge = (label: string, color?: string) =>
  `<span class="badge${color ? "" : " neutral"}" style="--c:${color ?? "transparent"}">${esc(label)}</span>`;

const team = (t: Side) =>
  `<div class="team"><img src="${esc(t.logo)}" alt=""><span class="name">${esc(t.short)}</span><i class="kit" style="background:${t.color ?? "transparent"}"></i></div>`;

// Every render makes a new dot; a negative delay from the wall clock keeps its 1.4 s pulse on one beat across refreshes.
// Rows say HT and FT where the card has room for Half-Time and Full-Time.
const status = (m: Match, row: boolean) =>
  m.detail === "HT"
    ? badge(row ? "HT" : "Half-Time", "#ffd60a")
    : `<div class="clock"><i class="dot" style="--phase:-${Date.now() % 1400}ms"></i>${esc(m.detail)}</div>`;

/** `prev` is the match before this update: the digit that rolls out, and the .ghost of what a phase change replaces.
 *  A row puts the kickoff time above its date (Figma Multi-team), the card the other way round. */
function center(m: Match, row: boolean, how?: Motion, prev?: Match): string {
  if (m.state === "pre") {
    const d = new Date(m.date);
    const pp = m.postponed ? badge("Postponed", "#ff3b30") : "";
    return row
      ? `<div class="time">${fmtTime(d, s.h24)}</div>${pp || `<div class="date">${fmtDate(d)}</div>`}`
      : `<div class="date">${fmtDate(d)}</div><div class="time">${fmtTime(d, s.h24)}</div>${pp}`;
  }
  const cell = (k: "home" | "away") =>
    how === k && prev
      ? `<span class="${k} hit" style="--c:${m[k].color ?? "#ffffff"}"><span class="was">${prev[k].score ?? 0}</span><span class="now">${m[k].score ?? 0}</span></span>`
      : `<span class="${k}">${m[k].score ?? 0}</span>`;
  const score = `<div class="score">${cell("home")}<span class="dash">–</span>${cell("away")}</div>`;
  const ghost = prev && (how === "kickoff" ? center(prev, row) : how === "halftime" || how === "secondhalf" ? status(prev, row) : "");
  if (m.state === "in") return score + status(m, row) + (ghost ? `<div class="ghost">${ghost}</div>` : "");
  const w = lead(m);
  const color = w && m[w].color;
  const pens = m.home.pen != null && m.away.pen != null;
  return score + badge(pens ? `${m.home.pen}–${m.away.pen} PEN` : row ? "FT" : "Full-Time", w ? color ?? "#ffffff" : undefined);
}

/** ⚠ for any team failing twice in a row, with the worst reason: permanent, then rate limit, then the oldest data. */
function warning() {
  const failing = slots.filter((t) => t.fails >= 2 && t.failure);
  if (!failing.length) return "";
  const kinds = failing.map((t) => t.failure!.kind);
  const last = Math.min(...failing.map((t) => read<number>(`cf.lastOk.${t.team.id}`) ?? 0));
  const tip = kinds.includes("permanent")
    ? "Data unavailable — update may be required"
    : kinds.includes("limited")
      ? `Rate limited. Next try at ${fmtTime(new Date(blockedUntil), s.h24)}`
      : `Last updated ${last ? `${fmtDate(new Date(last))} ${fmtTime(new Date(last), s.h24)}` : "never"}`;
  return `<span class="warn" aria-label="${esc(tip)}">${ICON.warn}</span>`;
}

// Always visible, unlike ↻: otherwise a new release only shows up in About.
const updateBadge = () =>
  update ? `<button class="badge upd" style="--c:#ffd60a" title="Update available: v${esc(update)}">Update</button>` : "";

/** The leading team's color fades in from its side. */
const tint = (el: HTMLElement, m: Match) => {
  const w = lead(m);
  const c = w && m[w].color;
  el.style.setProperty("--tint", c ? `linear-gradient(to ${w === "home" ? "right" : "left"}, ${c}66, ${c}00)` : "none");
};

const flash = (m: Match, goal?: "home" | "away") => {
  const c = goal && m[goal].color;
  return c
    ? `<i class="flash" style="background:linear-gradient(to ${goal === "home" ? "right" : "left"}, ${c}80, ${c}00)"></i>` +
        `<i class="sweep ${goal}" style="--c:${c}"><i class="wave"></i></i>`
    : "";
};

const more = `<span class="more">More details ${ICON.arrow}</span>`;
const none = (t: Slot) => (t.loading ? "Loading…" : `<img src="${crest(esc(t.team.id))}" alt="">No upcoming matches`);

function renderCard(t: Slot, how?: Motion, prev?: Match) {
  const m = t.shown;
  const head = (league: string) =>
    `<div class="head"><span class="league">${esc(league)}</span>${warning()}${updateBadge()}<i class="slot"></i></div>`;
  const paint = (html: string) => {
    card.innerHTML = html;
    card.querySelector(".slot")!.replaceWith(refreshButton);
  };
  if (!m) {
    card.className = "card surface empty";
    card.style.removeProperty("--tint");
    return paint(head("") + `<div class="none">${none(t)}</div>`);
  }
  const goal = how === "home" || how === "away" ? how : undefined;
  card.className = `card surface ${m.state}${how && !goal ? ` ${how}` : ""}`;
  tint(card, m);
  paint(
    flash(m, goal) +
    head(m.league) +
    `<div class="match">${team(m.home)}<div class="center">${center(m, false, how, prev)}</div>${team(m.away)}</div>` +
    (m.state === "in"
      ? `<div class="foot"><hr><div class="events"><span class="goal${goal ? " slide" : ""}">${esc(m.goal ?? "")}</span>${more}</div></div>`
      : more),
  );
}

/** Figma Multi-team: 3-letter teams, score or kickoff time in the middle; no league, scorer or kit stripe. */
function renderRow(t: Slot, how?: Motion, prev?: Match) {
  const m = t.shown;
  const el = t.row;
  if (!m) {
    el.className = "strip surface empty";
    el.style.removeProperty("--tint");
    el.innerHTML = `<div class="none">${none(t)}</div>`;
    return;
  }
  const goal = how === "home" || how === "away" ? how : undefined;
  el.className = `strip surface ${m.state}${how && !goal ? ` ${how}` : ""}`;
  tint(el, m);
  const side = (k: "home" | "away") => `<div class="side ${k}"><img src="${esc(m[k].logo)}" alt=""><span>${esc(m[k].abbr)}</span></div>`;
  el.innerHTML = flash(m, goal) + side("home") + `<div class="center">${center(m, true, how, prev)}</div>` + side("away") + more;
}

/** New data from the network plays its goal or phase motion once (design 2.7); every other render is still. */
function render(moves = new Map<Slot, Move>()) {
  stack.style.setProperty("--op", String(s.opacity / 100));
  const [main, ...rest] = slots;
  if (!main) return;
  renderCard(main, ...(moves.get(main) ?? still));
  const hide = hidden(slots.map((t) => t.shown?.id));
  const rows = rest.filter((_, i) => !hide[i + 1]);
  for (const t of rows) renderRow(t, ...(moves.get(t) ?? still));
  // #2 sits next to the card either way. Re-inserting restarts CSS animations, so only when the order changes.
  const order = s.stack === "above" ? [...rows.map((t) => t.row).reverse(), card] : [card, ...rows.map((t) => t.row)];
  if (order.some((el, i) => stack.children[i] !== el) || stack.children.length !== order.length) stack.replaceChildren(...order);
  layout(s.stack === "above" ? rows.length : 0, rows.length);
}

/** What the window is sized for. The card keeps its spot on screen when rows come and go: the window grows away
 *  from it, and only keepOnScreen may move the card. */
let geo = { width: 0, above: 0, rows: 0 };
let laying = Promise.resolve();
/** The rows above the card in spot units, at the scale of the monitor at `at`, not the window's own: a hidden window
 *  can still have the scale of the monitor it was created on, which moved the card a little on every launch
 *  (Windows, mixed DPI). Placing and saving must use the same one. */
const aboveBy = async (g: typeof geo, at: { x: number; y: number }) =>
  spotLength((g.above * ROW * g.width) / 320, (await monitorFromPoint(at.x, at.y))?.scaleFactor);

function layout(above: number, rows: number) {
  // A failed call must not reject the chain: every later layout, and start(), would be skipped.
  laying = laying.then(async () => {
    const next = { width: s.width, above, rows };
    if (JSON.stringify(next) === JSON.stringify(geo)) return;
    const at = await spot(win);
    const was = (await win.isVisible()) && { at, above: await aboveBy(geo, at) };
    document.documentElement.style.zoom = String(s.width / 320);
    await win.setSize(new LogicalSize(s.width, Math.round((s.width * (146 + rows * ROW)) / 320))); // before moving (macOS)
    geo = next;
    if (was) await keepOnScreen(win, { x: was.at.x, y: was.at.y + was.above - (await aboveBy(geo, was.at)) });
  }).catch(() => {});
}

/** Restore the card's saved spot, kept on screen, or top-right of the primary work area the first time. */
async function place() {
  const p = read<{ x: number; y: number }>("cf.pos");
  if (p) return keepOnScreen(win, { x: p.x, y: p.y - (await aboveBy(geo, p)) });
  const m = await primaryMonitor();
  if (!m) return;
  const { position: o, size } = m.workArea;
  const gap = Math.round(32 * m.scaleFactor);
  await win.setPosition(new PhysicalPosition(o.x + size.width - (await win.outerSize()).width - gap, o.y + gap));
}

async function start() {
  render();
  await laying;
  await place();
  await win.show();
  tick();
}

export async function widget() {
  // Up to 1.1 the one team's match and last update had keys of their own.
  const old = localStorage.getItem("cf.match");
  if (old && s.teams[0]) {
    localStorage.setItem(`cf.match.${s.teams[0].id}`, old);
    write(`cf.lastOk.${s.teams[0].id}`, read<number>("cf.lastOk") ?? 0);
    localStorage.removeItem("cf.match");
  }
  slots = s.teams.map((t) => slotFor(t, []));
  stack.className = "stack";
  document.body.append(stack);

  let down: { x: number; y: number } | undefined;
  stack.addEventListener("pointerdown", (e) => {
    if (e.button === 0) down = { x: e.screenX, y: e.screenY };
  });
  stack.addEventListener("pointermove", (e) => {
    if (down && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
      down = undefined;
      if (!s.lock) win.startDragging();
    }
  });
  stack.addEventListener("pointerup", (e) => {
    if (!down) return;
    down = undefined;
    const el = e.target as Element;
    if (el.closest(".refresh")) return refresh();
    if (el.closest(".upd")) return openUrl(`${REPO}/releases/latest`);
    const box = el.closest(".card, .strip");
    const m = (box === card ? slots[0] : slots.find((t) => t.row === box))?.shown;
    if (m) openUrl(searchUrl(m));
  });
  stack.addEventListener("contextmenu", () => invoke("show_menu"));
  crestFallback(stack); // the empty card's and rows' crests, as Settings does

  // Once a drag (or a monitor change) settles: back on screen if it went off, then remember the card's spot.
  let settle: number | undefined;
  await win.onMoved(() => {
    clearTimeout(settle);
    settle = setTimeout(async () => {
      await keepOnScreen(win);
      const at = await spot(win);
      write("cf.pos", { x: at.x, y: at.y + (await aboveBy(geo, at)) });
    }, 500);
  });
  await listen("refresh", refresh);
  await listen<Settings>("settings", async ({ payload }) => {
    const first = !s.teams.length;
    s = payload;
    const old = slots;
    slots = s.teams.map((t) => slotFor(t, old));
    for (const t of old.filter((t) => !slots.includes(t))) {
      localStorage.removeItem(`cf.match.${t.team.id}`);
      localStorage.removeItem(`cf.lastOk.${t.team.id}`);
    }
    if (first) return slots.length && start(); // first run finished
    render();
    if (!busy) schedule(); // otherwise the running tick schedules the new teams when it ends
  });
  // Spec 7.2: after the network comes back, refresh only the teams whose data is older than their current interval.
  addEventListener("online", () => {
    const stale = slots.filter((t) => Date.now() - (read<number>(`cf.lastOk.${t.team.id}`) ?? 0) > t.period);
    for (const t of stale) t.due = 0;
    if (!busy && stale.length) schedule();
  });

  if (slots.length) start(); // first run: the settings window shows itself and sends "settings" once a team is picked
}
