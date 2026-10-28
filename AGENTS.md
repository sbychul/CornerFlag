# Agent Guidelines

## Before changing code

Read [docs/bug-history.md](docs/bug-history.md) before any code change. Its "지켜야 할 불변 조건" table lists the fixes that past bugs depend on.

- If a change touches a file or function named in that table, keep the listed condition.
- If the task cannot be done without breaking a condition, stop and tell the user which one and why before editing.
- After fixing a new bug, add a row to "버그별 상세" (newest first) and, if the fix relies on a rule other code must keep, a row to "지켜야 할 불변 조건".

## Code style

Follow the code around the change: its naming, comment density and tone, formatting, file layout and idioms. Reuse the helpers that already exist (e.g. `save`, `keepOnScreen` in `src/common.ts`) instead of adding parallel ones. Commit subjects use `feat:` / `fix:` / `chore:` / `docs:` prefixes.

## New features: Figma first

Before writing code for a new feature or a visible UI change, draw it in the Figma file [CornerFlag — Widget Design](https://www.figma.com/design/yrP3oyV0Q8jD7d8fnP4nH3) (fileKey `yrP3oyV0Q8jD7d8fnP4nH3`) and get the user's OK on it. Figma is the visual source of truth; `.scratch/cornerflag-v1/design.md` comes second. Bug fixes that keep the current look need no new design.

## After changing code: look for bugs

Before calling a change done, check whether it can cause a bug.

1. Re-read the changed code as if seeing it for the first time, along with every caller of what you changed.
2. Check it against the bug classes in `docs/bug-history.md`: mixed coordinate scales (pixels vs points, per-monitor scale), timer delays, ESPN data that is late, missing or malformed, state saved in one window and read in another, re-renders replacing elements.
3. Try odd inputs: empty, missing and malformed fields, zero and negative numbers, very large values, past and far-future dates, a failed or slow request, a second monitor with a different scale.
4. When something looks suspicious, verify it (run it, add a case to `src/espn.test.mjs`, or trace the values by hand) before deciding it is fine or fixing it. Report what you checked and anything left unverified.

## Releases

1. Bump the version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`, and commit it alone as `chore: bump version to X.Y.Z`.
2. Push the tag `vX.Y.Z` on `main`. `.github/workflows/release.yml` builds a draft release with the installer, portable zip and dmg.
3. Edit the draft: title and notes as below, then publish it as a **Pre-release**. The user switches it to a full release.

The title is always the tag, `vX.Y.Z`, with nothing else. The notes cover every user-facing change since the last version bump, in English, and follow this form (leave out empty sections):

```markdown
## X.Y.Z Release Notes

### New
- **Feature name**: what the user can now do.

### Changed
- What works differently now.

### Fixed
- What went wrong, from the user's side, and that it no longer does.

## Download
- **Windows**: `CornerFlag_X.Y.Z_x64-setup.exe` (installer) or `CornerFlag-vX.Y.Z-portable.zip`
- **macOS (Apple silicon)**: `CornerFlag_X.Y.Z_aarch64.dmg`

The app is not code-signed.
- Windows: if SmartScreen warns, click **More info** → **Run anyway**.
- macOS: open the app once, then go to **System Settings** → **Privacy & Security** → **Open Anyway**.
```

- A section for one platform only gets the platform in its heading, e.g. `### Fixed (macOS)`.
- Describe what the user sees, not the code: no file, function or commit names. Name buttons and settings in bold as the app shows them.
- Anything the user should know when upgrading goes in one line after the download notes.
