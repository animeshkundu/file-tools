# Architecture: File Tools

This is the deep architecture reference for the extension. [`../CLAUDE.md`](../CLAUDE.md) is the
short, load-bearing contract (the rules an agent must not violate); this document explains *why*
those rules exist, what is actually shipped versus planned, and how the pieces fit together. The
product and market rationale live in [`research/ext-1-file-tools.md`](research/ext-1-file-tools.md)
(§7 in particular is the source for the cross-browser build strategy summarized below).

Scope note: this doc describes the repo as it exists today (a single WXT application with
one shipped tool, Unzip). Every "target" or "planned" item below is explicitly labeled as
such. Nothing in the "target" sections is implemented yet.

## 1. Overview

File Tools is a cross-browser MV3 WebExtension (Chrome + Firefox) that runs file operations
entirely on-device: no upload, no account, no ads, no network calls, minimal permissions. The
seed release ships one tool, ZIP extraction, built on WXT, React 19, TypeScript (strict), and
Tailwind v4. The manifest requests zero permissions.

The one-line architecture, unpacked over the rest of this document:

> A durable extension page owns the UI. A background script is glue only. All CPU-heavy work runs
> in a Web Worker spawned by the page. Output goes out as a client-side download. Nothing leaves
> the device.

**Program-level context.** The research program this extension comes from envisions a shared
`packages/core` plus sibling apps (`packages/file`, `packages/media`, `packages/photo`, and so on)
reusing the same worker/safety/download primitives. That monorepo does not exist today: this repo
is a single, standalone WXT application with no `packages/` split. Treat the monorepo as the
program's long-term target, not as a structure to describe as already in place.

## 2. System architecture

### 2.1 MV3 surfaces

| Surface | File | Role | Lifetime |
| --- | --- | --- | --- |
| App page | `entrypoints/app/` (`App.tsx`, `main.tsx`, `index.html`) | Durable UI host: file picker/drop target, progress, results tree, downloads | Lives as long as the tab is open |
| Background | `entrypoints/background.ts` | Glue only: `browser.action.onClicked` opens the app page in a new tab | Chrome: service worker, spun up/down by events. Firefox: non-persistent event page |

`background.ts` is five lines and does one thing:

```ts
browser.action.onClicked.addListener(async () => {
  await browser.tabs.create({ url: browser.runtime.getURL('/app.html') });
});
```

This is deliberate, not an oversight. MV3 service workers are terminated by the browser after
~30 seconds of idle, have no DOM, and (on Chrome) no synchronous access to a lot of the platform
surface a file tool needs. Firefox's MV3 background is an event page with different but similarly
unreliable lifetime guarantees. Neither is a place to hold multi-second-to-multi-minute CPU work
or large in-memory buffers. So the background's only job, in both browsers, is: react to the
toolbar click, open the durable page, get out of the way. Everything else (state, workers,
downloads) happens in the page, which the user keeps open for as long as the job takes.

### 2.2 Durable page + Web Worker compute model

The app page is a normal React tree (`App.tsx`) that owns UI state (`idle` / `extracting` /
`ready` / `error`) and delegates all archive processing to a dedicated Worker. The page never
parses ZIP structure or touches fflate directly: `lib/core/worker.ts` (`runUnzipWorker`) is the
only bridge between page and worker.

`runUnzipWorker` today:

- Spawns a module worker: `new Worker(new URL('../tools/unzip/unzip.worker.ts', import.meta.url), { type: 'module' })`.
- Enforces a 30 second wall-clock timeout via `window.setTimeout`, independent of the safety
  module's own internal wall-time cap (defense in depth: even if the worker never reports back,
  the page gives up and frees the UI).
- Exposes `cancel()`, which calls `worker.terminate()` and rejects the pending promise. This is
  the only cancellation mechanism; there is no cooperative in-worker abort signal today.
- Resolves/rejects a single promise once, guarded by a `settled` flag so timeout, message, error,
  and cancel can race safely without double-resolving.

### 2.3 Worker message contract

The current contract (`lib/tools/unzip/types.ts`) is intentionally small: one request shape, one
response union:

```ts
type UnzipWorkerRequest = { type: 'extract'; archive: ArrayBuffer };

type UnzipWorkerResponse =
  | { type: 'complete'; entries: ExtractedEntry[]; totalBytes: number }
  | { type: 'error'; message: string };
```

