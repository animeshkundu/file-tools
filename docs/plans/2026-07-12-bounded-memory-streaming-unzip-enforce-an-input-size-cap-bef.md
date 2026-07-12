# Bounded-memory streaming Unzip implementation plan

- **Date:** 2026-07-12
- **Owner:** Unzip work unit
- **Controller:** `unit-id: a95c4c3e-0f52-4105-b32b-a58a532c7a5b`
- **Related:** PR #8 and the matching research entry

## Scope

Implementation is limited to:

- `entrypoints/app/App.tsx`
- `lib/core/worker.ts`
- `lib/tools/unzip/**`
- `tests/unzip.test.ts`

Do not implement other roadmap tools, a general ZIP central-directory engine, capture features, a
release, CSP/CI/Pages work, or unrelated safety changes.

## Plan

- [ ] Define fixed input, per-entry, chunk, and maximum in-flight limits beside the Unzip protocol.
      Extend request/response types for a structured-cloned `File`, monotonic progress, streamed
      entry delivery, terminal completion/error, and cancellation.
- [ ] In `App.tsx`, reject unsupported or oversized input before constructing a worker. Track
      determinate progress, ignore stale operation events, cancel during reset/replacement/unmount,
      and release all operation-owned buffers or URLs on success replacement, error, timeout, and
      cancellation while preserving the shipped warm-neutral emerald UI.
- [ ] Refactor `runUnzipWorker` into a single-settlement controller. Post the `File` without a
      transfer list, forward progress/entry events, clear the timeout on every terminal path,
      terminate on success/error/timeout/cancel, and prevent late events from mutating state.
- [ ] Make the Unzip worker read only bounded `File.slice(...).arrayBuffer()` chunks. Yield between
      reads, report compressed bytes consumed against `File.size`, observe cancellation, and clear
      parser references and partial output in `finally`.
- [ ] Adapt extraction to incremental input while preserving fflate's standard-ZIP boundary,
      existing local/central consistency validation, CRC validation, path safety, and aggregate
      `ArchiveSafetyBudget` accounting. Process one entry at a time; before retaining each decoded
      chunk, enforce per-entry, aggregate, and in-flight caps; transfer completed entry data and
      release worker ownership before proceeding.
- [ ] Extend `tests/unzip.test.ts` with deterministic boundary tests for exact-limit acceptance and
      one-byte overflow, aggregate overflow across entries, progress monotonicity, mid-operation
      cancellation, timeout/single settlement, and cleanup of partial chunks and worker state.
- [ ] Run the focused Unzip test first, then `npm run check`, `npm run build`, and
      `npm run build:firefox`. Load the production app and exercise a real ZIP through success and
      cancellation, confirming progress, output bytes, filenames, and cleanup.

## Acceptance criteria

- Input size is checked before worker creation and no complete input is read with
  `File.arrayBuffer()`.
- Worker input reads are bounded; decoded chunks are rejected before crossing per-entry, aggregate,
  or in-flight limits.
- Entries are processed sequentially and no operation retains archive bytes plus all decoded
  outputs in the worker.
- Progress is determinate and monotonic; cancellation interrupts active work rather than merely
  changing UI state.
- Success, error, timeout, cancellation, reset, and replacement each have one terminal outcome and
  release timers, worker state, partial buffers, and URLs.
- Existing ZIP safety behavior and the committed adversarial corpus continue to pass.

## Verification record

Planning baseline on 2026-07-12:

- `npm ci` — passed; npm reported pre-existing dependency advisories for later dependency-owner
  review.
- `npm run check` — passed: TypeScript, ESLint, and 37 Vitest tests.
- GitHub Actions run `29200038527` — `action_required` before job creation; no job logs exist.
