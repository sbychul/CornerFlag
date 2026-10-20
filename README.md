<h1>
  <picture>
    <!-- logo-wordmark.svg is currentColor, which an <img> draws black; GitHub dark theme gets a white copy -->
    <source media="(prefers-color-scheme: dark)" srcset=".github/wordmark-white.svg">
    <img src="src-tauri/icons/logo-wordmark.svg" alt="CornerFlag" height="48">
  </picture>
</h1>

A little Flag for your Corner of the pitch.

---

A minimal football widget for the Windows and macOS desktop. Pick one club and it shows the club's live match, next match or latest result on a single card that stays on your desktop.

- Clubs from the top five European leagues (Premier League, LALIGA, Bundesliga, Serie A, Ligue 1)
- Every official competition: league, domestic cups, super cups, UEFA. Friendlies are skipped.
- Live score every 10 seconds, with the latest goal scorer
- Click the card for a Google search on the match. That's where the details live.

## Install

Download from [Releases](https://github.com/sbychul/CornerFlag/releases/latest):

- `CornerFlag_x.y.z_x64-setup.exe`: installer
- `CornerFlag-vx.y.z-portable.zip`: unzip and run `CornerFlag.exe`

- `CornerFlag_x.y.z_aarch64.dmg`: macOS (Apple silicon), drag to Applications

Windows 10/11 with the WebView2 runtime (built into Windows 11).

### "Windows protected your PC" / "Apple could not verify"

The app is not code-signed. On Windows, SmartScreen may warn on first run: click **More info**, then **Run anyway**. On macOS, open it once, then go to **System Settings** → **Privacy & Security** and click **Open Anyway**.

## Use

| Action                                | Result                                           |
| ------------------------------------- | ------------------------------------------------ |
| Click the card                        | Google search for the match                      |
| Drag the card                         | Move the widget (unless **Lock position** is on) |
| Hover the card                        | Shows ↻ (refresh) and _More details_             |
| Right-click the card or the tray icon | Menu: Settings, Refresh now, About, Quit (macOS: click the menu bar icon) |

**Settings** (applied immediately): your team, start with Windows, size, opacity, lock position, 12/24-hour time.

The card shows, in this order: a live match → the next match if it starts within 24 hours → the last result for 48 hours after kickoff → the next match.

## Data

Match data comes from ESPN's public but **unofficial** site API. It can change or break without notice. CornerFlag is meant for **personal, non-commercial use** and keeps its requests light: one check an hour, every 10 seconds only while your club is playing. See [Disclaimer](#disclaimer).

## Build from source

Requires Node.js 24, Rust (stable, MSVC) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for Windows.

```bash
npm install
npm run tauri dev     # run with hot reload
npm test              # match-selection, refresh-timing and error-backoff checks
npm run tauri build   # NSIS installer in src-tauri/target/release/bundle/nsis
```

Releases are built by GitHub Actions when a `v*` tag is pushed (`.github/workflows/release.yml`). The tag must match `version` in `src-tauri/tauri.conf.json`.

## Disclaimer

CornerFlag is an independent, free, open-source hobby project. It is not affiliated with, endorsed by or sponsored by ESPN, The Walt Disney Company, any league, competition or club.

- ESPN, club and competition names, logos and other trademarks belong to their respective owners. They are shown only to identify the teams and matches. Logos are loaded from ESPN at runtime and are not distributed with the app.
- Match data is provided by a third party that CornerFlag does not control. It is shown as is, may be delayed, wrong or unavailable, and must not be relied on for betting or any other decision.
- You are responsible for making sure your use complies with the terms of the data provider. Use it for personal, non-commercial purposes only.
- If you are a rights holder and want something changed or removed, please [open an issue](https://github.com/sbychul/CornerFlag/issues). The project will comply promptly, up to and including stopping the use of the data source.

## License

[MIT](LICENSE). The license covers the CornerFlag code only, not any third-party data, names or logos the app displays.
