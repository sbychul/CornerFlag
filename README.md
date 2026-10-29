<h1 align="center">
  <picture>
    <!-- logo-wordmark.svg is currentColor, which an <img> draws black; GitHub dark theme gets a white copy -->
    <source media="(prefers-color-scheme: dark)" srcset=".github/wordmark-white.svg">
    <img src="src-tauri/icons/logo-wordmark.svg" alt="CornerFlag" height="48">
  </picture>
</h1>

<p align="center">
  A little Flag for your Corner of the pitch.<br>
  <a href="README.ko.md">한국어</a>
</p>

---

A minimal football widget for the Windows and macOS desktop. Pick up to four clubs. The first one's live match, next match or latest result shows on a card that stays on your desktop; the others show as thin rows above or below it.

- Clubs from 17 leagues: the European top 5 (Premier League, LALIGA, Bundesliga, Serie A, Ligue 1), 10 more in Europe (Eredivisie, Liga Portugal, Scottish Premiership, Belgian Pro League, Süper Lig, Austria Bundesliga, Super League Greece, Danish Superliga, Allsvenskan, Eliteserien), Saudi Pro League and MLS
- Every official competition: league, domestic cups, super cups, UEFA. Friendlies are skipped.
- Live score every 10 seconds, with the latest goal scorer on the card
- Click the card for a Google search on the match. That's where the details live.

## Install

Download from [Releases](https://github.com/sbychul/CornerFlag/releases/latest):

- `CornerFlag_x.y.z_x64-setup.exe`: installer
- `CornerFlag-vx.y.z-portable.zip`: unzip and run `CornerFlag.exe`
- `CornerFlag_x.y.z_aarch64.dmg`: macOS (Apple silicon), drag to Applications

Windows 10/11 with the WebView2 runtime (built into Windows 11), or a Mac with Apple silicon.

On macOS, CornerFlag lives in the menu bar with no Dock icon. The card stays on the desktop through Show Desktop and Mission Control, on every Space.

### "Windows protected your PC" / "Apple could not verify"

The app is not code-signed. On Windows, SmartScreen may warn on first run: click **More info**, then **Run anyway**. On macOS, open it once, then go to **System Settings** → **Privacy & Security** and click **Open Anyway**.

## Use

| Action                                | Result                                           |
| ------------------------------------- | ------------------------------------------------ |
| Click the card or a row               | Google search for the match                      |
| Drag the card or a row                | Move the widget, rows included (unless **Lock position** is on) |
| Hover the card                        | Shows ↻ (refresh every club) and _More details_  |
| Hover a row                           | Shows _More details_                             |
| Hover ⚠ (shown when updates keep failing for any club) | Why: last update time, rate-limit retry time, or update may be required |
| Right-click the card, a row or the tray icon | Menu: Settings, Refresh now, About, Quit (macOS: click the menu bar icon) |

**Settings** (applied immediately): your teams (up to 4: add one from a league or by searching every league, click one to change it, drag to reorder, #1 is the card), whether the other teams' rows go above or below the card, start with Windows (macOS: open at login), size, opacity, lock position, 12/24-hour time.

The card and each row show, in this order: a live match → the next match if it starts within 24 hours → the last result for 48 hours after kickoff → the next match. When two of your clubs play each other, the match shows once, for the higher one in your list.

## Data

Match data comes from ESPN's public but **unofficial** site API. It can change or break without notice. CornerFlag is meant for **personal, non-commercial use** and keeps its requests light: one check an hour per club, every 10 seconds only while a club is playing. Each extra club adds its own requests. See [Disclaimer](#disclaimer).

## Build from source

Requires Node.js 24, Rust (stable; MSVC on Windows) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
npm install
npm run tauri dev     # run with hot reload
npm test              # match-selection, refresh-timing, multi-team and error-backoff checks
npm run tauri build   # Windows: NSIS installer in src-tauri/target/release/bundle/nsis
npm run tauri build -- --bundles dmg   # macOS: dmg in src-tauri/target/release/bundle/dmg
```

Releases (Windows installer, portable zip and macOS dmg) are built by GitHub Actions when a `v*` tag is pushed (`.github/workflows/release.yml`). The tag must match `version` in `src-tauri/tauri.conf.json`.

## Disclaimer

CornerFlag is an independent, free, open-source hobby project. It is not affiliated with, endorsed by or sponsored by ESPN, The Walt Disney Company, any league, competition or club.

- ESPN, club and competition names, logos and other trademarks belong to their respective owners. They are shown only to identify the teams and matches. Logos are loaded from ESPN at runtime and are not distributed with the app.
- Match data is provided by a third party that CornerFlag does not control. It is shown as is, may be delayed, wrong or unavailable, and must not be relied on for betting or any other decision.
- You are responsible for making sure your use complies with the terms of the data provider. Use it for personal, non-commercial purposes only.
- If you are a rights holder and want something changed or removed, please [open an issue](https://github.com/sbychul/CornerFlag/issues). The project will comply promptly, up to and including stopping the use of the data source.

## License

[MIT](LICENSE). The license covers the CornerFlag code only, not any third-party data, names or logos the app displays.
