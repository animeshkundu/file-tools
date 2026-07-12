# Implement bounded-memory streaming Unzip

- Date: 2026-07-12
- Owner: file-tools
- Controller marker: `unit-id: 236d30c0-62e2-4cf5-960b-1164a6b38e84`
- Related research:
  [`../research/2026-07-12-implement-real-typescript-code-not-a-plan-docs-file-for-boun.md`](../research/2026-07-12-implement-real-typescript-code-not-a-plan-docs-file-for-boun.md)

## Scope

Implementation edits are limited to:

- `entrypoints/app/App.tsx`
- `lib/core/worker.ts`
- `lib/tools/unzip/**`
- `tests/unzip.test.ts`

`lib/core/safety.ts`, shared components, dependencies, package metadata, docs, workflows, CSP,
release infrastructure, and deferred roadmap tools are not implementation files for this unit.

## Step-by-step plan

1. **Lock the public limits and worker protocol in `lib/tools/unzip/types.ts`.**
   - Define the fixed input cap, bounded read size, per-entry output cap, progress shape, streamed
     entry shape, and metadata-only completion/error shapes.
   - Make the extraction request carry a `File`, not an `ArrayBuffer`.
   - Keep limits explicit and integer-safe so tests can use small overrides without weakening
     production defaults.

2. **Refactor `lib/tools/unzip/extract.ts` into a bounded, sequential extraction session.**
   - Preserve all current central/local header consistency, entry-kind, path, declared-size, CRC,
     unsupported-format, and corpus behavior.
   - Read archive metadata and payload through validated `File.slice()` ranges of fixed maximum
     size; do not perform a whole-file `arrayBuffer()` read.
   - Feed fflate in archive order and retain chunks for only the active entry.
   - Before storing every output chunk, reject a per-entry overrun and invoke the existing
     aggregate emitted-byte budget.
   - CRC-check and emit each completed entry immediately, then clear its chunk references before
     advancing.
   - Report archive-byte progress monotonically and finish at 100%.
   - Keep the existing synchronous `extractZip(Uint8Array, limits)` behavior needed by unchanged
     corpus tests, backed by the same safety rules where practical.

3. **Update `lib/tools/unzip/unzip.worker.ts` to stream protocol events.**
   - Receive a structured-cloned `File`.
   - Await the bounded extractor, forwarding progress and one entry at a time.
   - Transfer each completed entry's buffer immediately and send a completion event without an
     entries array.
   - Convert all read/parser/safety failures into one terminal error event and release local
     references in `finally`.

4. **Harden lifecycle handling in `lib/core/worker.ts`.**
   - Post the `File` directly without reading it on the page.
   - Route non-terminal progress and entry messages to callbacks without settling the controller.
   - Centralize idempotent cleanup that clears the timeout, detaches worker handlers, terminates the
     worker, and resolves/rejects once.
   - Apply that cleanup on success, worker-reported error, malformed protocol, `worker.onerror`,
     timeout, and explicit cancel.
   - Ignore late messages from a terminated or superseded operation.

5. **Enforce the boundary and wire UI state in `entrypoints/app/App.tsx`.**
   - Reject an oversized file before calling `runUnzipWorker`; retain the current extension check.
   - Track a 0-100 determinate percentage and streamed entries for only the active operation.
   - Render an emerald determinate progress bar with accessible current/min/max values and
     status text; retain the existing visible Cancel button.
   - On cancel, timeout, error, reset, replacement, and unmount, cancel the active controller and
     clear partial entries, progress, and stale callbacks.
   - On success, retain only the page-owned transferred entries needed by the current ready and
     download behavior; ensure reset/unmount drops those references.
   - Preserve existing copy, layout, theme, file tree, and download behavior.

6. **Add regression and adversarial tests in `tests/unzip.test.ts`.**
   - Prove a file one byte above the input cap is rejected before worker construction/message.
   - Instrument a file-like source to prove reads are bounded slices and no whole-file
     `arrayBuffer()` path is used.
   - Prove a single entry crossing its local cap fails before the crossing chunk is retained.
   - Prove multiple entries crossing the aggregate cap fail even when each entry is individually
     valid.
   - Prove entries are emitted sequentially and worker-side buffers are handed off per entry.
   - Use a fake Worker and fake timers to prove progress does not settle the operation; cancel and
     timeout terminate once, reject once, clear handlers/timers, and ignore late messages.
   - Prove partial-entry callbacks are discarded by cleanup after cancellation/error.
   - Retain the current real-ZIP round trip and declared-size regression coverage.

7. **Run the repository gates and production exercise.**
   - Run `npm run check` and retain verbatim compile, lint, and Vitest output.
   - Run `npm run build` and `npm run build:firefox`.
   - Use the repository verification flow to load the production app and exercise a real ZIP:
     observe monotonic determinate progress, cancel an active extraction, complete extraction,
     download one entry and all entries, and verify reset releases the result state.
   - Select an over-cap file and verify rejection occurs without worker startup.
   - Confirm no changed file calls `file.arrayBuffer()` on a complete input and no files outside the
     assigned paths changed.

## Acceptance-criterion verification

1. **Bounded-memory streaming Unzip:** direct tests cover the pre-worker input cap, bounded slice
   reads, sequential entry delivery, per-entry and aggregate pre-write checks, progress,
   cancellation, timeout, and cleanup. Production Chrome and Firefox builds are exercised with real
   success and cancel flows.
2. **No-egress CSP:** no CSP or CI-gate files are changed by this unit. Both production builds must
   remain green; dedicated CSP acceptance remains owned by its separate serialized unit.
3. **Hardened safety and corpus:** `lib/core/safety.ts` remains untouched. `npm run check` must run
   the unchanged safety and corpus suites, proving the refactor still routes entries through their
   existing policies.
4. **Capability contract:** preserve current local/no-upload UI language and introduce no network
   or permission API. Broader docs/store-listing normalization is outside this unit.
5. **Accessibility AA:** the changed progress UI receives determinate ARIA values and the native
   Cancel button stays keyboard-operable and visible. Broader automated accessibility CI remains
   outside this unit.
6. **Standing streams and foundations:** no workflow, Pages, release, or harness files are changed.
   Their implementation and acceptance remain owned by separate serialized units.

## Key risks

- Metadata-at-end ZIP reads must stay bounded and reject malformed offsets before slicing.
- fflate callback failures and async file-read failures must converge on the same terminal cleanup.
- Worker termination races must not deliver stale entries into a newer React operation.
- Successful output remains page-owned until download/reset; the bounded-memory improvement removes
  whole-input and duplicate worker retention, but the current UI still requires bounded successful
  entry bytes.
- The standard-ZIP boundary and existing adversarial corpus behavior must not regress while the
  input source changes.

