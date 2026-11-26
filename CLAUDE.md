# CLAUDE.md — Working rules for this repo

Project: **Yerdema Subs** — Chrome/Edge MV3 extension that translates English video subtitles to
Turkish in real time.
Goal: understand English content without interruption (not language learning). Original v0.1 requirements: `SPEC.md`. v0.1 progress: `TASKS.md`. Plan: `ROADMAP.md`.

## Working mode
Interactive: the user is available. v0.1.0 (`TASKS.md`) and v0.2.0 are released; current plan and all ideas
live in `ROADMAP.md`. Ask only when a decision is genuinely the user's (e.g. paid services,
product direction); otherwise choose the simplest option and log it in `DECISIONS.md`.

## State & memory
- `ROADMAP.md` is the persistent state for new work; update item status as it changes.
- Keep `DECISIONS.md` updated.

## Quality gates (run after every phase, fix before committing)
1. `npm run typecheck`
2. `npm test`
3. `npm run build` (from Phase 2 onwards)

## Git
- Remote: `origin` = github.com/YerdemA/yerdema-subs (public). Push only when the user asks.
- Commit after each completed phase (more often is fine). Conventional Commits in English,
  e.g. `feat(youtube): intercept timedtext responses`.
- Never commit `node_modules/`, `dist/`, `release/`.

## Code style
- TypeScript strict, no `any` (use `unknown` + narrowing). Small pure functions in `src/shared/`
  so they can be unit-tested.
- Code, comments, commit messages, README.md: English. `README.tr.md`, `MANUAL_TEST.md`: Turkish.
- No runtime dependencies. Keep dev dependencies minimal.
- npm scripts must work on **Windows 11** (cross-platform; use Node scripts, not `rm`/`cp`).
- New features come from `ROADMAP.md`.

## Environment notes
- The user's machine is Windows 11; the shell may be Git Bash. Use forward slashes in paths in
  scripts, and `node scripts/xyz.mjs` style helpers.
- You can verify the Google endpoint with `curl` (it's public, no key).
- You cannot click inside a real browser; verify the extension through unit tests, build output
  checks and (stretch) Playwright.