There is no `progress` message today (the UI shows an indeterminate spinner during `extracting`,
not a percentage) and no `cancel` message understood by the worker itself: cancellation is
"terminate the worker from the outside," not a message the worker cooperates with. That stays true
in the planned contract too (§3.4); the only planned addition is a `progress` message type, not a
cooperative in-worker abort.

### 2.4 Data flow (as shipped)

```
 [user]                [app page]                    [unzip worker]
   │  drop/pick .zip       │                                │
   ├──────────────────────►│                                │
   │                       │ file.arrayBuffer()              │
   │                       │  (reads the WHOLE file)         │
   │                       ├── postMessage(archive, [xfer]) ─►│
   │                       │                                │ new Unzip(...)
   │                       │                                │  + ArchiveSafetyBudget
   │                       │                                │  fflate inflate per entry
   │                       │                                │  (buffers full entry bytes)
   │                       │◄── postMessage(complete/error) ┤
   │                       │      (all entries, transferred) │
   │   render file tree     │                                │
   │◄──────────────────────┤                                │
   │  click "download" /    │                                │
   │  "download all"        │                                │
   ├──────────────────────►│ objectURL + <a download>        │
   │                       │  (or client-zip rebuild for      │
   │                       │   "download all")                │
```

Step by step:

1. User drops or picks a file in `Dropzone` (`lib/core/dropzone.tsx`); `App.tsx` rejects anything
   not named `*.zip` before doing any work.
2. `runUnzipWorker(file)` spawns the worker and calls `file.arrayBuffer()`, reading the entire
   file into memory on the page, then transfers that `ArrayBuffer` into the worker.
3. The worker's `onmessage` (`unzip.worker.ts`) calls `extractZip` (`lib/tools/unzip/extract.ts`),
   which drives fflate's streaming `Unzip` parser entry-by-entry, but accumulates each entry's
   bytes into a growable buffer and only pushes the entry into the result array once the entry is
   fully inflated. Every entry and every emitted chunk passes through `ArchiveSafetyBudget`.
4. The worker posts one `complete` (all entries + total bytes, entry buffers transferred back) or
   one `error` message, then the page's promise settles and the worker is terminated either way.
5. `App.tsx` renders the entry list in `FileTree`. Per-file download goes through
   `downloadBlob` (objectURL + `<a download>` + delayed `revokeObjectURL`). "Download all" rebuilds
   a fresh ZIP client-side with `client-zip`'s `downloadZip` and downloads that as one file.

## 3. Seed vs. target

This is the section to read before assuming any capability below exists. The seed is real and
shipped; the ceilings are real and currently in production; the target is design intent from the
research doc, not code.

### 3.1 Shipped today (the seed)

- One tool: ZIP extraction, via fflate's streaming inflate + a mandatory safety budget.
- One worker type, spawned fresh per extraction and terminated on completion/error/cancel/timeout.
- Whole-archive request/response messages (no progress channel, no per-entry streaming).
- Output via `objectURL` + anchor download only; "download all" via a client-rebuilt ZIP
  (`client-zip`). No File System Access, no `downloads` API usage, no side panel.
- Zero manifest permissions, zero WASM binaries shipped, zero network calls.

### 3.2 Current ceilings (real limits of the seed, not hypothetical)

| Ceiling | Where | What actually happens | Practical effect |
| --- | --- | --- | --- |
| Whole-input read | `lib/core/worker.ts`, `runUnzipWorker` | `file.arrayBuffer()` reads the **entire** selected file into page memory before anything is transferred to the worker | Memory use for input scales linearly with archive size; a very large ZIP has to fit in the tab's memory just to start |
| Whole-output buffering | `lib/tools/unzip/extract.ts`, `extractZip` | Every extracted entry's bytes are accumulated in a growable `Uint8Array` and all entries are collected into one array, transferred back to the page in a single `complete` message | Peak memory scales with total *extracted* size, not just archive size; the only backstop is the 512 MiB `maxEmittedBytes` safety cap (that cap exists for safety against zip bombs, not as a deliberate memory-management strategy) |
| Single worker, single tool | `lib/core/worker.ts` + `lib/tools/unzip/` | There is exactly one worker file, one message contract, hand-written for this one tool | Nothing here is reusable yet across a second tool; every future tool would need its own copy-paste of the spawn/timeout/cancel plumbing unless factored out first |

