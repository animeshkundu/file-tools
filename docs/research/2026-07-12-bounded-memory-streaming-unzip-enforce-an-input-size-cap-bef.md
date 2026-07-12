# Bounded-memory streaming Unzip research

- **Date:** 2026-07-12
- **Owner:** Unzip work unit
- **Controller:** `unit-id: a95c4c3e-0f52-4105-b32b-a58a532c7a5b`
- **Related:** PR #8

## Context and research question

Determine the smallest change within `entrypoints/app/App.tsx`, `lib/core/worker.ts`,
`lib/tools/unzip/**`, and `tests/unzip.test.ts` that can bound Unzip memory, provide determinate
progress and cancellation, and preserve the existing standard-ZIP safety checks. The separately
deferred ZIP central-directory engine and all other roadmap tools are out of scope.

## Findings

1. `App.tsx` validates only the `.zip` suffix. It starts a worker before enforcing an input-size
   cap, retains every returned `Uint8Array`, renders indeterminate progress, and does not cancel an
   active operation when reset or replaced.
2. `runUnzipWorker` calls `file.arrayBuffer()` on the page, then transfers the complete archive.
   Cancellation and timeout terminate the worker but cannot abort that whole-file read. The timeout
   is cleared on worker completion/error, but not on cancellation or page-side read failure.
3. The worker accepts an `ArrayBuffer`, invokes synchronous `extractZip`, and returns all extracted
   buffers in one message. It has no progress, entry, cancellation acknowledgement, or cleanup
   protocol.
4. `extractZip` uses fflate's streaming `Unzip`, but receives the archive in one push. It checks
   aggregate emitted bytes before retaining each decoded chunk, then stores all chunks for every
   entry and concatenates each entry, temporarily duplicating that entry in memory.
5. `extractZip` first parses the complete central directory and reconciles local headers, names,
   methods, flags, CRCs, and sizes. Removing these checks would regress the committed adversarial
   corpus. Because the central directory is at the end of a ZIP, the streaming design must retain
   the existing validation behavior without expanding into the deferred general central-directory
   engine.
6. `ArchiveSafetyBudget` already enforces aggregate emitted bytes, declared bytes, entry count,
   path constraints, recursion depth, and wall time. This work unit does not own
   `lib/core/safety.ts`, so a stricter per-entry/in-flight limit belongs at the Unzip boundary and
   aggregate accounting must continue to use the shared budget.
7. Existing Unzip tests cover a round trip, aggregate emitted-byte overflow, and cumulative
   declared-size overflow. They do not cover input rejection, per-entry/in-flight limits,
   incremental progress, cancellation, timeout cleanup, or buffer release.

## Decision

Plan a file-based worker protocol: reject oversized input in `App.tsx` before worker construction,
structured-clone the `File`, read bounded slices in the worker, and yield between slices so
cancellation is observable. Keep fflate within standard ZIP support and preserve the current
local/central metadata and CRC checks. Add explicit per-entry and in-flight byte limits checked
before retaining a decoded chunk, stream progress/events to the controller, and centralize terminal
cleanup so success, error, timeout, and cancellation clear timers, terminate the worker, discard
partial buffers, and release page-owned URLs/buffers.

Determinate progress should be based on compressed input bytes consumed over `File.size`, with a
final 100% completion event. It must not infer extraction progress from untrusted declared
uncompressed sizes.

## Acceptance evidence to collect during implementation

- An oversized file is rejected before `new Worker(...)` or any file read.
- No complete-input `File.arrayBuffer()` call remains; only bounded slices are read in the worker.
- Per-entry, aggregate, and in-flight limits reject before accepting the crossing chunk.
- Progress is monotonic and reaches 100% only after validation completes.
- Cancel and timeout reject once and clean timers, worker state, partial chunks, and object URLs.
- Existing round-trip and adversarial corpus tests remain green.
- `npm run check`, `npm run build`, and `npm run build:firefox` pass.
- The built app is driven with a real ZIP to verify progress, cancellation, filenames, and output.

## Sources

- `CLAUDE.md:53-59`
- `docs/ARCHITECTURE.md:118-169`
- `docs/PEER-REVIEW.md:15`
- `entrypoints/app/App.tsx:21-63`
- `lib/core/worker.ts:8-63`
- `lib/core/safety.ts:97-193`
- `lib/tools/unzip/extract.ts:235-295`
- `lib/tools/unzip/types.ts:7-14`
- `lib/tools/unzip/unzip.worker.ts:4-19`
- `tests/unzip.test.ts:29-47`
