# CornerFlag

A minimal football widget for the Windows desktop. Pick one club and it shows the club's live match, next match or latest result on a single card that stays on your desktop.

- Clubs from the top five European leagues (Premier League, LALIGA, Bundesliga, Serie A, Ligue 1)
- Every official competition: league, domestic cups, super cups, UEFA. Friendlies are skipped.
- Live score every 10 seconds, with the latest goal scorer
- Click the card for a Google search on the match. That's where the details live.

## Install

Download from [Releases](https://github.com/sbychul/CornerFlag/releases/latest):

- `CornerFlag_x.y.z_x64-setup.exe`: installer
- `CornerFlag-vx.y.z-portable.zip`: unzip and run `CornerFlag.exe`

Windows 10/11 with the WebView2 runtime (built into Windows 11).

### "Windows protected your PC"

The app is not code-signed, so SmartScreen may warn on first run. Click **More info**, then **Run anyway**.

## Use

| Action | Result |
|---|---|
| Click the card | Google search for the match |
| Drag the card | Move the widget (unless **Lock position** is on) |
| Hover the card | Shows ↻ (refresh) and *More details* |
| Right-click the card or the tray icon | Menu: Settings, Refresh now, About, Quit |

**Settings** (applied immediately): your team, start with Windows, size, opacity, lock position, 12/24-hour time.

The card shows, in this order: a live match → the next match if it starts within 24 hours → the last result for 48 hours after kickoff → the next match.

## Data

Match data comes from ESPN's public but **unofficial** site API. It can change or break without notice. CornerFlag is not affiliated with ESPN, the leagues or the clubs; club names and logos belong to their owners.

## Build from source

Requires Node.js 24, Rust (stable, MSVC) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for Windows.

```bash
npm install
npm run tauri dev     # run with hot reload
npm test              # match-selection, refresh-timing and error-backoff checks
npm run tauri build   # NSIS installer in src-tauri/target/release/bundle/nsis
```

Releases are built by GitHub Actions when a `v*` tag is pushed (`.github/workflows/release.yml`). The tag must match `version` in `src-tauri/tauri.conf.json`.

## License

[MIT](LICENSE)
