// The desktop card: data loop (spec 7, 8), rendering (design 2) and click/drag/menu (design 3).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize, PhysicalPosition, availableMonitors, getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ICON, esc, fmtDate, fmtTime, load, read, write } from "./common.ts";
import { BASE, backoff, nextDelay, pick, refine, searchUrl, watching } from "./espn.ts";
import type { Backoff, Failure, Match, Side } from "./espn.ts";

const win = getCurrentWindow();
const card = document.createElement("div");
let s = load();
let shown = read<Match>("cf.match");
let fails = 0;
let failure: Backoff | undefined;
let busy = false;
let timer: number | undefined;
let period = 0; // current refresh interval, for resume
let lastReq = 0;
let cooldownUntil = 0;
let blockedUntil = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Spec 7.3: one request at a time (the loop is serial) and at least 5 s apart.
async function get(path: string) {
  await sleep(lastReq + 5000 - Date.now());
  lastReq = Date.now();
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
  busy = true;
  try {
    let m = shown;
    if (m && watching(m, Date.now())) {
      m = refine(m, await get(`/all/scoreboard/${m.id}`));
      if (m.state === "post") m = await full(team);
    } else m = await full(team);
    if (team === s.teamId) {
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

function refresh() {
  const now = Date.now();
  if (busy || now < Math.max(cooldownUntil, blockedUntil)) return;
  cooldownUntil = now + 5000;
  write("cf.cooldown", cooldownUntil);
  tick();
}

/** New data from the network: play the goal motion once if a score went up (design 2.7). */
function show(m: Match | undefined) {
  const old = shown;
  shown = m;
  write("cf.match", m ?? null);
  const scored = (k: "home" | "away") => m?.state === "in" && old?.id === m.id && (m[k].score ?? 0) > (old[k].score ?? 0);
  render(scored("home") ? "home" : scored("away") ? "away" : undefined);
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

function center(m: Match, goal?: string) {
  if (m.state === "pre") {
    const d = new Date(m.date);
    return `<div class="date">${fmtDate(d)}</div><div class="time">${fmtTime(d, s.h24)}</div>${m.postponed ? badge("Postponed", "#ff3b30") : ""}`;
  }
  const cell = (k: "home" | "away") => `<span class="${k}${goal === k ? " roll" : ""}">${m[k].score ?? 0}</span>`;
  const score = `<div class="score">${cell("home")}<span class="dash">–</span>${cell("away")}</div>`;
  if (m.state === "in") return score + (m.detail === "HT" ? badge("Half-Time", "#ffd60a") : `<div class="clock"><i class="dot"></i>${esc(m.detail)}</div>`);
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
  return `<span class="warn" title="${esc(tip)}">${ICON.warn}</span>`;
}

function render(goal?: "home" | "away") {
  const m = shown;
  card.style.setProperty("--op", String(s.opacity / 100));
  const head = (league: string) =>
    `<div class="head"><span class="league">${esc(league)}</span>${warning()}<button class="refresh" title="Refresh">${ICON.refresh}</button></div>`;
  if (!m) {
    card.className = "card surface empty";
    card.style.removeProperty("--tint");
    card.innerHTML = head("") + `<div class="none">No upcoming matches</div>`;
    return;
  }
  const w = lead(m);
  const tint = w && m[w].color;
  card.className = `card surface ${m.state}`;
  card.style.setProperty("--tint", tint ? `linear-gradient(to ${w === "home" ? "right" : "left"}, ${tint}66, ${tint}00)` : "none");
  const more = `<span class="more">More details ${ICON.arrow}</span>`;
  const flash = goal && m[goal].color;
  card.innerHTML =
    (flash ? `<i class="flash" style="background:linear-gradient(to ${goal === "home" ? "right" : "left"}, ${flash}80, ${flash}00)"></i>` : "") +
    head(m.league) +
    `<div class="match">${team(m.home)}<div class="center">${center(m, goal)}</div>${team(m.away)}</div>` +
    (m.state === "in"
      ? `<div class="foot"><hr><div class="events"><span class="goal${goal ? " slide" : ""}">${esc(m.goal ?? "")}</span>${more}</div></div>`
      : more);
}

async function layout() {
  document.documentElement.style.zoom = String(s.width / 320);
  await win.setSize(new LogicalSize(s.width, Math.round((s.width * 146) / 320)));
}

/** Restore the saved spot, or top-right of the primary work area when it is off every monitor (Q6). */
async function place() {
  const p = read<{ x: number; y: number }>("cf.pos");
  const on = (await availableMonitors()).some(
    ({ position: o, size }) => p && p.x >= o.x && p.y >= o.y && p.x < o.x + size.width - 20 && p.y < o.y + size.height - 20,
  );
  if (p && on) return win.setPosition(new PhysicalPosition(p.x, p.y));
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
    else if (shown) openUrl(searchUrl(shown));
  });
  card.addEventListener("contextmenu", () => invoke("show_menu"));

  await win.onMoved(({ payload }) => write("cf.pos", { x: payload.x, y: payload.y }));
  await listen("refresh", refresh);
  await listen("settings", async () => {
    const prev = s;
    s = load();
    if (s.width !== prev.width) await layout();
    if (s.teamId === prev.teamId) return render();
    shown = undefined;
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
