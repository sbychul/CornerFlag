// The desktop card: data loop (spec 7, 8), rendering (design 2) and click/drag/menu (design 3).
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize, PhysicalPosition, getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ICON, REPO, esc, fmtDate, fmtTime, keepOnScreen, load, newerRelease, read, spot, write } from "./common.ts";
import { BASE, backoff, motion, nextDelay, pick, refine, searchUrl, watching } from "./espn.ts";
import type { Settings } from "./common.ts";
import type { Backoff, Failure, Match, Motion, Side } from "./espn.ts";

const win = getCurrentWindow();
const card = document.createElement("div");
let s = load();
let shown = read<Match>("cf.match");
let loading = !shown; // no match yet for this team: "Loading…" until the first answer, then "No upcoming matches"
let cached = !!shown; // `shown` came from the last session: changes since then are not news, so no motion
let fails = 0;
let failure: Backoff | undefined;
let busy = false;
let timer: number | undefined;
let period = 0; // current refresh interval, for resume
let lastTick = 0;
let cooldownUntil = 0;
let blockedUntil = 0;
let update: string | undefined; // newer release version, shown as the Update badge
// One ↻ for the card's lifetime: re-rendering would replace the element and cut its spin short.
const refreshButton = Object.assign(document.createElement("button"), { className: "refresh", title: "Refresh", innerHTML: ICON.refresh });

// Clamped: setTimeout wraps its delay to int32, so the first tick's 5000 - Date.now() became a wait of up to 24.8 days.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

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

async function full(team: string) {
  const past = await get(`/all/teams/${team}/schedule`);
  const next = await get(`/all/teams/${team}/schedule?fixture=true`);
  const m = pick([...past.events, ...next.events], Date.now());
  return m && refine(m, await get(`/all/scoreboard/${m.id}`));
}

async function tick() {
  clearTimeout(timer);
  const team = s.teamId;
  if (!team) return;
  checkUpdate(3_600_000);
  busy = true;
  await sleep(lastTick + 5000 - Date.now());
  lastTick = Date.now();
  try {
    let m = shown;
    if (m && watching(m, Date.now())) {
      m = refine(m, await get(`/all/scoreboard/${m.id}`));
      if (m.state === "post") m = await full(team);
    } else m = await full(team);
    if (team === s.teamId) {
      loading = false;
      show(m);
      fails = 0;
      failure = undefined;
      write("cf.lastOk", Date.now());
    }
    period = nextDelay(m, Date.now());
  } catch (e) {
    failure = backoff(e as Failure, ++fails);
    period = failure.delay;
    if (failure.kind === "limited") blockedUntil = Date.now() + period;
    write("cf.cooldown", Math.max(cooldownUntil, blockedUntil));
    render();
  }
  busy = false;
  timer = setTimeout(tick, team === s.teamId ? period : 0);
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
  tick();
}

/** New data from the network: play the goal or phase motion once (design 2.7). Cached data never animates, nor
 *  does the first update after it: a kickoff or goal missed while the app was off would play late. */
