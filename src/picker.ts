// Picking teams, shared by Settings and the first run (Figma Menu & windows 6–10, First-run B1–B4): league dropdown
// and crest grid, search across all leagues, the pick sheet and the ordered team list.
import { ICON, crest, esc } from "./common.ts";
import { BASE } from "./espn.ts";
import type { Team } from "./common.ts";

export const MAX = 4;

// Official names without sponsors (Figma design 4). Every slug has a /standings table; the group is only a heading.
const LEAGUES: [string, [string, string][]][] = [
  ["Top 5", [["eng.1", "Premier League"], ["esp.1", "LALIGA"], ["ger.1", "Bundesliga"], ["ita.1", "Serie A"], ["fra.1", "Ligue 1"]]],
  [
    "More in Europe",
    [
      ["ned.1", "Eredivisie"],
      ["por.1", "Liga Portugal"],
      ["sco.1", "Scottish Premiership"],
      ["bel.1", "Belgian Pro League"],
      ["tur.1", "Süper Lig"],
      ["aut.1", "Austria Bundesliga"],
      ["gre.1", "Super League Greece"],
      ["den.1", "Danish Superliga"],
      ["swe.1", "Allsvenskan"],
      ["nor.1", "Eliteserien"],
    ],
  ],
  ["Asia", [["ksa.1", "Saudi Pro League"]]],
  ["North America", [["usa.1", "MLS"]]],
];
const NAME = new Map(LEAGUES.flatMap(([, list]) => list));
export const leagueName = (slug: string) => NAME.get(slug) ?? slug;
const lists = new Map<string, Promise<Team[]>>();

const json = (url: string) => fetch(url, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());