These are not bugs. The safety budget's 512 MiB cap and 30s wall-time cap mean the worst case is
bounded and fails safely (see §9). But "bounded by a hard cap" and "streams so memory doesn't grow
with input size" are different properties, and today the extension has the former, not the latter.

### 3.3 Planned evolution (target, not built)

- **Streamed input.** Read the file via `File.stream()` / a `ReadableStream` and push chunks into
  fflate's streaming `Unzip.push()` incrementally, instead of materializing the whole archive with
  `file.arrayBuffer()` first. Memory for input then scales with chunk size, not archive size.
- **Streamed/lazy output.** Emit entries as they finish (one `entry` message per completed file,
  or a per-entry stream sink) instead of collecting everything into one `complete` payload. On
  Chrome, pair this with File System Access streaming writes (`createWritable`) so bytes can go
  straight to disk without ever fully residing in page memory.
- **Per-tool worker model.** Generalize `lib/core/worker.ts` into a shared spawn/timeout/cancel
  harness parameterized by a per-tool message contract (§3.4), so a new tool adds a worker file and
  a types file, not a new copy of the plumbing. Whether that becomes one shared worker or a small
  pool per tool is an open question to settle when the second tool is built.
- **`downloads`-API tree output.** For multi-file results, use `browser.downloads.download()` with
  relative `filename` paths to recreate the folder structure under the Downloads directory on
  Firefox and as the Chrome fallback, instead of only offering a rebuilt single ZIP.
- **Chrome-only enhancements, feature-detected.** File System Access "save to a folder" and
  `sidePanel` quick access, gated behind `optional_permissions` / capability checks, never in the
  critical path (see §4 and §7).
- **Permissions plan.** The manifest stays at zero permissions for the ZIP-in/ZIP-out core. Beyond
  that, the plan is to request each capability lazily, only when a feature that needs it is
  actually used: `"downloads"` via `optional_permissions`, requested at the moment the user chooses
  tree-preserving multi-file save (not at install); `"storage"` for persisted settings; `"sidePanel"`
  only for the optional Chrome quick-access surface. Host permissions and content scripts are never
  requested, for any feature.
