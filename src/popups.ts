// Dropdown menu (design 3.1) and About window (design 8).
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ICON, esc, fmtDate, fmtTime, load, read } from "./common.ts";

const win = getCurrentWindow();

async function open(label: string) {
  const w = await WebviewWindow.getByLabel(label);
  await w?.show();
  await w?.setFocus();
}

export async function menu() {
  document.body.innerHTML = `<div class="menu surface">
    <button data-a="settings">${ICON.settings}<span>Settings</span></button>
    <button data-a="refresh">${ICON.reload}<span>Refresh now</span><em></em></button>
    <button data-a="about">${ICON.about}<span>About</span></button>
    <hr>
    <button data-a="quit">${ICON.quit}<span>Quit</span></button>
  </div>`;
  const refresh = document.querySelector<HTMLButtonElement>('[data-a="refresh"]')!;
  // The widget writes when manual refresh is allowed again (5 s cooldown or rate limit).
  const paint = () => {
    const left = Math.ceil(((read<number>("cf.cooldown") ?? 0) - Date.now()) / 1000);
    refresh.disabled = left > 0;
    refresh.querySelector("em")!.textContent = left > 0 ? `${left}s` : "";
  };
  setInterval(paint, 250);

  document.body.addEventListener("click", async (e) => {
    const a = (e.target as Element).closest<HTMLButtonElement>("button:enabled")?.dataset.a;
    if (!a) return;
    await win.hide();
    if (a === "quit") invoke("quit");
    else if (a === "refresh") emit("refresh");
    else open(a);
  });
  await win.onFocusChanged(({ payload }) => (payload ? paint() : win.hide()));
}

export async function about() {
  document.body.innerHTML = `<div class="window surface about">
    <div class="title" data-tauri-drag-region><span data-tauri-drag-region>About</span><button class="close" title="Close">${ICON.close}</button></div>
    <div class="app"><b>CornerFlag</b><span>Version ${esc(await getVersion())}</span></div>
    <hr>
    <dl><dt>Your team</dt><dd class="v-team"></dd><dt>Last updated</dt><dd class="v-last"></dd>
      <dt>Data</dt><dd>ESPN (unofficial API)</dd><dt>License</dt><dd>MIT</dd></dl>
    <button class="link">View on GitHub ${ICON.arrow}</button>
  </div>`;
  document.querySelector(".close")!.addEventListener("click", () => win.hide());
  document.querySelector(".link")!.addEventListener("click", () => openUrl("https://github.com/sbychul/CornerFlag"));
  const fill = () => {
    const last = read<number>("cf.lastOk");
    document.querySelector(".v-team")!.textContent = load().team ?? "—";
    document.querySelector(".v-last")!.textContent = last ? `${fmtDate(new Date(last))} ${fmtTime(new Date(last))}` : "—";
  };
  fill();
  await document.fonts.ready;
  await win.setSize(new LogicalSize(360, document.querySelector<HTMLElement>(".about")!.offsetHeight));
  await win.onFocusChanged(({ payload }) => payload && fill());
}
