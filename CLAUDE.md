# CLAUDE.md — Working rules for this repo

Project: **Yerdema Subs** — Chrome/Edge MV3 extension that translates English video subtitles to
Turkish in real time. Full requirements: `SPEC.md` (source of truth). Progress: `TASKS.md`.

## Autonomous mode (most important)
The user is asleep and will NOT answer questions. Work **without stopping** until every item in
`TASKS.md` (excluding stretch goals unless DoD is done) is checked.
- **Never ask the user anything.** Never end a turn with "Should I continue?" / "Devam edeyim mi?".
- When something is ambiguous, choose the simplest option that satisfies `SPEC.md`, write it in
  `DECISIONS.md` (one line: decision + reason), and continue.
- When blocked (e.g. an API behaves differently than the spec says), find a workaround, log it in
  `DECISIONS.md`, continue. Only stop entirely if the environment itself is broken (e.g. Node
  missing) — then write the problem at the top of `TASKS.md` under `## BLOCKED`.
- After finishing a phase, immediately start the next one.
- If a fix attempt fails 3 times, simplify the approach instead of retrying the same thing.

## State & memory
- `TASKS.md` is the persistent state. Check items off (`- [x]`) as soon as they're done.
  After a context compaction or restart, re-read `CLAUDE.md`, `SPEC.md` and `TASKS.md` and
  resume from the first unchecked item.
- Keep `DECISIONS.md` updated.

## Quality gates (run after every phase, fix before committing)
1. `npm run typecheck`
2. `npm test`
3. `npm run build` (from Phase 2 onwards)

## Git
- Repo is local only. **Never `git push`**, never add remotes.
- Commit after each completed phase (more often is fine). Conventional Commits in English,
  e.g. `feat(youtube): intercept timedtext responses`.
- Never commit `node_modules/`, `dist/`, `release/`.

## Code style
- TypeScript strict, no `any` (use `unknown` + narrowing). Small pure functions in `src/shared/`
  so they can be unit-tested.
- Code, comments, commit messages, README.md: English. `README.tr.md`, `MANUAL_TEST.md`: Turkish.
- No runtime dependencies. Keep dev dependencies minimal.
- npm scripts must work on **Windows 11** (cross-platform; use Node scripts, not `rm`/`cp`).
- Don't add features outside `SPEC.md` (stretch goals only after DoD).

## Environment notes
- The user's machine is Windows 11; the shell may be Git Bash. Use forward slashes in paths in
  scripts, and `node scripts/xyz.mjs` style helpers.
- You can verify the Google endpoint with `curl` (it's public, no key).
- You cannot click inside a real browser; verify the extension through unit tests, build output
  checks and (stretch) Playwright.