- **Heavy-codec loading model (RAR/7z, later).** When a Pro codec ships, its runtime is bundled
  with the extension (never fetched from a third-party CDN; MV3's CSP forbids remote code anyway),
  lazy-loaded only on first use of that format, and its compiled module cached in IndexedDB so
  repeat use doesn't re-fetch/re-instantiate the same multi-megabyte WASM payload from the
  extension's own bundle every time.

### 3.4 Target message contract shape

The shape the target per-tool worker protocol is expected to converge on (illustrative, not yet
implemented):

```ts
type WorkerRequest<Op extends string, Payload> = {
  type: 'request';
  op: Op;                      // e.g. 'extract', 'hash', 'convert'
  payload: Payload;            // e.g. { archive: ReadableStream<Uint8Array> }
  // transferables are passed separately to postMessage(request, transferables),
  // not embedded in the message value itself
};

type WorkerProgress = {
  type: 'progress';
  processed: number;           // bytes or entries processed so far
  total: number | null;        // null when not knowable up front
  currentEntry?: string;
};

type WorkerComplete<Result> = { type: 'complete'; result: Result };
type WorkerError = { type: 'error'; code: string; message: string };

// cancellation stays out-of-band: the page calls worker.terminate(), same as today,
// no in-worker cooperative abort message
```

Today's `UnzipWorkerRequest`/`UnzipWorkerResponse` (§2.3) does not match this shape field-for-field
(no `op`, no `payload` wrapper, no `progress`, no `code` on error); treat this as a planned
protocol migration for new tools, not a claim that the current contract already fits it.

## 4. Tech choices and rationale

| Choice | Why |
| --- | --- |
| **WXT** (0.20.x) | Single config (`wxt.config.ts`) targets both Chrome and Firefox manifests from one source, handles the `browser.*`/`chrome.*` namespace shimming, HMR dev builds, and `zip`/`zip:firefox` packaging, removing the hand-rolled dual-manifest build that a from-scratch MV3 extension would need. |
| **React 19** | The app page is a normal single-page app, not a constrained popup; React's component model fits the file-tree/progress/status UI without extra machinery. |
| **TypeScript strict** | Archive parsing and path sanitization are exactly the kind of code where a wrong type (`number` vs `bigint` for a Zip64 field, a `string` that should have been validated) becomes a security bug (§9); strict mode is a floor, not a preference. |
| **Tailwind v4** (`@tailwindcss/vite`) | Utility classes keep the small UI (dropzone, tree, progress, buttons) stylable without a CSS-module build step; v4's Vite plugin integrates directly into WXT's Vite pipeline. |
| **Web Worker over MV3 service worker for compute** | The service worker/event page can be killed by the browser at any time and has no reliable long-lived execution budget; a Worker owned by the durable app page lives exactly as long as the tab does and is the only place large synchronous/CPU-bound decompression work belongs. |
| **Web Worker over `chrome.offscreen`** | `chrome.offscreen` exists only on Chrome; using it would mean a second code path for Firefox. A tab page + Worker does the same job (host a persistent context for heavy work) on both browsers with one implementation. |
| **objectURL + anchor download over File System Access, in the core** | FSA (`showDirectoryPicker`/`createWritable`) is Chrome/Edge-only. The core flow (works everywhere, no permission prompt) has to be `URL.createObjectURL` + `<a download>`; FSA is reserved for an optional, feature-detected enhancement layer (§3.3, §7), never a dependency of the base flow. |

## 5. Library / dependency table

Shipped versions are pinned exactly as recorded in `package.json` / `package-lock.json` and
mirrored in [`THIRD-PARTY.md`](THIRD-PARTY.md), which is the source of truth for the BOM.
Planned rows are what the research doc (§7.1 of `ext-1-file-tools.md`) recommends for future tools
and are **not installed**.

| Package | Version | SPDX | Why | Risk |
| --- | --- | --- | --- | --- |
| `fflate` | 0.8.3 (shipped) | MIT | Streaming ZIP decompression; the extraction engine behind the seed Unzip tool | Standard ZIP + DEFLATE + gzip only. **No Zip64 (>4 GB), no TAR container parsing, no bzip2.** Do not extend its use past that boundary; see the two rows below for what covers the gap. |
| `client-zip` | 2.5.0 (shipped) | MIT | Rebuilds a fresh ZIP client-side for the "download all" flow; stream-compatible, so it also remains the intended engine for streaming/very-large ZIP *creation* (as opposed to encrypted or Zip64 *reading*, which is `@zip.js/zip.js`'s job below) | Low risk; actively maintained, no native/WASM component. |
| `hash-wasm` | 4.12.0 (shipped, unused by any tool yet) | MIT | Incremental hashing (`init`/`update`/`digest`) for large files, installed ahead of the planned hashing tool | `SubtleCrypto.digest()` (native, see below) is one-shot and cannot stream a large file; this is the only correct source for MD5 (WebCrypto has none) and for incremental SHA on multi-GB files. MD5 must stay labeled compatibility-only, never a security primitive. |
| `SubtleCrypto.digest()` | native (planned use) | native | One-shot SHA-1/256/384/512 hashing for files small enough to buffer whole | **One-shot only, not incremental.** Fine for small/medium files; large files must go through `hash-wasm`'s incremental API instead, or `SubtleCrypto.digest()` will require the whole file in memory at once. Has no MD5. |
| `react`, `react-dom` | 19.2.7 (shipped) | MIT | UI runtime | Low risk, standard. |
| `scheduler` | 0.27.0 (shipped, transitive) | MIT | React runtime dependency | Low risk. |
| `@zip.js/zip.js` | planned | BSD-3 | Target engine for **reading** Zip64 (>4 GB), AES/ZipCrypto password-protected, and split ZIP archives, plus streaming ZIP creation as an alternative to client-zip, the cases fflate explicitly doesn't cover | Low license risk; larger bundle than fflate, so it should be lazy-loaded only when a file needs it, not bundled into the base page. |
| `DecompressionStream` | native (planned use) | native | Browser-native gzip/deflate decompression, usable for the gzip layer of `.gz`/`.tar.gz` without a dependency | Low risk; covers gzip only, not the TAR container itself or other codecs. |
| TAR reader (e.g. a small dedicated parser) | planned | TBD at selection time | fflate does gzip but does not parse the TAR container; a dedicated reader is needed for `.tar`/`.tar.gz` | Must be picked and license-reviewed before adding; `DecompressionStream` (above) can do the gzip layer in both browsers without a dependency. |
| `file-type` | planned | MIT | Magic-byte container/type sniffing for the metadata tool | Low risk. |
| `exifr` | planned | MIT | EXIF/IPTC metadata extraction for the metadata tool | Low risk. |
| `node-unrar-js` | planned, **Pro/later only** | bundles **non-free RarLab UnRAR** | RAR extraction | **License risk.** UnRAR's license forbids reusing its code to build a RAR compressor and constrains redistribution. Requires a per-artifact SPDX + provenance BOM entry and explicit review before shipping; never ship without it. |
| `libarchive.js` | planned, **Pro/later only** | BSD-2, **but verify provenance** | Alternative RAR/7z/TAR/ZIP reader | The core library is BSD-2, but its RAR reader may include UnRAR-derived code; provenance must be verified per release before treating it as clean. |
| `7z-wasm` | planned, **Pro/later only** | LGPL **+ bundled UnRAR** | 7z extraction | Large WASM payload (lazy-load only) and a bundled non-free component; same license-review gate as RAR above applies. |

Guardrails that must not be silently relaxed when these are added: native `btoa`/`atob` throw on
non-Latin1 input, so base64 encode bytes via `Uint8Array`/`TextEncoder` first, never assume
7-bit-clean strings. Split/merge stays native (`Blob.slice` / `new Blob([...])`), zero dependency.

## 6. Module boundaries

| Path | Owns |
| --- | --- |
| `entrypoints/app/` (`App.tsx`, `main.tsx`, `index.html`) | The durable UI: state machine, file intake, results rendering, wiring to `lib/core/*` |
| `entrypoints/background.ts` | Toolbar-click → open app tab. Nothing else. |
| `lib/core/safety.ts` | `ArchiveSafetyBudget`, `safeArchivePath`, `assertRegularEntry`, `DEFAULT_ARCHIVE_LIMITS`: the only place archive-safety policy is defined; every tool that walks an archive must route entries through this module. |
| `lib/core/worker.ts` | Worker lifecycle: spawn, timeout, message routing, cancel-via-terminate. Currently unzip-specific (`runUnzipWorker`); the generalization point for §3.3's shared harness. |
| `lib/core/download.ts` | `downloadBlob`: the objectURL + anchor download primitive every tool's "save result" action uses. |
| `lib/core/dropzone.tsx` | Drag-and-drop / file-picker input surface shared by tools. |
| `lib/core/format.ts` | Display formatting helpers (e.g. `formatBytes`). |
| `lib/tools/<name>/` | Per-tool implementation: `<name>.worker.ts` (the worker entry), `extract.ts` (or the tool's equivalent core logic), `types.ts` (the request/response contract). Today only `lib/tools/unzip/` exists. |
| `components/` | Presentational React components (`Button`, `FileTree`, `Progress`) shared across tools. |
| `tests/` | Vitest specs, one per module under test (`safety.test.ts`, `unzip.test.ts`). |

**Rule for new tools** (from `../CLAUDE.md`, restated here with the reasoning): a new tool lives
entirely under `lib/tools/<name>/` with its own worker and message types, gets one tab/entry point
wired into `App.tsx`, and ships with a Vitest test. This keeps `lib/core/*` as the only shared
surface between tools, so adding tool #2 can't silently couple to tool #1's internals.

## 7. Cross-browser strategy

- **One codebase, one build config.** WXT's auto-imported `browser.*` namespace abstracts
  Chrome's callback/promise-mixed `chrome.*` API and Firefox's promise-native `browser.*` API
  behind one call site; `background.ts` and anywhere else that touches extension APIs never
  branch on browser.
- **`browser_specific_settings.gecko.id`** (`unzip@animesh.kundus.in`) is set in `wxt.config.ts` because
  Firefox requires an explicit add-on ID for signing/distribution; Chrome ignores this key.
- **`data_collection_permissions.required: ['none']`** is declared for Firefox's data-collection
  disclosure requirement, a direct, machine-checkable expression of "no data leaves the device."
- **Background lifetime differs by design, not by our code.** Firefox runs the background as a
  non-persistent event page; Chrome runs it as a service worker that can be killed after ~30s
  idle. Because `background.ts` holds no state and does no async work beyond firing one
  `tabs.create`, this difference is invisible to the extension: there is nothing to lose when
  either browser tears the background down.
- **Chrome-only APIs are feature-detected enhancements, never core dependencies.** File System
  Access (`showDirectoryPicker`) and `sidePanel` do not exist in Firefox; the target design (§3.3)
  gates them behind capability checks so the base flow (page + Worker + download) is identical in
  both browsers, and Chrome users additionally get the nicer folder-write / quick-access surfaces
  when available. `chrome.offscreen` is Chrome-only and is deliberately not used anywhere, even
  for Chrome: one code path beats a Chrome-only special case, per §4.
- **Build separation is explicit, not inferred.** `npm run build` targets Chrome (WXT's default);
  `npm run build:firefox` (`wxt build -b firefox`) produces the Firefox variant; `zip` / `zip:firefox`
  package each for store submission. There is no single "universal" artifact; CI/local verification
  has to run both.

## 8. Performance and memory budget

- **Hard cap today: 512 MiB of actual emitted bytes per archive** (`DEFAULT_ARCHIVE_LIMITS.maxEmittedBytes`,
  enforced in `ArchiveSafetyBudget.addEmittedBytes`, checked on every inflated chunk, not just at
  the end). This is the real ceiling on how much a single extraction can consume (see §3.2 for why
  it is a safety backstop rather than a streaming design today, and §3.3 for the streaming
  direction that would let the ceiling be less load-bearing).
- **30 second wall-clock cap**, enforced twice: once inside the worker via
  `ArchiveSafetyBudget.assertWithinTime` (checked against `performance.now()` on every entry and
  every chunk), and independently by `runUnzipWorker`'s `window.setTimeout` on the page side, which
  terminates the worker even if it never reports back. Two independent timers, not one, so a
  worker that hangs without throwing still gets killed.
- **Progress, cancel, cleanup-on-failure today:** progress is binary (extracting vs. done); there
  is no incremental progress event yet (§3.3 tracks adding one). Cancel is unconditional
  (`worker.terminate()`, no cooperative in-worker abort). Cleanup on any failure path (`error`,
  `cancel`, timeout, or `worker.onerror`) always terminates the worker and settles the promise
  exactly once, so a failed extraction never leaves a dangling worker.
- **Small base bundle, heavy formats lazy.** The seed only bundles fflate and client-zip, both
  small. The plan for RAR/7z (large WASM, §5) and even `@zip.js/zip.js` (larger than fflate) is to
  lazy-load them on first use rather than bundle them into the page's initial load; nothing in the
  seed does this yet because there is only one small engine to load.
- **WASM32 ceiling.** No WASM binary ships today (`THIRD-PARTY.md` states this explicitly). When
  a WASM codec (RAR/7z, hash-wasm's WASM path) is added, the practical linear-memory ceiling for a
  32-bit WASM module is roughly 2–4 GB; this is a hard upper bound on how large a single archive or
  file that codec can process without a 64-bit-memory strategy, independent of any safety-budget cap
  the extension sets below that.

## 9. Security model

The manifest is the first line of the security story: `permissions: []` (zero), no
`host_permissions`, no content scripts, and a strict extension-page CSP. The CSP blocks fetch,
XHR, WebSocket, beacon, form, and frame egress; source review confirms that the extension
implements no navigation or WebRTC egress. Everything is bundled locally. Although `hash-wasm`
is installed for a planned tool, it is not imported and no WASM binary ships today, so
`'wasm-unsafe-eval'` is intentionally absent until bundled WASM requires it.

The second line is `lib/core/safety.ts`, which every archive-walking tool must route through:

- **Zip-bomb defense against actual emitted bytes, not declared sizes.** `checkDeclaredSize`
  rejects an implausible declared size early, but the load-bearing check is `addEmittedBytes`,
  called on every real inflated chunk. A 42 KB archive that claims to hold petabytes is stopped
  by what actually comes out of the decompressor, not by trusting the archive's own metadata.
  Declared sizes are treated as untrusted hints throughout; Zip64-sized integers are parsed as
  `bigint` (`parseUnsignedLittleEndian`) so a maliciously large declared size can't wrap a 32-bit
  number.
- **Entry-count, path-depth, recursion-depth, and wall-time caps** (`maxEntries: 10_000`,
  `maxPathDepth: 32`, `maxRecursionDepth: 0`, `maxWallTimeMs: 30_000`) bound the other axes an
  archive can abuse besides raw byte volume, including that nested archives are never
  auto-extracted (`maxRecursionDepth: 0` means any recursion attempt is rejected outright; there is
  no "extract archives found inside archives" behavior today or planned as a default).
- **Zip-Slip sanitization after final filename decoding**, in `safeArchivePath`: rejects
  backslashes, control/NUL characters, absolute paths, UNC paths (`//server/share`), Windows
  drive-letter paths (`C:\`), and any `.`/`..` path segment, then resolves the remaining path
  against a fixed extraction root and re-checks that the resolved path still starts with that root
  before accepting it. This runs on the fully-decoded filename, which matters: sanitizing before
  decode would miss an entry name that only becomes `../` after charset decoding.
- **No symlinks or special files, as a policy every future archive-walker must enforce.**
  `assertRegularEntry` accepts only `'file'` and `'directory'` entry kinds and rejects anything else
  (`'symlink'`, `'special'`) before it can be written anywhere. Today's fflate-based unzip adapter
  derives that kind purely from whether the entry name ends in `/` (directory) or not (file); it
  does not decode ZIP external-attribute mode bits, so it is accurate to say the seed never
  *writes* a symlink or device today, but not accurate to say it actively detects and rejects one
  encoded inside a plain ZIP. The check earns its keep once a format with real symlink/special
  entries (tar, 7z, rar) is added, or if unzip decoding is extended to read those attributes.
- **Nested archives are never auto-recursed.** Combined with `maxRecursionDepth: 0`, opening an
  archive found inside another archive is not a feature the seed has or silently attempts.

## 10. Testing strategy

- **Unit tests (Vitest, `npm test` / `npm run test:watch`):**
  - `tests/safety.test.ts` exercises `safeArchivePath` directly against a table of unsafe inputs
    (`../etc/passwd`, `/etc/passwd`, a UNC path, a backslash path) and confirms each throws
    `ArchiveSafetyError`, plus a positive case for a legitimate nested relative path. It also drives
    `ArchiveSafetyBudget` directly: tripping the emitted-byte cap, and checking that a declared size
    at the top of the `bigint` range (`2n ** 64n - 1n`) is rejected rather than silently truncated.
  - `tests/unzip.test.ts` round-trips a real archive built with fflate's own `zipSync` through
    `extractZip` and asserts the recovered bytes match, plus one integration-level check that a
    tiny archive with an artificially low `maxEmittedBytes` limit is rejected during real
    extraction (not just against the budget object in isolation).
  - Honest gap, and a concrete planned requirement: today's tests exercise the safety primitives
    directly and one real-archive round-trip, but there isn't yet a library of adversarial archive
    *fixtures* run end-to-end through `extractZip`/the worker, such as a crafted zip-bomb-shaped
    archive (small compressed size, huge declared/actual expansion) or a Zip-Slip-shaped archive
    (entries whose names only become `../` after charset decoding). Adding that fixture corpus,
    alongside the existing direct unit tests, is the next concrete step for this section, not a
    redesign.
- **Static gate (`npm run check` = `compile && lint && test`):** TypeScript strict compilation,
  ESLint, and the Vitest suite must all pass. This is necessary but not sufficient.
- **The manual gate that `check` cannot replace, per `../CLAUDE.md`:** before any change is called
  done, load the actual **production** build as an unpacked extension (the output of
  `npm run build` for Chrome and `npm run build:firefox` for Firefox, not just `dev`/`dev:firefox`
  HMR mode) and drive the real tool: drop an actual ZIP, confirm the tree renders, download a file
  and the "download all" ZIP, and confirm cancel actually stops extraction. Passing tests proves
  the logic in isolation; it does not prove the worker spawns correctly, the download actually
  saves, or the production bundle behaves the same as dev mode.
- **Cross-browser build parity:** `npm run build` and `npm run build:firefox` must both succeed
  (and, for a release, both get manually driven per the gate above); a change that only gets
  verified against one target is not verified for this extension.
