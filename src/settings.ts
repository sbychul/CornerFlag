// Settings window (design 6) and, while no team is saved, the first-run screen in the same window (design 7).
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { ICON, esc, load, save } from "./common.ts";
import { BASE } from "./espn.ts";

type Team = { id: string; short: string; logo: string };

const LEAGUES = [["eng.1", "EPL"], ["esp.1", "LALIGA"], ["ger.1", "Bundesliga"], ["ita.1", "Serie A"], ["fra.1", "Ligue 1"]];
const win = getCurrentWindow();
const teams = new Map<string, Promise<Team[]>>();

const json = (url: string) => fetch(url, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());

// `/{slug}/teams` sends no CORS header, so the list comes from the standings (which does) sorted by name.
// Standings has no dark logos or colors: dark logos follow ESPN's URL pattern (img error falls back to the default),
// and the kit color of the picked team comes from its schedule.
function fetchTeams(slug: string) {
  if (!teams.has(slug)) {
    const p: Promise<Team[]> = json(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`).then((j) =>
      j.children
        .flatMap((c: any) => c.standings.entries.map((e: any) => e.team))
        .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName))
        .map((t: any): Team => ({ id: t.id, short: t.shortDisplayName, logo: `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${t.id}.png` })),
    );
    p.then((list) => list.forEach((t) => (new Image().src = t.logo)), () => teams.delete(slug)); // warm logos; on failure the next tab click retries
    teams.set(slug, p);
  }
  return teams.get(slug)!;
}

const colors = new Map<string, Promise<string>>();
function kit(button: HTMLElement) {
  const id = button.dataset.id!;
  if (!colors.has(id)) colors.set(id, json(`${BASE}/all/teams/${id}/schedule`).then((j) => (/^[0-9a-f]{6}$/i.test(j.team.color) ? `#${j.team.color}` : "transparent")));
  colors.get(id)!.then((c) => button.querySelector<HTMLElement>(".kit")!.style.background = c, () => colors.delete(id));
}

// Only the control reacts: a full-width <label> row toggled "Lock position" on stray clicks.
const row = (name: string, control: string) => `<div class="row"><span>${name}</span>${control.replace("<input", `<input aria-label="${name}"`)}</div>`;
const size = (w: number) => `${w} × ${Math.round((w * 146) / 320)}`;

export async function settings() {
  const first = !load().teamId;
  let league = load().league;
  let picked = load().teamId;
  let pickedName = load().team;
  const s = load();
  // Re-register on every launch: running the installer by hand uninstalls the old version first, which deletes the
  // Run value while this setting still says on. Also follows the exe when the zip build is moved.
  if (s.autostart) invoke("set_autostart", { on: true });

  document.body.innerHTML = `<div class="window surface settings">
    <div class="title" data-tauri-drag-region><span data-tauri-drag-region>${first ? "Pick your team" : "Settings"}</span><button class="close" title="Close">${ICON.close}</button></div>
    <div class="label">Your team</div>
    <div class="tabs">${LEAGUES.map(([slug, name]) => `<button data-slug="${slug}">${name}</button>`).join("")}</div>
    <div class="grid"></div>
    ${
      first
        ? `<label class="check"><input type="checkbox" class="autostart"> Start with Windows</label>
           <button class="start" disabled>Start</button>`
        : `<hr><div class="label">Widget</div>
           <div class="rows">
             ${row("Start with Windows", `<input type="checkbox" class="toggle autostart"${s.autostart ? " checked" : ""}>`)}
             ${row("Size", `<span class="slider"><input type="range" class="width" min="260" max="420" step="2" value="${s.width}"><output>${size(s.width)}</output></span>`)}
             ${row("Opacity", `<span class="slider"><input type="range" class="opacity" min="0" max="100" value="${s.opacity}"><output>${s.opacity}%</output></span>`)}
             ${row("Lock position", `<input type="checkbox" class="toggle lock"${s.lock ? " checked" : ""}>`)}
             <div class="row"><span>Time format</span><span class="seg"><button data-h24="0">12-hour</button><button data-h24="1">24-hour</button></span></div>
           </div>
           <div class="note">Changes apply immediately.</div>`
    }
  </div>`;
  const $ = <T extends Element>(q: string) => document.querySelector<T>(q)!;
  const grid = $<HTMLElement>(".grid");

  async function drawGrid() {
    document.querySelectorAll<HTMLElement>(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.slug === league));
    const slug = league;
    try {
      const list = await fetchTeams(slug);
      if (slug !== league) return;
      grid.innerHTML = list
        .map(
          (t) => `<button class="${t.id === picked ? "on" : ""}" data-id="${esc(t.id)}" data-name="${esc(t.short)}">
            <img src="${esc(t.logo)}" alt=""><span>${esc(t.short)}</span><i class="kit"></i></button>`,
        )
        .join("");
      const on = grid.querySelector<HTMLElement>(".on");
      if (on) kit(on);
    } catch {
      if (slug === league) grid.innerHTML = `<p class="error">Couldn't load teams. Pick the league again to retry.</p>`;
    }
  }

  // No dark logo for some clubs (e.g. Coventry): use the default one.
  grid.addEventListener("error", (e) => {
    const img = e.target as HTMLImageElement;
    if (img.src.includes("/500-dark/")) img.src = img.src.replace("/500-dark/", "/500/");
  }, true);
  $(".tabs").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("button");
    if (b) (league = b.dataset.slug!), drawGrid();
  });
  grid.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("button");
    if (!b) return;
    picked = b.dataset.id;
    pickedName = b.dataset.name;
    grid.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    kit(b);
    if (first) $<HTMLButtonElement>(".start").disabled = false;
    else save({ league, teamId: picked, team: pickedName });
  });
  $(".close").addEventListener("click", () => (first ? invoke("quit") : win.hide()));

  const autostart = $<HTMLInputElement>(".autostart");
  if (first) {
    $(".start").addEventListener("click", async () => {
      await invoke("set_autostart", { on: autostart.checked });
      await win.hide();
      await save({ league, teamId: picked, team: pickedName, autostart: autostart.checked });
      location.reload(); // come back as the regular Settings window
    });
  } else {
    autostart.addEventListener("change", () => (invoke("set_autostart", { on: autostart.checked }), save({ autostart: autostart.checked })));
    $<HTMLInputElement>(".lock").addEventListener("change", (e) => save({ lock: (e.target as HTMLInputElement).checked }));
    for (const [cls, text] of [["width", size], ["opacity", (v: number) => `${v}%`]] as const) {
      const input = $<HTMLInputElement>(`.${cls}`);
      const paint = () => {
        input.style.setProperty("--fill", `${((+input.value - +input.min) / (+input.max - +input.min)) * 100}%`);
        input.nextElementSibling!.textContent = text(+input.value);
      };
      paint();
      input.addEventListener("input", () => (paint(), save({ [cls]: +input.value })));
    }
    const seg = $<HTMLElement>(".seg");
    const paintSeg = () => seg.querySelectorAll<HTMLElement>("button").forEach((b) => b.classList.toggle("on", (b.dataset.h24 === "1") === load().h24));
    paintSeg();
    seg.addEventListener("click", async (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button");
      if (b) await save({ h24: b.dataset.h24 === "1" }), paintSeg();
    });
  }

  LEAGUES.forEach(([slug]) => fetchTeams(slug)); // tab switches are instant afterwards
  await drawGrid();
  await document.fonts.ready;
  await win.setSize(new LogicalSize(560, $<HTMLElement>(".window").offsetHeight));
  await win.center();
  if (first) await win.show();
}
