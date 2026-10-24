// Shared by all windows: settings in localStorage (one WebView2 profile, so every window sees the same values),
// formatting and the inline icons from the Figma design.
import { emit, listen } from "@tauri-apps/api/event";
import { LogicalPosition, PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

export type Settings = {
  league: string; // ESPN slug, e.g. eng.1
  teamId?: string;
  team?: string; // shortDisplayName, for About
  autostart: boolean;
  width: number; // card width in px at 100% DPI, 260-420
  opacity: number; // dark layer over the acrylic, 0-100
  lock: boolean;
  h24: boolean;
};

const DEFAULTS: Settings = { league: "eng.1", autostart: false, width: 320, opacity: 70, lock: false, h24: true };

export function read<T>(key: string): T | undefined {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
}

export const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

export const load = (): Settings => ({ ...DEFAULTS, ...read<Partial<Settings>>("cf.settings") });

// Window spots are kept in points on macOS: it has one point space for all displays, but its physical values are
// points × a scale that differs per display (the window's own, each monitor's own), so a spot saved on a 1x display
// and restored from a Retina one landed off screen (issue #2). Windows stays in physical px.
const MAC = navigator.userAgent.includes("Mac");
const unit = (scaleFactor: number) => (MAC ? scaleFactor : 1);
type Spot = { x: number; y: number };

/** The window's top-left, to save and later pass to keepOnScreen. */
export async function spot(win = getCurrentWindow()): Promise<Spot> {
  const p = await win.outerPosition();
  const u = unit(await win.scaleFactor());
  return { x: p.x / u, y: p.y / u };
}

/** Move to `to` (or stay), kept fully inside the work area of the nearest monitor: neither OS keeps a borderless
 *  window on screen, and monitor setups change (Q6). */
export async function keepOnScreen(win = getCurrentWindow(), to?: Spot) {
  const u = unit(await win.scaleFactor());
  const { width, height } = await win.outerSize();
  const [w, h] = [width / u, height / u];
  const { x, y } = to ?? (await spot(win));
  const [cx, cy] = [x + w / 2, y + h / 2];
  const areas = (await availableMonitors()).map(({ workArea: { position: o, size }, scaleFactor }) => {
    const k = unit(scaleFactor);
    return { x: o.x / k, y: o.y / k, w: size.width / k, h: size.height / k };
  });
  // distance from the window's center, 0 on the monitor it is on
  const off = (a: (typeof areas)[number]) => Math.hypot(Math.max(a.x - cx, 0, cx - a.x - a.w), Math.max(a.y - cy, 0, cy - a.y - a.h));
  const a = areas.sort((p, q) => off(p) - off(q))[0];
  if (!a) return;
  const nx = Math.min(Math.max(x, a.x), a.x + a.w - w);
  const ny = Math.min(Math.max(y, a.y), a.y + a.h - h);
  if (to || nx !== x || ny !== y)
    await win.setPosition(MAC ? new LogicalPosition(nx, ny) : new PhysicalPosition(Math.round(nx), Math.round(ny)));
}

/** Settings and About, w×h CSS px: shown on `emit("open", label)` where last closed (centered the first time).
 *  While hidden, Windows moves the window around when a monitor goes off and on, so position and size are
 *  re-applied on every show, and only a close saves the spot. The size uses the scale of the monitor the window is
 *  on, not the window's own: a moved hidden window keeps its old pixel size while WebView2 follows the new DPI. */
export function popup(w: number, h: number) {
  const win = getCurrentWindow();
  const key = `cf.pos.${win.label}`;
  const fit = async () => {
    const sf = (await currentMonitor())?.scaleFactor ?? 1;
    await win.setSize(new PhysicalSize(Math.round(w * sf), Math.round(h * sf)));
  };
  const show = async () => {
    if (!(await win.isVisible())) {
      await fit();
      const p = read<Spot>(key);
      await (p ? keepOnScreen(win, p) : win.center());
      await fit();
      await win.show();
    }
    await win.setFocus();
  };
  const close = async () => {
    write(key, await spot(win));
    await win.hide();
  };
  listen<string>("open", ({ payload }) => payload === win.label && show());
  return { show, close };
}

/** Save and tell the other windows; settings apply immediately. The event carries the settings: on macOS each
 *  window's WKWebView is its own process and sees the localStorage write later (issue #1). */
export function save(patch: Partial<Settings>) {
  const next = { ...load(), ...patch };
  write("cf.settings", next);
  return emit("settings", next);
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** ESPN text goes into innerHTML, so escape it. */
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const fmtDate = (d: Date) =>
  `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${d.toLocaleDateString("en-US", { weekday: "short" })})`;
export const fmtTime = (d: Date, h24 = load().h24) =>
  d.toLocaleTimeString("en-US", { hour: h24 ? "2-digit" : "numeric", minute: "2-digit", hourCycle: h24 ? "h23" : "h12" });

export const REPO = "https://github.com/sbychul/CornerFlag";

/** Spec 2 (Q4), zip-style for both builds: the latest GitHub release when it is newer than `version`. Throws when it can't tell. */
export async function newerRelease(version: string) {
  const r = await fetch("https://api.github.com/repos/sbychul/CornerFlag/releases/latest", { signal: AbortSignal.timeout(10_000) });
  const latest = String(r.ok && (await r.json()).tag_name).replace(/^v/, "");
  if (!/^\d+(\.\d+)*$/.test(latest)) throw new Error(`no release tag (${r.status})`);
  // numeric compare: 1.10.0 > 1.9.0; a dev build ahead of the release counts as up to date
  return latest.localeCompare(version, undefined, { numeric: true }) > 0 ? latest : undefined;
}

const svg = (size: number, body: string) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  refresh: svg(13, `<path stroke-width="1.22" d="M10.97 6.5a4.47 4.47 0 1 1-1.3-3.17"/><path stroke-width="1.22" d="M10.97 2.03v2.44H8.53"/>`),
  arrow: svg(11, `<path stroke-width="1.1" d="M3.78 2.4h4.81v4.82M8.59 2.4 2.4 8.6"/>`),
  close: svg(12, `<path stroke-width="1.13" d="m2.63 2.63 6.75 6.75m0-6.75L2.63 9.38"/>`),
  warn: svg(13, `<path stroke-width="1.2" d="M6.5 1.8 12 11.2H1L6.5 1.8Z"/><path stroke-width="1.2" d="M6.5 5.4v2.6"/><circle cx="6.5" cy="9.6" r=".5" fill="currentColor" stroke="none"/>`),
  settings: svg(14, `<g stroke-width="1.23"><path d="M1.75 3.5h6.13m2.62 0h1.75m-10.5 7H3.5m2.63 0h6.12"/><path d="M7.88 2.19h2.62v2.62H7.88zM3.5 9.19h2.63v2.62H3.5z"/></g>`),
  reload: svg(14, `<path stroke-width="1.23" d="M11.81 7a4.81 4.81 0 1 1-1.4-3.41"/><path stroke-width="1.23" d="M11.81 2.19v2.62H9.19"/>`),
  about: svg(14, `<g stroke-width="1.23"><circle cx="7" cy="7" r="5.25"/><path d="M7 6.39v3.24"/></g><circle cx="7" cy="4.38" r=".79" fill="currentColor" stroke="none"/>`),
  quit: svg(14, `<path stroke-width="1.23" d="M7 1.75v4.81M3.94 3.68a4.38 4.38 0 1 0 6.12 0"/>`),
  chevron: svg(12, `<path stroke-width="1.25" d="M3 4.5 6 7.5 9 4.5"/>`),
  check: svg(14, `<path stroke-width="1.3" d="M3 7.2 5.8 10 11 4.5"/>`),
};

// Every window draws its own dark surface; the native context menu would only get in the way.
addEventListener("contextmenu", (e) => e.preventDefault());
