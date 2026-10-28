// Settings window (Figma Menu & windows 6–10) and, while no team is saved, the first run in the same window
// (Figma First-run B1–B4).
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ICON, MAC, crest, crestFallback, esc, load, popup, save } from "./common.ts";
import { MAX, browser, leagueName, sheet, teamList } from "./picker.ts";
import type { Settings, Team } from "./common.ts";

const win = getCurrentWindow();

// Only the control reacts: a full-width <label> row toggled "Lock position" on stray clicks.
const row = (name: string, control: string) => `<div class="row"><span>${name}</span>${control.replace("<input", `<input aria-label="${name}"`)}</div>`;
const size = (w: number) => `${w} × ${Math.round((w * 146) / 320)}`;
const seg = (cls: string, options: [string, string][]) =>
  `<span class="seg ${cls}">${options.map(([v, label]) => `<button data-v="${v}">${label}</button>`).join("")}</span>`;
const STACK: [string, string][] = [["above", "Above"], ["below", "Below"]];
const H24: [string, string][] = [["0", "12-hour"], ["1", "24-hour"]];
const autostartRow = (on: boolean) => row(MAC ? "Open at login" : "Start with Windows", `<input type="checkbox" class="toggle autostart"${on ? " checked" : ""}>`);

/** Marks the chosen button of a segmented control and reports clicks. Returns the painter. */
function segment(el: HTMLElement, value: string, pick: (v: string) => void) {
  const paint = (v: string) => el.querySelectorAll<HTMLElement>("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  paint(value);
  el.addEventListener("click", (e) => {
    const v = (e.target as Element).closest<HTMLButtonElement>("button:enabled")?.dataset.v;
    if (v) paint(v), pick(v);
  });
  return paint;
}

/** Extra teams only matter with rows to stack. */
function extraState(box: HTMLElement, teams: number) {
  box.classList.toggle("off", teams < 2);
  box.querySelectorAll<HTMLButtonElement>(".where button").forEach((b) => (b.disabled = teams < 2));
}

/** The sheet for slot `i` of `teams`: Change team for a filled slot, Add team past the end. */
function pickFor(host: HTMLElement, teams: Team[], i: number, done: (teams: Team[]) => void, closed = () => {}) {
  sheet(host, {
    title: i < teams.length ? "Change team" : "Add team",
    league: (teams[i] ?? teams[0])?.league ?? "eng.1",
    taken: new Set(teams.filter((_, j) => j !== i).map((t) => t.id)),
    pick: (t) => done(Object.assign([...teams], { [i]: t })),
    closed,
  });
}

export async function settings() {
  const s = load();
  // Re-register on every launch: running the installer by hand uninstalls the old version first, which deletes the
  // Run value while this setting still says on. Also follows the exe when the zip build is moved.
  if (s.autostart) invoke("set_autostart", { on: true });
  crestFallback(document);
  await (s.teams.length ? regular(s) : firstRun(s));
}

async function regular(s: Settings) {
  document.body.innerHTML = `<div class="window surface settings">
    <div class="title" data-tauri-drag-region><span data-tauri-drag-region>Settings</span><button class="close" title="Close">${ICON.close}</button></div>
    <div class="extra">${row("Extra teams", seg("where", STACK))}<div class="note"></div></div>
    <hr><div class="label">Widget</div>
    <div class="rows">
      ${autostartRow(s.autostart)}
      ${row("Size", `<span class="slider"><input type="range" class="width" min="260" max="420" step="2" value="${s.width}"><output>${size(s.width)}</output></span>`)}
      ${row("Opacity", `<span class="slider"><input type="range" class="opacity" min="0" max="100" value="${s.opacity}"><output>${s.opacity}%</output></span>`)}
      ${row("Lock position", `<input type="checkbox" class="toggle lock"${s.lock ? " checked" : ""}>`)}
      ${row("Time format", seg("h24", H24))}
    </div>
    <div class="note">Size and opacity apply to the main widget and its rows. Changes apply immediately.</div>
  </div>`;
  const $ = <T extends Element>(q: string) => document.querySelector<T>(q)!;
  const box = $<HTMLElement>(".window");
  const extra = $<HTMLElement>(".extra");

  // The window fits its content: the team list grows and shrinks, and an open sheet needs room for its grid.
  let sheetOpen = false;
  const height = () => {
    box.style.minHeight = "0";
    const h = Math.max(box.offsetHeight, sheetOpen ? box.querySelector<HTMLElement>(".sheet")!.offsetHeight + 56 : 0);
    box.style.minHeight = "";
    return h;
  };
  const { close, fit } = popup(560, height); // shown by the menu's "open"

  const paintExtra = () => {
    const n = load().teams.length;
    extraState(extra, n);
    extra.querySelector(".note")!.textContent = n < 2 ? "Only shown with 2 or more teams." : "Thin rows stack above or below the main widget.";
  };
  const set = (teams: Team[]) => (save({ teams }), paintExtra(), fit());
  const list = teamList({
    get: () => load().teams,
    set,
    hint: true,
    open: (i) => {
      sheetOpen = true;
      pickFor(box, load().teams, i, (teams) => (set(teams), list.draw()), () => ((sheetOpen = false), fit()));
      fit();
    },
  });
  $(".title").after(list.el);
  list.draw();
  paintExtra();
  segment($(".where"), s.stack, (v) => save({ stack: v as Settings["stack"] }));
  segment($(".h24"), s.h24 ? "1" : "0", (v) => save({ h24: v === "1" }));

  const autostart = $<HTMLInputElement>(".autostart");
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

  $(".close").addEventListener("click", close);
}

const STEPS = ["Your team", "More teams", "Widget"];

/** Three steps on the right of a step rail; Back and Next only (the rail is not clickable). ✕ quits. */
async function firstRun(s: Settings) {
  let teams: Team[] = [];
  let { stack, autostart, h24 } = s;
  let step = 1;
  let skipped = false; // "No, just one": More teams shows a grey check
  document.body.innerHTML = `<div class="window surface first">
    <nav class="rail" data-tauri-drag-region><div class="brand" data-tauri-drag-region>CornerFlag</div><ol class="steps"></ol>
      <p class="rail-note" data-tauri-drag-region>You can change all of this later in Settings.</p></nav>
    <main class="body" data-tauri-drag-region></main>
    <button class="close quit" title="Quit">${ICON.close}</button>
  </div>`;
  const box = document.querySelector<HTMLElement>(".window")!;
  const body = box.querySelector<HTMLElement>(".body")!;
  box.querySelector(".quit")!.addEventListener("click", () => invoke("quit"));

  const enter = (n: number, title: string, sub: string) => {
    step = n;
    box.querySelector(".steps")!.innerHTML = STEPS.map((label, i) => {
      const k = i + 1;
      const state = k === step ? "current" : k === 2 && skipped ? "skipped" : k < step ? "done" : "pending";
      return `<li class="${state}"><i>${state === "done" || state === "skipped" ? ICON.done : k}</i>${label}</li>`;
    }).join("");
    body.innerHTML = `<h1 data-tauri-drag-region>${title}</h1><p class="sub" data-tauri-drag-region>${sub}</p>`;
  };
  const actions = (back: boolean, next: string) => {
    const el = document.createElement("div");
    el.className = "actions";
    el.innerHTML = `${back ? `<button class="secondary back">Back</button>` : "<span></span>"}<button class="primary next">${next}</button>`;
    body.append(el);
    return { back: el.querySelector<HTMLButtonElement>(".back")!, next: el.querySelector<HTMLButtonElement>(".next")! };
  };

  function b1() {
    enter(1, "Select your team", "The club the widget follows.");
    const b = browser({
      league: teams[0]?.league ?? "eng.1",
      picked: () => teams[0]?.id,
      taken: () => new Set(teams.slice(1).map((t) => t.id)),
      pick: (t) => ((teams[0] = t), (next.disabled = false)),
      verb: "Select",
    });
    body.append(b.el);
    const { next } = actions(false, "Next");
    next.disabled = !teams[0];
    next.addEventListener("click", () => (teams.length > 1 ? b3() : ask()));
  }

  // B2: asked once, over the whole window
  function ask() {
    const dim = document.createElement("div");
    dim.className = "dim";
    dim.innerHTML = `<div class="dialog" role="dialog" aria-label="Follow more teams?"><h2>Follow more teams?</h2>
      <p>CornerFlag can show up to ${MAX} teams at once. Your first team stays the main widget, the others sit next to it as thin rows.</p>
      <div class="actions"><button class="secondary one">No, just one</button><button class="primary yes">Yes, add teams</button></div></div>`;
    box.append(dim);
    const done = (go: () => void) => () => (removeEventListener("keydown", esc), dim.remove(), go());
    const esc = (e: KeyboardEvent) => e.key === "Escape" && done(() => {})();
    addEventListener("keydown", esc);
    dim.querySelector(".yes")!.addEventListener("click", done(b3));
    dim.querySelector(".one")!.addEventListener("click", done(() => ((skipped = true), b4())));
    dim.querySelector<HTMLElement>(".yes")!.focus();
  }

  function b3() {
    skipped = false;
    enter(2, `Add up to ${MAX - 1} more`, "The top slot is the main widget. The others show up as thin rows.");
    const slots = document.createElement("div");
    slots.className = "slots";
    body.append(slots);
    const draw = () => {
      slots.innerHTML = Array.from({ length: MAX }, (_, i) => {
        const t = teams[i];
        return t
          ? `<div class="slot" data-i="${i}" tabindex="0" role="button" aria-label="Change ${esc(t.name)}"><img src="${crest(esc(t.id))}" alt="">
              <span class="who"><span>${esc(t.name)}</span><small>${esc(leagueName(t.league))}</small></span>
              <span class="role">${i ? "Row" : "Main"}</span>${i ? `<button class="remove" title="Remove" aria-label="Remove ${esc(t.name)}">${ICON.close}</button>` : ""}</div>`
          : `<div class="slot empty"><button class="plus" title="Add team" aria-label="Add team">${ICON.add}</button></div>`;
      }).join("");
    };
    const open = (i: number) => pickFor(box, teams, i, (next) => ((teams = next), draw()));
    slots.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (t.closest(".plus")) return open(teams.length);
      const slot = t.closest<HTMLElement>(".slot");
      if (!slot) return;
      const i = +slot.dataset.i!;
      if (t.closest(".remove")) (teams = teams.filter((_, j) => j !== i)), draw();
      else open(i);
    });
    slots.addEventListener("keydown", (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>(".slot[data-i]");
      if (e.key === "Enter" && slot && e.target === slot) open(+slot.dataset.i!);
    });
    draw();
    const { back, next } = actions(true, "Next");
    back.addEventListener("click", b1);
    next.addEventListener("click", b4);
  }

  function b4() {
    enter(3, "Almost done", "Drag to change the order any time in Settings.");
    const list = teamList({ get: () => teams, set: (t) => ((teams = t), paint()), open: (i) => pickFor(box, teams, i, (t) => ((teams = t), list.draw(), paint())), hint: false });
    const rest = document.createElement("div");
    rest.className = "b4";
    rest.innerHTML = `<div class="extra"><div class="extra-text"><span>Extra teams</span><div class="note">Rows stack above or below the main widget.</div>
        ${seg("where", STACK)}<div class="hint">Only shown with 2 or more teams.</div></div>
        <div class="preview"><span>Preview</span><div class="shape"></div></div></div>
      <hr><div class="label">Widget</div>
      <div class="rows">${autostartRow(autostart)}${row("Time format", seg("h24", H24))}</div>`;
    body.append(list.el, rest);
    const extra = rest.querySelector<HTMLElement>(".extra")!;
    // Silhouette at 1/4 size: the main card, a row per extra team and a dashed one while there is room for more.
    const paint = () => {
      extraState(extra, teams.length);
      const rows = [...teams.slice(1).map(() => "<i></i>"), ...(teams.length < MAX ? [`<i class="free"></i>`] : [])];
      const order = stack === "above" ? [...rows.reverse(), "<b></b>"] : ["<b></b>", ...rows];
      extra.querySelector(".shape")!.innerHTML = order.join("");
    };
    list.draw();
    paint();
    segment(rest.querySelector(".where")!, stack, (v) => ((stack = v as Settings["stack"]), paint()));
    segment(rest.querySelector(".h24")!, h24 ? "1" : "0", (v) => (h24 = v === "1"));
    rest.querySelector<HTMLInputElement>(".autostart")!.addEventListener("change", (e) => (autostart = (e.target as HTMLInputElement).checked));
    const { back, next } = actions(true, "Start");
    back.addEventListener("click", b3); // even after "No, just one"
    next.addEventListener("click", async () => {
      await invoke("set_autostart", { on: autostart });
      await win.hide();
      // Each team keeps the league it was picked from
      await save({ teams, stack, autostart, h24 });
      location.reload(); // come back as the regular Settings window
    });
  }

  b1();
  await document.fonts.ready;
  const { show } = popup(800, () => 680);
  await show();
}
