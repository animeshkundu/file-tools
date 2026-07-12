# QA Audit — current main

**Date:** 2026-07-12  
**Reviewed revision:** `8d58700` (scaffold: seed agentic-dev conventions, #6)  
**Branch audited:** `main`  
**Correlation:** `unit-id: b1c4c7d6-0736-4caa-ab31-573bae3f66d8`  
**North-star references:** `docs/ARCHITECTURE.md`, `docs/PRODUCT-SPEC.md`, `docs/PEER-REVIEW.md`, `CLAUDE.md`  
**Current phase boundary:** Phase 1 (Unzip flagship seed); no other tools are in scope for this audit.

---

## Executive verdict

The repository has a sound durable-page / Web-Worker skeleton and no network APIs were found in
application source. The visual theme matches the design spec. However, six criteria from the
current-phase acceptance checklist are not fully satisfied and must be addressed before a release:

| Criterion | Status |
|---|---|
| Bounded-memory Unzip | **PARTIAL** — whole-file pre-read on main thread; all outputs retained simultaneously; no input-size gate |
| No-egress CSP completeness | **PARTIAL** — critical deny directives absent from built manifest |
| Safety primitives | **PARTIAL** — path checks present; bidi, Windows-reserved, case-collision, and long-name gaps |
| Adversarial-corpus test fixtures | **NOT SATISFIED** — no adversarial fixture files committed |
| WCAG AA on Unzip UI | **PARTIAL** — live regions, focus management, and reduced-motion missing |
| Dependency pinning | **NOT SATISFIED** — all ranges use caret (`^`), exact pinning not applied |

---

## Section 1 — Bounded-memory Unzip gaps

### 1.1 Whole-file read on the main thread before worker starts

**File:** `lib/core/worker.ts:41`  
**Severity:** HIGH  

```ts
void file.arrayBuffer().then(
  (buffer) => {
```

`file.arrayBuffer()` is called on the main-UI thread and reads the complete file into a single
contiguous `ArrayBuffer` before the buffer is transferred to the worker. This means:

- The UI thread is responsible for the full allocation for the life of the read.
- Input-size limits, cancellation, and safety accounting cannot act until after the read completes.
- A 4 GB ZIP (permitted by the browser's file picker) saturates main-thread heap before the worker
  receives a byte.
- A `cancel()` called while `arrayBuffer()` is in-flight terminates the worker but cannot abort the
  read; the buffer is allocated and discarded silently.

**Required fix:** enforce a maximum input file size in the app page before calling `runUnzipWorker`;
inside the worker, receive a `File` handle (or bounded stream) and read it in chunks, never calling
`arrayBuffer()` on the whole file.

### 1.2 All extracted entries retained in memory simultaneously

**File:** `lib/tools/unzip/unzip.worker.ts:9–11`  
**Severity:** HIGH  

```ts
const entries = extractZip(new Uint8Array(event.data.archive));
const totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
const response: UnzipWorkerResponse = { type: 'complete', entries, totalBytes };
const buffers = entries.map((entry) => entry.bytes.buffer);
self.postMessage(response, { transfer: buffers });
```

All extracted entry buffers are held in the `entries` array while `postMessage` serialises the
response. Peak in-worker memory is `sizeof(archive) + sum(sizeof(each_entry))`.  For a 512 MB cap
on extracted output the worker may hold ≈ 1 GB simultaneously.  The received `archive` argument is
the transferred `ArrayBuffer`, so after transfer it is detached, but `new Uint8Array(event.data.archive)`
wraps the already-detached buffer — it is the previous line's `file.arrayBuffer()` copy that is
actually transferred.

**Required fix:** stream entries to the app page one at a time; release each entry buffer before
processing the next; never hold archive + all outputs in memory together.

### 1.3 Per-entry pre-allocation from untrusted declared size

**File:** `lib/tools/unzip/extract.ts:33`  
**Severity:** MEDIUM  

```ts
let bytes = new Uint8Array(file.originalSize ?? 0);
```

`file.originalSize` comes from the ZIP local-file header, which is attacker-controlled.  A
crafted archive can declare `originalSize = 0x7FFFFFFF` (2 GB) for a 1-byte entry to trigger a
2 GB allocation before any decompressed byte is received.  `budget.checkDeclaredSize` is called
just above (line 30), but the 512 MB cap expressed as a `bigint` does not prevent a per-entry
allocation of up to 512 MB even when total emitted output is small.

**Required fix:** allocate a small initial buffer and grow dynamically (the `appendChunk` helper
already does this); do not seed the buffer from the declared size.

### 1.4 No input file size gate before extraction

**File:** `entrypoints/app/App.tsx:31`  
**Severity:** HIGH  

```ts
const controller = runUnzipWorker(file);
```

`file.size` is never checked before passing to `runUnzipWorker`. There is no maximum input-file
size enforced at the app-page boundary.  The `DEFAULT_ARCHIVE_LIMITS.maxEmittedBytes` cap of
512 MB governs emitted output only; a 4 GB input ZIP with all-stored entries can exceed that
before any limit fires.

**Required fix:** reject files above a stated maximum input size (e.g., 2 GB or configurable)
before starting the worker.

### 1.5 Indeterminate progress with no real value

**File:** `components/Progress.tsx:3–5`  
**Severity:** LOW (UX/accessibility; see also Section 4)**  

```tsx
<div className="h-2 overflow-hidden rounded-full bg-emerald-100" role="progressbar">
  <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-600" />
</div>
```

The progress bar has no `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, or `aria-label`.  The
animation is hardcoded to one-third and pulsing; it conveys no information about actual progress.
For indeterminate state ARIA requires `aria-valuenow` to be omitted and `aria-label` to be present.

**Required fix (memory):** emit per-entry progress events from the worker; update
`aria-valuenow`/`aria-valuemax` in the UI. Until streaming is implemented, at minimum add
`aria-label="Extracting…"` and remove `aria-valuenow`.

### 1.6 Cancellation cannot abort an in-flight arrayBuffer read

**File:** `lib/core/worker.ts:55–60`  
**Severity:** MEDIUM  

```ts
cancel: () => {
  if (settled) return;
  settled = true;
  worker.terminate();
  rejectPromise(new Error('Extraction cancelled.'));
},
```

Calling `cancel()` while `file.arrayBuffer()` is still reading sets `settled = true` and
terminates the worker, but the `arrayBuffer()` Promise continues to the `then` callback.  The
callback guards `if (settled) return` before posting to the worker, so the buffer is not
transferred, but the allocation and read complete in full on the main thread before the guard is
reached.  There is no way to abort `file.arrayBuffer()` mid-read without an `AbortController`
passed to a `ReadableStream`-based read.

**Required fix:** use a `ReadableStream` with an `AbortController` signal to allow mid-read
cancellation, or move the file read into the worker using a transferred `File` object.

### 1.7 Object URL revoke timeout may be too short

**File:** `lib/core/download.ts:7`  
**Severity:** LOW  

```ts
window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
```

Revoking after 1 second is fragile on slow systems or where the browser has not yet initiated the
download. Some browsers schedule downloads asynchronously; a 1-second revoke may fire before the
download agent reads the blob, producing a failed download.

**Required fix:** listen to an appropriate event or use a longer timeout (5–10 s); or pass the
blob directly to `<a download>` in browsers that support it.

---

## Section 2 — CSP and manifest egress posture

### 2.1 Missing deny directives in the built manifest

**File:** `wxt.config.ts:13`  
**Built artifact:** `.output/chrome-mv3/manifest.json`  
**Severity:** HIGH  

Current shipped CSP:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'
```

Required deny/local-only directives that are absent:

| Directive | Required value | Risk if absent |
|---|---|---|
| `default-src` | `'none'` | Unspecified resource types fall back to permissive browser default |
| `connect-src` | `'none'` | `fetch`, `XMLHttpRequest`, WebSocket, EventSource egress permitted |
| `form-action` | `'none'` | Form submissions can create cross-origin navigation/egress |
| `frame-src` | `'none'` | Iframes to external origins are permitted |
| `base-uri` | `'none'` | `<base href>` injection can redirect relative URLs |
| `worker-src` | `'self'` | Worker origin not restricted (falls back to `child-src` then `default-src`) |
| `style-src` | `'self'` | Inline styles and external style sheets not restricted |
| `img-src` | `'self' data:` | External image loads not restricted |
| `font-src` | `'self'` | External font loads not restricted |
| `media-src` | `'none'` | Audio/video loads not restricted |
| `object-src` | `'none'` | `object-src 'self'` allows local plugin objects; should be `'none'` |

The product's capability contract states "no upload" and "no network"; the CSP must enforce
`connect-src 'none'` and `form-action 'none'` at the policy level to make that contract auditable.

**Required fix:** replace the `content_security_policy.extension_pages` value with a complete
deny-first policy in `wxt.config.ts`.

### 2.2 No CI check for egress-capable sources in built manifests

**Files:** `.github/workflows/` (no relevant workflow found)  
**Severity:** HIGH  

There is no automated check that fails CI if `connect-src`, `form-action`, `frame-src`, or other
egress-capable directives appear with non-deny values in `.output/*/manifest.json`. Without this
gate, a future dependency update or WXT upgrade could silently loosen the CSP with no review
signal.

**Required fix:** add a CI step (e.g., a small Node script or `jq` assertion) that parses the
built Chrome and Firefox manifests and asserts the absence of any egress-capable source.

### 2.3 Firefox manifest not audited

**File:** `.output/firefox-mv3/manifest.json` (not present; build not run for Firefox in this session)  
**Severity:** MEDIUM  

The Firefox build (`npm run build:firefox`) was not produced during this audit session.  The CSP
in `wxt.config.ts` is shared, but WXT may transform or supplement it differently for Firefox MV3.
The same CSP completeness check must be applied to the Firefox output.

**Required verification:** run `npm run build:firefox` and inspect `.output/firefox-mv3/manifest.json`
to confirm the same or stricter CSP is emitted.

---

## Section 3 — safety.ts and adversarial-corpus coverage

### 3.1 No adversarial test fixtures committed

**Files:** `tests/` (only `safety.test.ts` and `unzip.test.ts` present)  
**Severity:** HIGH (release gate per `CLAUDE.md`)  

`CLAUDE.md` states: "The adversarial archive corpus is a release gate, not future cleanup."
The required fixture classes are:

| Class | Present? |
|---|---|
| CRC corruption | No |
| Local vs. central directory disagreement | No |
| Unsupported compression methods (e.g., method 99) | No |
| Duplicate entry paths | No |
| Case-colliding paths (e.g., `Foo.txt` + `foo.txt`) | No |
| Oversized entry names | No |
| Unicode bidi-override spoofing | No |
| Windows reserved names (CON, NUL, COM1…) | No |
| Truncated archives | No |

**Required fix:** create binary fixture files under `tests/fixtures/adversarial/` for each class
and add test cases in `tests/unzip.test.ts` that assert crash/hang/bypass do not occur.

### 3.2 Windows reserved name not rejected

**File:** `lib/core/safety.ts:26–54`  
**Severity:** MEDIUM  

`safeArchivePath` does not reject Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`,
`LPT1`–`LPT9`). An archive entry named `NUL` or `COM1` would pass validation and be presented to
the user for download. On Windows the browser may refuse to save such a file or silently redirect
output.

**Required fix:** add a Windows-reserved-name check inside `safeArchivePath`.

### 3.3 Unicode bidi-override characters not rejected

**File:** `lib/core/safety.ts:28–34`  
**Severity:** MEDIUM  

The control-character check covers codepoints `≤ 31` and `127` (DEL), but does not cover Unicode
bidi-override characters: U+202A, U+202B, U+202C, U+202D, U+202E (RIGHT-TO-LEFT OVERRIDE), U+2066
through U+2069, and U+200F. These characters make a path like `cod‮txt.exe` display as
`codexe.txt` in the file tree, enabling social engineering.

**Required fix:** extend the unsafe-character check in `safeArchivePath` to include the Unicode
bidi-control range.

### 3.4 No maximum filename length check

**File:** `lib/core/safety.ts:26–54`  
**Severity:** LOW  

Individual filename segments are not length-limited. A path segment of 65 000 characters passes
validation. On macOS / Linux the filesystem limit is 255 bytes (UTF-8); on Windows it is 260
characters by default (or 32 767 with long paths enabled). An oversized filename produces a failed
download silently.

**Required fix:** reject any path segment longer than 255 bytes (UTF-8-encoded).

### 3.5 Case-insensitive filesystem collision not detected

**File:** `lib/core/safety.ts:98–101`  
**Severity:** MEDIUM  

The duplicate-path check uses a `Set<string>` with exact string equality:

```ts
if (this.paths.has(safePath)) {
  throw new ArchiveSafetyError('Archive contains duplicate entry paths.');
}
```

On macOS (HFS+, APFS default) and Windows (NTFS), the filesystem is case-insensitive, so an
archive with entries `Readme.txt` and `readme.txt` passes the check but both entries attempt to
write the same on-disk path. The second download overwrites or fails silently.

**Required fix:** normalise paths to lowercase before insertion into `this.paths`, or detect the
collision at download time and append a disambiguator.

### 3.6 BigInt conversion from NaN not guarded

**File:** `lib/tools/unzip/extract.ts:30`  
**Severity:** LOW  

```ts
if (file.originalSize !== undefined) budget.checkDeclaredSize(BigInt(file.originalSize));
```

`BigInt(NaN)` throws a `TypeError`, not an `ArchiveSafetyError`. If fflate ever sets
`originalSize` to `NaN` (possible for corrupt archives), the worker emits an unhandled exception
rather than a typed safety error.

**Required fix:** guard with `Number.isFinite(file.originalSize)` before the `BigInt` conversion,
or catch and rethrow as `ArchiveSafetyError`.

### 3.7 Emitted-byte check in ondata callback throws but fflate may not propagate

**File:** `lib/tools/unzip/extract.ts:35–42`  
**Severity:** MEDIUM  

```ts
file.ondata = (error, chunk, final) => {
  if (error) throw error;
  budget.addEmittedBytes(chunk.byteLength);
  bytes = appendChunk(bytes, chunk, size);
  size += chunk.byteLength;
  if (final) entries.push({ path, bytes: bytes.slice(0, size), size });
};
```

`budget.addEmittedBytes` can throw `ArchiveSafetyError` inside the `ondata` callback. Whether
`fflate`'s `Unzip.push` propagates that exception to the caller of `extractZip` is implementation-
dependent (fflate's streaming callbacks are invoked synchronously from `push`, so propagation
works at present, but this is not a documented contract). A future fflate version that catches
callback exceptions would silently bypass the cap.

**Required fix:** track a `cancelled` flag outside the callback; after `push` returns, check the
flag; do not rely solely on throw-from-callback for safety enforcement.

---

## Section 4 — WCAG AA on the Unzip UI

### 4.1 progressbar missing accessible name and value attributes

**File:** `components/Progress.tsx:3`  
**Severity:** HIGH (WCAG 2.1 SC 4.1.2 Name, Role, Value)  

```tsx
<div className="…" role="progressbar">
```

ARIA 1.1 requires `progressbar` to have an accessible name. For indeterminate state `aria-valuenow`
must be absent but `aria-label` (or `aria-labelledby`) is required. Neither is present.

**Required fix:** add `aria-label="Extracting archive"` to the progressbar element.

### 4.2 No live region for status transitions

**File:** `entrypoints/app/App.tsx` (status state machine, lines 86–134)  
**Severity:** HIGH (WCAG 2.1 SC 4.1.3 Status Messages)  

The UI transitions between `idle`, `extracting`, `ready`, and `error` states by conditionally
rendering sections. Screen readers receive no announcement of these transitions because:

- The extracting `<section>` is mounted and unmounted without a live region.
- The error `<section>` has no `role="alert"` or `aria-live="assertive"`.
- The ready `<section>` has no `aria-live="polite"` announcement.

**Required fix:**
- Add `role="alert"` to the error section (line 101).
- Add an `aria-live="polite"` announcement element for ready and extracting transitions.

### 4.3 No aria-busy on the extracting section

**File:** `entrypoints/app/App.tsx:87`  
**Severity:** MEDIUM (WCAG 2.1 SC 4.1.2)  

The extracting section does not carry `aria-busy="true"`, which communicates to AT that content is
updating.

**Required fix:** add `aria-busy="true"` to the extracting section.

### 4.4 Scrollable file list not keyboard-reachable

**File:** `components/FileTree.tsx:18`  
**Severity:** HIGH (WCAG 2.1 SC 2.1.1 Keyboard)  

```tsx
<ul className="max-h-96 divide-y divide-stone-100 overflow-auto">
```

The `<ul>` has a scrollable overflow region but no `tabIndex="0"`, so keyboard-only users cannot
scroll through a file list that exceeds the visible height.

**Required fix:** add `tabIndex={0}` and `aria-label="File list"` to the scrollable `<ul>`.

### 4.5 Dropzone missing aria-label

**File:** `lib/core/dropzone.tsx:26`  
**Severity:** MEDIUM (WCAG 2.1 SC 4.1.2)  

The dropzone div has `role="button"` and `tabIndex={0}` but no explicit `aria-label`. Its
accessible name is computed from its inner text "Drop a ZIP file here" + "or click to choose one
from your device", which is acceptable but verbose. Adding a concise `aria-label` improves AT
experience.

**Required fix:** add `aria-label="Select ZIP file"` (or equivalent) to the role="button" element.

### 4.6 No prefers-reduced-motion support

**File:** `components/Progress.tsx:4`  
**Severity:** MEDIUM (WCAG 2.1 SC 2.3.3 Animation from Interactions — AAA, but also SC 1.4.3 operable)  

```tsx
<div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-600" />
```

The `animate-pulse` Tailwind class does not respect `prefers-reduced-motion: reduce`. Users who
configure their OS to reduce motion will still see the pulsing animation.

**Required fix:** wrap the animation in `motion-safe:animate-pulse` (Tailwind's
`prefers-reduced-motion` variant) so it is suppressed when the user prefers reduced motion.

### 4.7 No automated accessibility CI

**Files:** `.github/workflows/` (no a11y workflow present)  
**Severity:** MEDIUM  

There is no automated CI check using axe-core, Playwright accessibility assertions, or similar.
The shipped light theme has not been verified by an automated contrast checker against WCAG AA
4.5:1 (normal text) and 3:1 (large text) thresholds.

**Required fix:** add an axe-core scan (or Playwright `checkAccessibility`) as a CI step; record
pass/fail in the release checklist.

---

## Section 5 — Correctness and security risks

### 5.1 Dependency ranges use caret (`^`), not exact pins

**File:** `package.json` (all `dependencies` and `devDependencies`)  
**Severity:** HIGH (release gate per `CLAUDE.md`)  

`CLAUDE.md` states: "Replace the existing dependency ranges with exact versions, then keep all
dependencies and development dependencies pinned. Do not use `latest`, caret, or tilde ranges."
Every dependency uses `^` (caret) ranges.  A `npm ci` can install a different minor or patch
version of `fflate`, `client-zip`, or `wxt` on each CI run, making the build non-reproducible.

**Required fix:** pin all dependencies to exact versions; keep `package-lock.json` committed and
synchronise `THIRD-PARTY.md` with the pinned installed versions.

### 5.2 THIRD-PARTY.md may be out of date with actual installed versions

**File:** `THIRD-PARTY.md`  
**Severity:** MEDIUM  

`CLAUDE.md` requires `THIRD-PARTY.md` to list "package, exact installed version, provenance where
relevant, and SPDX license" for every shipped dependency and WASM artifact. The current
`THIRD-PARTY.md` has not been verified against `package-lock.json` in this audit. Until
dependencies are pinned and `THIRD-PARTY.md` is regenerated from locked versions, the notice is
unreliable.

**Required verification:** diff `THIRD-PARTY.md` entries against the versions in `package-lock.json`.

### 5.3 Worker leak path if arrayBuffer rejects after worker creation

**File:** `lib/core/worker.ts:32–52`  
**Severity:** LOW  

```ts
const worker = new Worker(…);
…
void file.arrayBuffer().then(
  (buffer) => { if (settled) return; … worker.postMessage(…); },
  () => {
    if (settled) return;
    settled = true;
    worker.terminate();
    rejectPromise(…);
  },
);
```

If `cancel()` is called between the `new Worker(…)` call and the resolution of `arrayBuffer()`,
`settled` is set to `true` and the worker is terminated by `cancel()`.  The `arrayBuffer` rejection
handler then enters `if (settled) return`, which skips the second `worker.terminate()`.  This path
is safe.  However, if `arrayBuffer()` resolves after `cancel()` has run, the resolved-value handler
does `if (settled) return` without terminating the worker a second time — the worker was already
terminated by `cancel()`, so this is also safe.  The analysis is correct but the flow requires
careful reading; a comment would reduce future regression risk.

### 5.4 Blob download cast masks type safety

**File:** `entrypoints/app/App.tsx:47`  
**Severity:** LOW  

```ts
downloadBlob(new Blob([entry.bytes as BlobPart]), …);
```

`entry.bytes` is `Uint8Array`, which is a valid `BlobPart`, but the `as BlobPart` cast suppresses
TypeScript's check. If the type of `entry.bytes` were ever changed, the cast would hide the error.

**Required fix:** remove the cast; `Uint8Array` is assignable to `BlobPart` directly.

### 5.5 `entries.reduce` totalBytes may overflow

**File:** `lib/tools/unzip/unzip.worker.ts:9` and `entrypoints/app/App.tsx:63`  
**Severity:** LOW  

```ts
const totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
```

`entry.size` is `number`. With the 512 MB cap this is unlikely to overflow a 53-bit integer, but
if the cap is raised, the addition of many entries could silently lose precision. The aggregate
budget is tracked as `bigint` in `ArchiveSafetyBudget`; the `totalBytes` displayed in the UI is
recomputed as `number` without the same precision guarantee.

---

## Section 6 — Limitations of this review

- **Static review only.** Source review cannot confirm runtime privacy, actual memory consumption,
  cancellation effectiveness, or CSP enforcement in a running browser extension. The findings above
  are based on code paths; live execution measurement is required before release.
- **No production-artifact integration tests run.** Worker load, cancellation, nested downloads,
  filenames, and offline operation were not verified by loading the extension in Chrome or Firefox.
- **Firefox build not inspected.** `npm run build:firefox` was not run; the Firefox manifest CSP
  was not checked.
- **No assistive-technology verification.** WCAG findings are based on code inspection; VoiceOver,
  NVDA, and JAWS screen reader behaviour was not tested.
- **No memory profiling.** Memory claims in Section 1 are derived from code paths; Chrome DevTools
  heap profiling under realistic ZIP files is required to confirm peak footprints.
- **No network egress verification.** The CSP gaps identified in Section 2 represent permitted
  egress in the policy; no outbound traffic was captured or confirmed.

---

## Section 7 — Out of scope for this audit

- Future-phase tools (hash, PDF, image, convert, compress, encrypt, QR, diff).
- Zip64 / TAR / bzip2 / xz / RAR / 7z support.
- The central-directory streaming engine.
- Capture / share features.
- Offline service worker or Pages deployment.
- Multi-browser OS matrix release testing.

---

## Prioritised follow-up list

| # | Severity | Finding | File(s):line | Outcome |
|---|---|---|---|---|
| F-01 | HIGH | No input-file size gate before worker | `App.tsx:31` | Reject files above stated max before `runUnzipWorker` |
| F-02 | HIGH | Whole-file arrayBuffer on main thread | `worker.ts:41` | Stream file to worker; never call `arrayBuffer()` on full file |
| F-03 | HIGH | All entries retained simultaneously | `unzip.worker.ts:9–11` | Stream entries one-at-a-time; release before next |
| F-04 | HIGH | Missing CSP deny directives | `wxt.config.ts:13` | Add `connect-src`, `form-action`, `frame-src`, `base-uri`, `default-src 'none'`, etc. |
| F-05 | HIGH | No CI manifest egress check | `.github/workflows/` | Add CI assertion on built manifest CSP |
| F-06 | HIGH | No adversarial fixtures | `tests/` | Add fixtures for all 9 required adversarial classes |
| F-07 | HIGH | progressbar missing accessible name | `Progress.tsx:3` | Add `aria-label="Extracting archive"` |
| F-08 | HIGH | No live region for status transitions | `App.tsx:101,111` | Add `role="alert"` and `aria-live` |
| F-09 | HIGH | Scrollable list not keyboard-reachable | `FileTree.tsx:18` | Add `tabIndex={0}` |
| F-10 | HIGH | Dependencies not pinned to exact versions | `package.json` | Pin all versions; update `THIRD-PARTY.md` |
| F-11 | MEDIUM | Per-entry allocation from untrusted declared size | `extract.ts:33` | Allocate small initial buffer; grow dynamically |
| F-12 | MEDIUM | Cancellation cannot abort arrayBuffer read | `worker.ts:55–60` | Use AbortController + ReadableStream or move read to worker |
| F-13 | MEDIUM | Windows reserved names not rejected | `safety.ts:26–54` | Add reserved-name check |
| F-14 | MEDIUM | Bidi-override characters not rejected | `safety.ts:28–34` | Add bidi-override unicode range check |
| F-15 | MEDIUM | Case-insensitive collision not detected | `safety.ts:98–101` | Normalise to lowercase in duplicate-path Set |
| F-16 | MEDIUM | Emitted-byte cap relies on throw-from-callback | `extract.ts:35–42` | Add explicit cancellation flag outside callback |
| F-17 | MEDIUM | No aria-busy on extracting section | `App.tsx:87` | Add `aria-busy="true"` |
| F-18 | MEDIUM | Dropzone accessible name verbose | `dropzone.tsx:26` | Add concise `aria-label` |
| F-19 | MEDIUM | No prefers-reduced-motion support | `Progress.tsx:4` | Use `motion-safe:animate-pulse` |
| F-20 | MEDIUM | No automated accessibility CI | `.github/workflows/` | Add axe-core scan in CI |
| F-21 | MEDIUM | THIRD-PARTY.md not verified against lock file | `THIRD-PARTY.md` | Diff and reconcile with `package-lock.json` |
| F-22 | LOW | Object URL revoke timeout too short | `download.ts:7` | Extend timeout or use event-driven revoke |
| F-23 | LOW | BigInt conversion from NaN not guarded | `extract.ts:30` | Guard with `Number.isFinite` |
| F-24 | LOW | No maximum filename length | `safety.ts:26–54` | Reject segments > 255 UTF-8 bytes |
| F-25 | LOW | Blob download type cast | `App.tsx:47` | Remove `as BlobPart` cast |
| F-26 | LOW | totalBytes computed as number not bigint | `unzip.worker.ts:9`, `App.tsx:63` | Use bigint accumulator or document the limitation |

---

## Build confirmation

```
> file-tools@0.1.0 build
> wxt build

WXT 0.20.27
[info] Building chrome-mv3 for production with Vite 8.1.4
[success] Built extension in 387 ms
  .output/chrome-mv3/manifest.json                    542 B
  .output/chrome-mv3/app.html                         434 B
  .output/chrome-mv3/assets/unzip.worker-paBPl86I.js  10.37 kB
  .output/chrome-mv3/background.js                    605 B
  .output/chrome-mv3/chunks/app-DmZkL-r_.js           204.63 kB
  .output/chrome-mv3/assets/app-DC573Xsq.css          17.41 kB
[success] Finished in 581 ms
```

Build passes on current main. No production code, tests, configuration, or workflows were modified
by this audit.