// `/{slug}/teams` sends no CORS header, so the list comes from the standings (which does) sorted by name.
// Standings has no dark logos or colors: dark logos follow ESPN's URL pattern (img error falls back to the default),
// and the kit color of the picked team comes from its schedule. A failed league is fetched again next time.
function fetchTeams(slug: string) {
  if (!lists.has(slug)) {
    const p: Promise<Team[]> = json(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`).then((j) =>
      j.children
        .flatMap((c: any) => c.standings.entries.map((e: any) => e.team))
        .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName))
        .map((t: any): Team => ({ id: t.id, league: slug, name: t.displayName, short: t.shortDisplayName })),
    );
    p.catch(() => lists.delete(slug));
    lists.set(slug, p);
  }
  return lists.get(slug)!;
}

const colors = new Map<string, Promise<string>>();
function kit(button: HTMLElement) {
  const id = button.dataset.id!;
  if (!colors.has(id)) colors.set(id, json(`${BASE}/all/teams/${id}/schedule`).then((j) => (/^[0-9a-f]{6}$/i.test(j.team.color) ? `#${j.team.color}` : "transparent")));
  colors.get(id)!.then((c) => button.querySelector<HTMLElement>(".kit")!.style.background = c, () => colors.delete(id));
}

// Accents off, so "atletico" finds Atlético; ø is a letter of its own, so "brondby" finds Brøndby. Folding keeps the
// length of Latin names, so the match can be bolded in place.
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ø/g, "o");
function mark(text: string, q: string) {
  const i = fold(text).indexOf(q);
  return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<b>${esc(text.slice(i, i + q.length))}</b>${esc(text.slice(i + q.length))}`;
}

// One dropdown open at a time: a click elsewhere or leaving the window closes it.
const closeOptions = (except?: Node) =>
  document.querySelectorAll(".select").forEach((s) => !s.contains(except ?? null) && s.dispatchEvent(new Event("close")));
addEventListener("pointerdown", (e) => closeOptions(e.target as Node));
addEventListener("blur", () => closeOptions());

type Browse = {
  league: string;
  taken: () => Set<string>; // dimmed and not pickable: already in the list
  pick: (t: Team) => void;
  verb: string; // what Enter does to a search result: Select, Add, Change
  picked?: () => string | undefined; // first run: the pick stays marked in the grid
  escape?: () => void; // Esc in the search box; without it Esc clears the search
  note?: string;
};

/** Search box, league dropdown and crest grid. Typing swaps the dropdown and grid for results from every league. */
export function browser(o: Browse) {
  let league = o.league;
  let shown: Team[] = [];
  let found: Team[] = [];
  let foundFor = ""; // the query `found` answers: while a slow league loads, the list still shows the last one's
  let active = -1;
  const el = document.createElement("div");
  el.className = "browse";
  el.innerHTML = `<label class="search">${ICON.search}<input placeholder="Search teams" spellcheck="false" aria-label="Search teams"></label>
    <div class="select">
      <button class="value" aria-haspopup="listbox" aria-expanded="false"><span></span>${ICON.chevron}</button>
      <div class="options" role="listbox" aria-label="League" hidden>${LEAGUES.map(
        ([group, list], i) =>
          `${i ? "<hr>" : ""}<div class="group">${group}</div>` +
          list.map(([slug, name]) => `<button role="option" data-slug="${slug}"><span>${name}</span>${ICON.check}</button>`).join(""),
      ).join("")}</div>
    </div>
    <div class="grid"></div>
    ${o.note ? `<div class="note">${o.note}</div>` : ""}
    <div class="results" hidden><div class="note count"></div><div class="found" role="listbox"></div>
      <div class="hint">↑↓ to move · Enter to ${o.verb.toLowerCase()} · Esc to ${o.escape ? "close" : "clear"}</div></div>`;
  const $ = <T extends Element>(q: string) => el.querySelector<T>(q)!;
  const input = $<HTMLInputElement>("input");
  const select = $<HTMLElement>(".select");
  const value = $<HTMLButtonElement>(".value");
  const options = $<HTMLElement>(".options");
  const grid = $<HTMLElement>(".grid");
  const results = $<HTMLElement>(".results");
  const list = $<HTMLElement>(".found");

  async function drawGrid() {
    value.firstElementChild!.textContent = leagueName(league);
    options.querySelectorAll<HTMLElement>("button").forEach((b) => b.classList.toggle("on", b.dataset.slug === league));
    const slug = league;
    try {
      const list = await fetchTeams(slug);
      if (slug !== league) return; // a slower league answered after a newer pick: keep `shown` to what the grid shows
      shown = list;
      const taken = o.taken();
      const picked = o.picked?.();
      grid.innerHTML = shown
        .map(
          (t) => `<button class="${t.id === picked ? "on" : ""}" data-id="${esc(t.id)}"${taken.has(t.id) ? " disabled" : ""}>
            <img src="${crest(esc(t.id))}" alt=""><span>${esc(t.short)}</span><i class="kit"></i></button>`,
        )
        .join("");
      const on = grid.querySelector<HTMLElement>(".on");
      if (on) kit(on);
      grid.scrollTop = on ? on.offsetTop - grid.clientHeight / 2 : 0; // MLS has 30 teams, more than the grid shows
    } catch {
      if (slug === league) grid.innerHTML = `<p class="error">Couldn't load teams. Pick the league again to retry.</p>`;
    }
  }

  const open = (on: boolean) => {
    options.hidden = !on;
    value.setAttribute("aria-expanded", String(on));
    const cur = options.querySelector<HTMLElement>(".on");
    if (on && cur) options.scrollTop = cur.offsetTop - options.clientHeight / 2;
  };
  select.addEventListener("close", () => open(false));
  value.addEventListener("click", () => open(value.ariaExpanded !== "true"));
  options.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("button");
    if (!b) return;
    open(false);
    value.focus();
    league = b.dataset.slug!;
    drawGrid(); // also for the same league: retries a failed load, a loaded one comes from the cache
  });
  select.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !options.hidden) e.stopPropagation(), open(false), value.focus();
  });

  function choose(t: Team, fromSearch = false) {
    o.pick(t);
    if (!o.picked || !fromSearch) return;
    // First run: show the pick in its league's grid
    input.value = "";
    league = t.league;
    search();
    drawGrid();
  }
  grid.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button:enabled");
    const t = b && shown.find((t) => t.id === b.dataset.id);
    if (!t) return;
    if (o.picked) grid.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)), kit(b!);
    choose(t);
  });

  const paintFound = () =>
    list.querySelectorAll<HTMLElement>(".pick").forEach((r, i) => {
      r.classList.toggle("active", i === active);
      if (i === active) r.scrollIntoView({ block: "nearest" });
    });
  async function search() {
    const q = fold(input.value.trim());
    select.hidden = grid.hidden = !!q;
    el.querySelector<HTMLElement>(":scope > .note")?.toggleAttribute("hidden", !!q);
    results.hidden = !q;
    if (!q) return;
    const all = await Promise.allSettled(LEAGUES.flatMap(([, l]) => l.map(([slug]) => fetchTeams(slug))));
    if (q !== fold(input.value.trim())) return;
    const failed = all.some((r) => r.status === "rejected");
    const taken = o.taken();
    found = all.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter((t) => fold(t.short).includes(q) || fold(t.name).includes(q));
    foundFor = q;
    active = found.findIndex((t) => !taken.has(t.id));
    const n = found.length;
    $(".count").textContent =
      (n ? `${n} result${n > 1 ? "s" : ""} across all leagues` : "No teams found") + (failed ? ". Some leagues couldn't load; type again to retry." : "");
    list.innerHTML = found
      .map((t) => {
        const off = taken.has(t.id);
        return `<div class="pick${off ? " taken" : ""}" role="option"><img src="${crest(esc(t.id))}" alt="">
          <span class="who"><span>${mark(t.short, q)}</span><small>${esc(leagueName(t.league))}</small></span>
          <em>${off ? "In your teams" : o.verb}</em></div>`;
      })
      .join("");
    paintFound();
  }
  input.addEventListener("input", search);
  const current = () => foundFor === fold(input.value.trim());
  list.addEventListener("click", (e) => {
    const r = (e.target as Element).closest(".pick:not(.taken)");
    const i = [...list.children].indexOf(r!);
    if (i >= 0 && current()) choose(found[i], true);
  });
  input.addEventListener("keydown", (e) => {
    const taken = o.taken();
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step && found.length && !results.hidden) {
      e.preventDefault();
      for (let i = active + step; i >= 0 && i < found.length; i += step) if (!taken.has(found[i].id)) return (active = i), paintFound();
    } else if (e.key === "Enter" && !results.hidden && found[active] && current()) choose(found[active], true);
    else if (e.key === "Escape" && !o.escape && input.value) e.stopPropagation(), (input.value = ""), search();
  });

  drawGrid();
  return { el, focus: () => input.focus() };
}

