import "@fontsource-variable/outfit";
import "./styles.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { about, menu } from "./popups.ts";
import { settings } from "./settings.ts";
import { widget } from "./widget.ts";

// One page for every window; the window label picks the view.
const views: Record<string, () => Promise<void>> = { main: widget, menu, settings, about };
views[getCurrentWindow().label]();