function show(m: Match | undefined) {
  const old = shown;
  shown = m;
  write("cf.match", m ?? null);
  render(cached ? undefined : motion(old, m), old);
  cached = false;
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
const status = (m: Match) =>
  m.detail === "HT"
    ? badge("Half-Time", "#ffd60a")
    : `<div class="clock"><i class="dot" style="--phase:-${Date.now() % 1400}ms"></i>${esc(m.detail)}</div>`;

/** `prev` is the match before this update: the digit that rolls out, and the .ghost of what a phase change replaces. */
function center(m: Match, how?: Motion, prev?: Match): string {
  if (m.state === "pre") {
    const d = new Date(m.date);
    return `<div class="date">${fmtDate(d)}</div><div class="time">${fmtTime(d, s.h24)}</div>${m.postponed ? badge("Postponed", "#ff3b30") : ""}`;
  }
  const cell = (k: "home" | "away") =>
    how === k && prev
      ? `<span class="${k} hit" style="--c:${m[k].color ?? "#ffffff"}"><span class="was">${prev[k].score ?? 0}</span><span class="now">${m[k].score ?? 0}</span></span>`
      : `<span class="${k}">${m[k].score ?? 0}</span>`;
  const score = `<div class="score">${cell("home")}<span class="dash">–</span>${cell("away")}</div>`;
  const ghost = prev && (how === "kickoff" ? center(prev) : how === "halftime" || how === "secondhalf" ? status(prev) : "");
  if (m.state === "in") return score + status(m) + (ghost ? `<div class="ghost">${ghost}</div>` : "");
  const w = lead(m);
  const color = w && m[w].color;
  const pens = m.home.pen != null && m.away.pen != null;
  return score + badge(pens ? `${m.home.pen}–${m.away.pen} PEN` : "Full-Time", w ? color ?? "#ffffff" : undefined);
}

function warning() {
  if (fails < 2 || !failure) return "";
  const last = read<number>("cf.lastOk");
  const tip =
    failure.kind === "permanent"
      ? "Data unavailable — update may be required"
      : failure.kind === "limited"
        ? `Rate limited. Next try at ${fmtTime(new Date(blockedUntil), s.h24)}`
        : `Last updated ${last ? `${fmtDate(new Date(last))} ${fmtTime(new Date(last), s.h24)}` : "never"}`;
  return `<span class="warn" aria-label="${esc(tip)}">${ICON.warn}</span>`;
}

// Always visible, unlike ↻: otherwise a new release only shows up in About.
const updateBadge = () =>
  update ? `<button class="badge upd" style="--c:#ffd60a" title="Update available: v${esc(update)}">Update</button>` : "";

function render(how?: Motion, prev?: Match) {
  const m = shown;
  card.style.setProperty("--op", String(s.opacity / 100));
  const head = (league: string) =>
    `<div class="head"><span class="league">${esc(league)}</span>${warning()}${updateBadge()}<i class="slot"></i></div>`;
  const paint = (html: string) => {
    card.innerHTML = html;
    card.querySelector(".slot")!.replaceWith(refreshButton);
  };
  if (!m) {
    card.className = "card surface empty";
    card.style.removeProperty("--tint");
    const crest = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${esc(s.teamId ?? "")}.png`;
    return paint(head("") + `<div class="none">${loading ? "Loading…" : `<img src="${crest}" alt="">No upcoming matches`}</div>`);
  }
  const w = lead(m);
  const tint = w && m[w].color;
  const goal = how === "home" || how === "away" ? how : undefined;
  card.className = `card surface ${m.state}${how && !goal ? ` ${how}` : ""}`;
  card.style.setProperty("--tint", tint ? `linear-gradient(to ${w === "home" ? "right" : "left"}, ${tint}66, ${tint}00)` : "none");
  const more = `<span class="more">More details ${ICON.arrow}</span>`;
  const flash = goal && m[goal].color;
  paint(
    (flash
      ? `<i class="flash" style="background:linear-gradient(to ${goal === "home" ? "right" : "left"}, ${flash}80, ${flash}00)"></i>` +
        `<i class="sweep ${goal}" style="--c:${flash}"><i class="wave"></i></i>`
      : "") +
    head(m.league) +
    `<div class="match">${team(m.home)}<div class="center">${center(m, how, prev)}</div>${team(m.away)}</div>` +
    (m.state === "in"
      ? `<div class="foot"><hr><div class="events"><span class="goal${goal ? " slide" : ""}">${esc(m.goal ?? "")}</span>${more}</div></div>`
      : more),
  );
}

async function layout() {
  document.documentElement.style.zoom = String(s.width / 320);
  await win.setSize(new LogicalSize(s.width, Math.round((s.width * 146) / 320)));
}

/** Restore the saved spot, kept on screen, or top-right of the primary work area the first time. */
async function place() {
  const p = read<{ x: number; y: number }>("cf.pos");
  if (p) return keepOnScreen(win, p);
  const m = await primaryMonitor();
  if (!m) return;
  const { position: o, size } = m.workArea;
  const gap = Math.round(32 * m.scaleFactor);
  await win.setPosition(new PhysicalPosition(o.x + size.width - (await win.outerSize()).width - gap, o.y + gap));
}

async function start() {
  await layout();
  await place();
  await win.show();
  tick();
}

export async function widget() {
  document.body.append(card);
  render();

  let down: { x: number; y: number } | undefined;
  card.addEventListener("pointerdown", (e) => {
    if (e.button === 0) down = { x: e.screenX, y: e.screenY };
  });
  card.addEventListener("pointermove", (e) => {
    if (down && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
      down = undefined;
      if (!s.lock) win.startDragging();
    }
  });
  card.addEventListener("pointerup", (e) => {
    if (!down) return;
    down = undefined;
    if ((e.target as Element).closest(".refresh")) refresh();
    else if ((e.target as Element).closest(".upd")) openUrl(`${REPO}/releases/latest`);
    else if (shown) openUrl(searchUrl(shown));
  });
  card.addEventListener("contextmenu", () => invoke("show_menu"));
  // The empty card's crest: no dark logo for some clubs (e.g. Coventry), so fall back to the default one as Settings does.
  card.addEventListener("error", (e) => {
    const img = e.target as HTMLImageElement;
    if (img.src.includes("/500-dark/")) img.src = img.src.replace("/500-dark/", "/500/");
  }, true);

  // Once a drag (or a monitor change) settles: back on screen if it went off, then remember the spot.
  let settle: number | undefined;
  await win.onMoved(() => {
    clearTimeout(settle);
    settle = setTimeout(async () => {
      await keepOnScreen(win);
      write("cf.pos", await spot(win));
    }, 500);
  });
  await listen("refresh", refresh);
  await listen<Settings>("settings", async ({ payload }) => {
    const prev = s;
    s = payload;
    if (s.width !== prev.width) await layout();
    if (s.teamId === prev.teamId) return render();
    shown = undefined;
    loading = true;
    write("cf.match", null);
    fails = 0;
    failure = undefined;
    render();
    if (!prev.teamId) start(); // first run finished
    else if (!busy) tick(); // otherwise the running tick restarts itself
  });
  // Spec 7.2: after the network comes back, refresh only if the data is older than the current interval.
  addEventListener("online", () => {
    if (!busy && Date.now() - (read<number>("cf.lastOk") ?? 0) > period) tick();
  });

  if (s.teamId) start(); // first run: the settings window shows itself and sends "settings" once a team is picked
}