/** The pick sheet over the window (Figma 7, B3a): Add team, or Change team for a slot. Closes on ✕, Esc or the dim. */
export function sheet(host: HTMLElement, o: { title: string; league: string; taken: Set<string>; pick: (t: Team) => void; closed: () => void }) {
  const dim = document.createElement("div");
  dim.className = "dim";
  const box = document.createElement("div");
  box.className = "sheet";
  box.setAttribute("role", "dialog");
  box.innerHTML = `<div class="sheet-head"><span>${o.title}</span><button class="close" title="Close">${ICON.close}</button></div>`;
  const close = () => {
    removeEventListener("keydown", esc);
    dim.remove();
    box.remove();
    o.closed();
  };
  const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
  const b = browser({
    league: o.league,
    taken: () => o.taken,
    pick: (t) => (close(), o.pick(t)),
    verb: o.title === "Add team" ? "Add" : "Change",
    escape: close,
    note: `Teams already in your list are dimmed. Picking a team ${o.title === "Add team" ? "adds it" : "puts it in this slot"} and closes the sheet.`,
  });
  box.append(b.el);
  box.querySelector(".close")!.addEventListener("click", close);
  dim.addEventListener("click", close);
  addEventListener("keydown", esc);
  host.append(dim, box);
  b.focus();
}

const PITCH = 54; // item 48 + gap 6
const moved = <T>(list: T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};

/** Your teams (Figma 6, 9, 10): #1 is the main widget. Drag an item (or Alt+↑/↓ on its handle) to reorder,
 *  click it to change the team, ✕ to remove it. */
