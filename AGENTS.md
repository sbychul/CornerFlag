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
