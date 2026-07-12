# Bounded-memory streaming Unzip research

- Date: 2026-07-12
- Owner: file-tools
- Controller marker: `unit-id: 236d30c0-62e2-4cf5-960b-1164a6b38e84`

## Research question

What is the smallest implementation, within the assigned Unzip files, that removes the whole-file
page read, bounds worker-side reads and emitted output, reports determinate progress, and cleans up
reliably on completion, error, timeout, and cancellation?

## Current behavior

- `entrypoints/app/App.tsx:21-43` checks only the `.zip` suffix before creating a worker. It has no
  input byte limit, progress state, unmount cancellation, or partial-result cleanup.
- `lib/core/worker.ts:8-63` creates and terminates a worker, but calls `file.arrayBuffer()` in the
  page and transfers the complete archive. Its first worker message settles the promise, so the
  protocol cannot carry progress or one completed entry at a time.
- `lib/tools/unzip/types.ts:7-14` models a whole `ArrayBuffer` request and a single response holding
  all extracted entries.
- `lib/tools/unzip/unzip.worker.ts:4-19` extracts synchronously, retains every entry until the end,
  and transfers all buffers in one completion message.
- `lib/tools/unzip/extract.ts:235-296` uses fflate's streaming `Unzip`, but receives a complete
  archive, collects each entry's chunks, and retains all completed entries. Aggregate emitted bytes
  are checked before each chunk is retained, but there is no distinct per-entry byte cap.
- `tests/unzip.test.ts:29-48` covers a round trip and aggregate declared/emitted limits only. It
  does not cover the app input gate, streamed file reads, entry ordering, progress, cancellation,
  timeout, or cleanup.

These findings match the documented seed limitations in `CLAUDE.md:53-59`,
`docs/ARCHITECTURE.md:118-132`, and `docs/ARCHITECTURE.md:149-168`.

## Existing constraints to preserve

- The app page owns operation lifetime; heavy work stays in its dedicated Web Worker
  (`CLAUDE.md:19-28`).
- The page must pass the `File` or a bounded stream, and worker reads may call `arrayBuffer()` only
  on bounded slices (`CLAUDE.md:53-59`).
- Every entry continues through `ArchiveSafetyBudget`; `lib/core/safety.ts` is read-only for this
  unit. Its existing aggregate, path, entry-count, recursion, and wall-time checks remain
  load-bearing (`lib/core/safety.ts:97-193`).
- fflate remains within standard ZIP extraction. No dependency or package metadata changes are
  needed (`CLAUDE.md:32-39`).
- The existing central/local metadata, CRC, duplicate, special-file, and unsupported Zip64 checks
  in `lib/tools/unzip/extract.ts` must remain intact. The committed corpus in
  `tests/corpus.test.ts:63-112` must continue to pass.
- Only `entrypoints/app/App.tsx`, `lib/core/worker.ts`, `lib/tools/unzip/**`, and
  `tests/unzip.test.ts` belong to the implementation unit. CSP, workflows, Pages, release,
  standing-stream, broad accessibility, safety-module, and dependency work belong to other units.

## Proposed design

1. Add an exported fixed archive-input limit and a pure size assertion at the app boundary. Invoke
   it before `runUnzipWorker`, so an oversized file never creates or messages a worker.
2. Change the request payload from `ArrayBuffer` to structured-cloned `File`. In the worker, read
   only fixed-size `File.slice()` ranges and feed those ranges to extraction; never call
   `arrayBuffer()` on the complete `File`.
3. Preserve the current standard-ZIP metadata validation, adapting its reads to bounded file
   ranges rather than introducing a general central-directory engine. Zip64 remains explicitly
   unsupported by the extractor.
4. Refactor extraction around callbacks: emit progress as archive bytes are consumed, emit each
   completed entry immediately, and send a metadata-only completion event. Transfer each entry
   buffer as soon as it completes so worker ownership is released rather than retaining all
   outputs.
5. Keep only one entry accumulator active at a time. Before retaining each fflate output chunk,
   check both the entry-local total and `ArchiveSafetyBudget.addEmittedBytes` aggregate total.
   Finalize, CRC-check, emit, and clear that entry before accepting the next entry.
6. Make `runUnzipWorker` a multi-message controller with progress and entry callbacks. A single
   idempotent cleanup path clears the timeout, removes handlers, terminates the worker, and settles
   exactly once for completion, worker error, protocol error, timeout, or cancel.
7. In `App.tsx`, keep determinate percentage state, append transferred entries as they arrive, and
   expose the existing Cancel button as a real terminating action. On error, timeout, cancellation,
   reset, replacement, and unmount, terminate the controller and drop partial entry references.
   On success, worker-side buffers have been transferred and the worker is terminated; page-side
   entry bytes remain only because the ready UI needs them for download.
8. Render the determinate progress bar directly in `App.tsx` because `components/Progress.tsx` is
   outside this unit's ownership. Supply `role="progressbar"` and current/min/max ARIA values while
   preserving the warm-neutral emerald visual treatment.

## Risks and mitigations

- **ZIP metadata is at the end of the file.** Read only the bounded EOCD search window, then the
  validated central-directory range. Reject out-of-bounds ranges before slicing.
- **A compressed chunk can expand substantially.** Keep archive input chunks fixed and check the
  per-entry and aggregate output budgets before retaining each emitted chunk. The worker remains
  the isolation boundary.
- **Async callback exceptions can escape fflate.** Normalize parser, read, callback, and protocol
  failures to one worker `error` message and the controller's cleanup path.
- **Cancel can race progress, entry, completion, timeout, or worker errors.** Guard all terminal
  paths with one settled flag and ignore messages after settlement.
- **Partial entries can leak into React state after failure.** Gate callbacks to the active
  controller and clear accumulated entries on every non-success terminal path and unmount.
- **Existing corpus tests use the synchronous helper.** Preserve a compatible test-facing path or
  migrate its implementation without changing its public behavior, because `tests/corpus.test.ts`
  is outside this unit.
- **The ready UI inherently retains outputs.** This unit can eliminate duplicate worker retention
  and clean partial/failure state, but it cannot release successful page-side bytes before the user
  downloads or resets without changing the product's current output model.

## Verification implications

- Add focused Vitest coverage in `tests/unzip.test.ts` for the pre-worker input-size rejection,
  bounded slice reads, per-entry and aggregate chunk limits, sequential entry delivery,
  determinate progress, cancel races, timeout, worker termination, and partial-result cleanup.
- Keep real fflate round-trip and declared-size checks, and run the unchanged adversarial corpus.
- Before implementation handoff, run `npm run check`, `npm run build`, and
  `npm run build:firefox`, then exercise a production build with a real ZIP, progress, cancel,
  successful downloads, and a deliberately oversized selection.