export function teamList(o: { get: () => Team[]; set: (teams: Team[]) => void; open: (slot: number) => void; hint: boolean }) {
  const el = document.createElement("div");
  el.className = "team-list";
  let dragged = false;

  const role = (item: Element, k: number) => {
    item.classList.toggle("main", k === 0);
    item.querySelector(".no")!.textContent = String(k + 1);
    item.querySelector(".role")!.textContent = k ? "Row" : "Main";
  };

  function draw(focus?: number) {
    const teams = o.get();
    const one = teams.length < 2;
    el.innerHTML = `<div class="list-head"><span class="label">Your teams</span>${
      o.hint ? `<span class="note">${one ? "" : "Drag to reorder · "}#1 is the main widget</span>` : ""
    }</div>
      <div class="items${one ? " single" : ""}"><i class="drop" hidden></i>${teams
        .map(
          (t) => `<div class="item" tabindex="0" role="button" aria-label="Change ${esc(t.short)}">
            <button class="handle" title="Drag to reorder" aria-label="Reorder ${esc(t.short)} (Alt+Up/Down)">${ICON.handle}</button>
            <span class="no"></span><img src="${crest(esc(t.id))}" alt="">
            <span class="who"><span>${esc(t.short)}</span><small>${esc(leagueName(t.league))}</small></span>
            <span class="role"></span><button class="remove" title="Remove" aria-label="Remove ${esc(t.short)}">${ICON.close}</button></div>`,
        )
        .join("")}</div>
      ${teams.length < MAX ? `<button class="add">${ICON.add}<span>Add team</span><em>${teams.length} of ${MAX}</em></button>` : ""}`;
    const items = [...el.querySelectorAll<HTMLElement>(".item")];
    items.forEach(role);
    if (focus != null) items[focus]?.querySelector<HTMLElement>(".handle")!.focus();
  }
  const update = (teams: Team[], focus?: number) => (o.set(teams), draw(focus));

  el.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest(".add")) return o.open(o.get().length);
    const item = t.closest(".item");
    if (!item || dragged || t.closest(".handle")) return;
    const i = [...el.querySelectorAll(".item")].indexOf(item);
    if (t.closest(".remove")) update(o.get().filter((_, j) => j !== i));
    else o.open(i);
  });
  el.addEventListener("keydown", (e) => {
    const item = (e.target as Element).closest(".item");
    if (!item) return;
    const i = [...el.querySelectorAll(".item")].indexOf(item);
    const to = i + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
    if (e.altKey && to !== i && to >= 0 && to < o.get().length) {
      e.preventDefault();
      update(moved(o.get(), i, to), to);
    } else if (e.key === "Enter" && e.target === item) o.open(i);
  });

  // Figma 9: the item lifts and follows the pointer, the others make room, its slot shows dashed, numbers update live.
  el.addEventListener("pointerdown", (e) => {
    const t = e.target as Element;
    const item = t.closest<HTMLElement>(".item");
    const teams = o.get();
    if (!item || e.button || t.closest(".remove") || teams.length < 2) return;
    const items = [...el.querySelectorAll<HTMLElement>(".item")];
    const drop = el.querySelector<HTMLElement>(".drop")!;
    const from = items.indexOf(item);
    const y0 = e.clientY;
    let to = from;
    dragged = false;
    item.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      if (!dragged && Math.abs(dy) < 4) return;
      if (!dragged) (dragged = true), item.classList.add("lifted"), (drop.hidden = false);
      to = Math.min(Math.max(Math.round(from + dy / PITCH), 0), items.length - 1);
      item.style.transform = `translateY(${Math.min(Math.max(dy, -from * PITCH), (items.length - 1 - from) * PITCH)}px)`;
      const order = moved(items, from, to);
      items.forEach((r, i) => {
        role(r, order.indexOf(r));
        if (r !== item) r.style.transform = `translateY(${(order.indexOf(r) - i) * PITCH}px)`;
      });
      drop.style.top = `${to * PITCH}px`;
    };
    const up = () => {
      item.removeEventListener("pointermove", move);
      if (!dragged) return;
      update(moved(o.get(), from, to));
      setTimeout(() => (dragged = false)); // after the click this release makes
    };
    item.addEventListener("pointermove", move);
    item.addEventListener("pointerup", up, { once: true });
    item.addEventListener("pointercancel", up, { once: true });
  });

  return { el, draw };
}
