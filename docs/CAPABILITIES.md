# Privacy and Capability Contract

> Cross-references: [ARCHITECTURE](./ARCHITECTURE.md) · [VISION](./VISION.md) · [PRODUCT-SPEC](./PRODUCT-SPEC.md) · [PEER-REVIEW](./PEER-REVIEW.md)

This document states what the extension does and does not do today, what it technically prevents
versus what it promises, and what controls are in progress but not yet enforced. Every claim
here must be true on the current `main` branch at the time of reading. Controls described as
"target" or "pipeline" are not yet shipped.

---

## Canonical capability statement

> Local processing, no upload; zero install-time permissions for the core; optional `downloads`
> permission requested only at the moment the user invokes tree-preserving multi-file save —
> never at install.

This is a written contract, not a mechanical proof. The sections below say exactly what is and
is not technically enforced today.

---

## What is true today

### Zero install-time permissions

The shipped manifest declares `"permissions": []`. No permission is bundled into the extension
at install time. The user is never shown a permission prompt when installing the extension.

Verifiable in 10 seconds: open `wxt.config.ts`, find `permissions: []`. Build the extension
(`npm run build`) and open `.output/chrome-mv3/manifest.json` — there is no `permissions` key
or it is an empty array.

### Local-only processing

All file work — ZIP parsing, decompression, safety checking, archive assembly — runs on the
user's device. No file bytes, metadata, filenames, or results are transmitted to any server.

This is enforced by architecture, not by a CSP alone:

- The background service worker / event page (`entrypoints/background.ts`) is five lines. Its
  only job is to open the app tab when the toolbar icon is clicked. It has no file access and
  makes no network calls.
- All CPU-heavy work runs in a dedicated Web Worker spawned by the app page
  (`lib/core/worker.ts`). The worker has no access to the network outside of what the browser's
  own security model and the extension CSP allow.
- There are no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, or import-from-remote calls
  anywhere in the extension's source. CI greps the built bundle (`.output/**/*.js`) after each
  build and fails if any of these appear, so the shipped artifact carries no network primitives
  either.

### No host permissions

The manifest requests no host permissions. The extension cannot read or modify the content of
any web page, inject scripts, or access cross-origin resources. This is verifiable in the
manifest.

### Firefox data-collection declaration

The Firefox manifest includes:

```json
"data_collection_permissions": { "required": ["none"] }
```

This is a machine-readable declaration to AMO and Firefox users that the extension collects no
data. It is a declaration, not a technical enforcement.

### Archive safety enforcement

Every extracted entry passes through `lib/core/safety.ts` before its bytes reach the UI:

- **Zip-Slip prevention.** Paths containing `..`, absolute segments, UNC paths,
  drive-letter prefixes, backslashes, NUL or control characters are rejected outright.
- **Emitted-bytes cap.** A hard limit of 512 MiB of total inflated bytes is enforced entry by
  entry. Extraction is aborted before a limit is crossed; the oversized entry is never
  materialized.
- **Wall-clock cap.** A 30-second timeout is enforced independently by the worker's own safety
  budget and by a `window.setTimeout` on the page side. Either will terminate the worker even
  if it never responds.
- **Entry-count cap.** The number of entries is capped before inflating begins.
- **Symlinks and special files.** Rejected at the entry level.

### `wasm-unsafe-eval` in the CSP

The extension-page CSP today is:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'
```

`'wasm-unsafe-eval'` is present for future bundled WASM (e.g. `hash-wasm`). No WASM binary is
currently used by any shipped tool. The directive is scoped to `'self'` — only resources
bundled with the extension, never loaded from a remote URL.

### No telemetry, no account, no ads

There are no analytics calls, no crash reporters, no account systems, and no ad networks in the
source or in any shipped dependency.

---

## What the product promises but does not yet mechanically enforce

The following controls are accepted as planned work (see [PEER-REVIEW.md](./PEER-REVIEW.md),
finding #1). They are not present-tense facts about the current build.

### Full no-egress Content Security Policy (target)

The current CSP does not include `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`,
or `base-uri 'none'`. Adding these directives is planned before the first store release. Until
they are added, the CSP does not mechanically block fetch, form submissions, or frame loads at
the browser level, even though no such calls exist in the source today.

### CI check over built manifests (target)

A CI step that fails if the built manifest contains any egress-capable source or directive
(host permissions, unrestricted CSP directives, remote script sources) is planned but not yet
implemented. Source review is currently the enforcement path.

### Production-artifact integration tests (target)

Per-browser, per-OS integration tests that load the production build as an unpacked extension
and verify worker loading, cancellation, download behavior, offline operation, and CSP
enforcement are planned as a release gate but not yet implemented.

---

## Optional permissions: what exists and what is planned

### `downloads` permission (planned, not yet shipped)

The `downloads` API permission is not declared in the manifest today. It will be added as an
`optional_permissions` entry before the tree-preserving multi-file extract feature ships.

When implemented, the permission prompt will be triggered at the moment the user first chooses
"Extract all to folders." It will never be requested at install. Users who only extract
individual files or use the "Download all as ZIP" path will never be prompted for it.

### No other optional permissions planned for the core

The manifest is and will remain at zero install-time permissions for the ZIP-in/ZIP-out core.
Future capabilities under consideration (`"storage"` for user settings, `"sidePanel"` for
Chrome quick-access) would follow the same lazy-request pattern — requested only when the
feature is invoked, never bundled in at install time.

Host permissions and content scripts are not planned for any feature.

---

## What this contract does not prove

- **Zero permissions does not prove data cannot leave the device.** A zero-permission manifest
  blocks privileged cross-origin access (e.g. reading cross-origin pages), but it does not
  prevent a `fetch()` call in extension page JavaScript, a no-CORS image load, a form
  submission, or a `browser.tabs.create` navigation. The CSP and source review are the
  enforcement mechanisms; the permission model alone is not sufficient.
- **The current CSP is partial.** See "Full no-egress CSP" above. The missing directives mean
  the browser does not mechanically reject network fetch or form action attempts from the
  extension page today.
- **`data_collection_permissions: { "required": ["none"] }` is a declaration, not enforcement.** Firefox and
  AMO record the declaration and surface it to users; the browser does not technically prevent
  a future code change from collecting data. The source is the ground truth.

---

## How to verify the contract yourself

1. **Read the manifest.** Build the extension (`npm run build`) and open
   `.output/chrome-mv3/manifest.json`. Confirm `permissions` is absent or empty, and that
   `content_security_policy.extension_pages` contains no remote hosts.
2. **Read the background script.** Open `entrypoints/background.ts`. Confirm it only calls
   `browser.tabs.create` and contains no file access or network calls.
3. **Read the worker entry.** Open `lib/core/worker.ts` and `lib/tools/unzip/unzip.worker.ts`.
   Confirm there are no `fetch` or `XMLHttpRequest` calls. Then confirm the same for the built
   output: after `npm run build` and `npm run build:firefox`, run
   `grep -R -nE 'fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource' .output --include='*.js'`
   and confirm it finds nothing. CI runs this scan on every change and fails if a match appears.
4. **Review third-party dependencies.** Open `docs/THIRD-PARTY.md` for the full bill of materials.
   Inspect each package in `node_modules` or its source repository if you need higher assurance.
5. **Run the test suite.** `npm run check` runs the compiler, linter, and Vitest suite
   including safety tests over adversarial ZIP fixtures.
