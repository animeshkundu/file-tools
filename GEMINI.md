# Repository guidance for animeshkundu/file-tools

## Project overview

Private offline ZIP extraction in your browser — nothing is uploaded.

Default branch: main

## Tech stack

JavaScript/TypeScript (npm), react

Package manager / build tool: npm

## Commands

Run the closest available command before handing off. If a command is ambiguous, keep the TODO rather than guessing.

- Install: `npm ci`
- Dev: `npm run dev`
- Build: `npm run build`
- Typecheck: `npm run compile`
- Lint: `npm run lint`
- Test: `npm run test`

## Definition of Done gate

A change is not ready for review or merge until all applicable checks below are satisfied with real command output in the PR:

- Build passes: `npm run build`
- Typecheck passes: `npm run compile`
- Lint passes: `npm run lint`
- Tests pass: `npm run test`
- Tests only go up: features and bug fixes add or strengthen tests; do not delete coverage to make a branch green.
- Acceptance criteria are explicitly verified against the changed behavior.
- No stub, skipped, or TODO-only implementation is counted as done.
- Documentation, ADRs, changelog, and history/learnings are updated in the same PR when behavior, architecture, process, or operational knowledge changes.
- CI is green on the required matrix (ubuntu-latest); branch protection and required checks are the merge gate.
- No attribution to tools or generated authorship appears in commits, PRs, docs, or code comments.
- UI-impacting changes include before/after screenshots or recorded browser evidence in the PR.

## Primary OS and portability

Primary OS: cross-platform. This is a browser extension with no OS-specific application code; it runs in Chrome and Firefox on any desktop OS, and CI validates on `ubuntu-latest`.

- Treat the primary OS as authoritative when behavior differs.
- Keep path handling portable; avoid shell-specific assumptions in application code.
- Add regression coverage for platform-specific fixes rather than skipping that platform.

## Conventions

- Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.
- Keep one concern per PR; split broad or vague work before implementation.
- Prefer small, reviewable changes with explicit acceptance criteria.
- Do not hide failures with retries, skipped tests, relaxed assertions, or platform carve-outs.
- Preserve existing style unless an accepted ADR says otherwise.

## Project structure

- `tests/` — Vitest unit tests plus the real-Firefox end-to-end suite under `tests/e2e/` (specs, `capture.mjs`, fixtures, and the anti-false-green guard). Hand-authored; no generated files are committed here.
- `docs/` — Product, engineering, and process docs, including `docs/adr/`, `docs/plans/`, `docs/research/`, `docs/history/`, and generated capture media under `docs/media/`. Author docs by hand; `docs/media/` is produced by `npm run capture`.
- `.github/` — GitHub Actions workflows (CI, E2E, Pages, Release) and the pull-request template. Hand-authored; no generated files.

## Decision records and durable memory

- ADRs live in `docs/adr/` for project-specific decisions; use `docs/adr/0000-template.md` as the Nygard-style template.
- Plans live in `docs/plans/YYYY-MM-DD-slug.md`.
- Research lives in `docs/research/YYYY-MM-DD-slug.md` with citations to source files or external URLs.
- Solved problems, incidents, and debugging notes live in `docs/history/YYYY-MM-DD-slug.md`.
- Durable project learnings live in `docs/LEARNINGS.md`; update it when a future contributor would otherwise rediscover the same fact.

## Handoff

Every handoff should include:

- What changed and why.
- Files touched and the important decisions made.
- Commands run with pass/fail results.
- Risks, follow-ups, and any intentionally deferred work.
- Links to PRs, issues, ADRs, plans, research, and history entries.

## Testing

- Framework: Vitest
- Test directory: tests/
- Test file glob: **/*.{test,spec}.{ts,tsx,js,jsx}
- Prefer tests that reproduce real failure modes, not only cooperative mocks.
- Bug fixes include a regression test that fails before the fix.
- Keep tests deterministic and independent; clean up external state.

## Gotchas

- Extraction is central-directory-driven and fails closed: prevalidate every entry against the central directory, then inflate only each entry's central-validated byte slice. Never push a whole archive to a streaming unzip. See `lib/tools/unzip/extract.ts` and `lib/core/safety.ts`.
