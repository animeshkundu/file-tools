# File Tools - repository instructions

A cross-browser MV3 WebExtension built with WXT, React, strict TypeScript, and Tailwind for privacy-first, offline, client-side file tools, seeded by the Unzip flagship.

## Docs map

Read the relevant primary docs before changing behavior:

- [`docs/VISION.md`](docs/VISION.md) - product purpose, audience, positioning, and non-goals.
- [`docs/PRODUCT-SPEC.md`](docs/PRODUCT-SPEC.md) - tool tiers, requirements, acceptance criteria, and product constraints.
- [`docs/DESIGN.md`](docs/DESIGN.md) - shipped light theme, interaction states, accessibility, and the design mocks under [`mocks/`](mocks/).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - shipped system, target evolution, boundaries, dependencies, safety model, and testing strategy.
- [`docs/PUBLISHING.md`](docs/PUBLISHING.md) - reproducible Firefox and Chrome packaging, review, and release process.
- [`docs/PEER-REVIEW.md`](docs/PEER-REVIEW.md) - cross-lab critic findings and accepted dispositions. FIX-NOW and release-gate items are binding.
- [`ROADMAP.md`](ROADMAP.md) - phase order and current implementation status.

The original market research remains under [`.docs/`](.docs/), but the `docs/` suite is the primary product and engineering reference.

## Architecture - do not violate

- The durable host is the app page under `entrypoints/app/`, opened in a tab. It owns UI state and the lifetime of each operation.
- The MV3 background service worker or event page is glue only: open the app tab and, if added, register context menus. Never run heavy work or retain long-lived job state there.
- Run archive, hashing, compression, and other CPU-heavy work in a Web Worker owned by the app page. Every long operation needs progress, cancel, and cleanup on error, timeout, or cancellation. Never block the UI thread.
- Process locally with no upload. Bundle executable code and WASM with the extension. The extension-page CSP may allow `'wasm-unsafe-eval'` only when bundled WASM requires it.
- Keep the core at zero install-time permissions. Request optional capabilities only at the moment the user invokes a feature that needs them.
- Keep one Chrome and Firefox codebase through WXT and its `browser.*` namespace. Browser parity is a runtime contract, not merely two successful builds.

The shipped Unzip flow is in `entrypoints/app/App.tsx`, `lib/core/worker.ts`, and `lib/tools/unzip/`. It currently transfers a whole `ArrayBuffer`, buffers extracted entries, and reports indeterminate progress. Treat those as seed limitations to remove, not patterns to copy into new tools.

## Guardrails - do not regress

### Archive, hashing, licensing, and provenance

- Use `fflate` only within its standard-ZIP boundary for archive extraction. Its ZIP implementation is not a general Zip64, TAR, bzip2, or xz solution. Use `client-zip` for streaming ZIP creation, `@zip.js/zip.js` for streaming or large-ZIP reading and creation, a dedicated TAR parser for TAR, and dedicated bzip2 or xz codecs.
- `SubtleCrypto.digest()` is not incremental. Use `hash-wasm` with `init` / `update` / `digest` for large files. MD5 and SHA-1 are compatibility-only and must never be presented as security primitives.
- Every archive entry must pass `lib/core/safety.ts`. Enforce caps on actual aggregate emitted bytes, entry count, path depth, recursion depth, and wall time. Treat declared sizes as untrusted hints, parse Zip64-sized integers with `bigint`, and never recursively extract nested archives by default.
- Prevent Zip-Slip after final filename decoding. Reject `..`, absolute paths, UNC paths, drive-letter paths, backslashes, NUL and control characters, symlinks, and special files. Resolve against the extraction root before accepting an entry.
- RAR and 7z implementations carry restrictive or non-free license concerns. They remain Pro or later only and require a license and provenance review before use.
- Keep `THIRD-PARTY.md` exact for every shipped dependency and WASM artifact: package, exact installed version, provenance where relevant, and SPDX license.

### Privacy and capability contract

Use this precise contract in code, tests, docs, and listing copy:

> Local processing, no upload; zero install-time permissions for the core; optional `downloads` permission requested only for tree-preserving extract-all.

This is a written capability contract, not a claim that zero permissions proves privacy. Distinguish what the browser and CSP technically prevent from what the product promises.

- Add and then maintain a strict no-egress extension-page CSP. Deny runtime egress with `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`, `object-src 'none'`, and `base-uri 'none'`. Explicitly allow only local resources needed by `script-src`, `worker-src`, `style-src`, `img-src`, `font-src`, and `media-src`; retain `'wasm-unsafe-eval'` only for bundled WASM.
- Add and then maintain a CI check over built manifests that fails if any egress-capable source or directive appears. Fetch, images, forms, frames, and navigations can create egress without host permissions, so a zero-permission manifest is not sufficient enforcement. CSP does not reliably eliminate every top-level navigation path across both browsers, so code review and production-artifact tests must also reject navigation egress.
- Do not claim that the build has proven no egress or that zero network is mechanically verifiable. Verify the capability contract through the CSP, built manifests, production-artifact tests, and source review.

### Memory and operation bounds

- Enforce a fixed input-size limit in the app page before creating or messaging a worker.
- Pass the `File` or a bounded stream to the worker and read it there in bounded chunks. Never call `arrayBuffer()` on the complete input file. Inside the worker, use a bounded stream or call `arrayBuffer()` only on explicitly size-bounded slices. Whole-file reads begin before worker cancellation, timeout, and safety accounting can act.
- Enforce per-entry, aggregate emitted-output, and maximum in-flight memory limits. Check before accepting each decoded chunk and abort before a limit is crossed. Do not materialize an oversized entry before applying its limit.
- Process entries sequentially and release buffers and object URLs as soon as their consumer finishes. Do not retain the archive, all inflated outputs, transfer copies, and rebuilt output at once.
- Cancellation and every failure path must terminate work and clean up partial state. A timeout or warning without enforced memory bounds is not a safety mechanism.

### Dependencies and release gates

- Replace the existing dependency ranges with exact versions, then keep all dependencies and development dependencies pinned. Do not use `latest`, caret, or tilde ranges. Keep `package-lock.json` committed and keep each shipped package's pinned installed version and SPDX license synchronized with `THIRD-PARTY.md`.
- The adversarial archive corpus is a release gate, not future cleanup. Commit fixtures for CRC corruption, local and central directory disagreement, unsupported methods, duplicate and case-colliding paths, oversized names, Unicode bidi spoofing, Windows reserved names, and truncated archives. Run them through `npm test`, and therefore `npm run check`; any crash, hang, uncaught exception, or safety-policy bypass blocks release.
- Before release, declare supported OS rows and the minimum Chrome and Firefox version for every applicable row. No minimum-version matrix is currently declared, so do not invent or imply one. Every declared browser by OS cell must pass production-artifact integration tests covering worker load, cancellation, nested downloads, filenames, offline operation, and CSP enforcement, with results recorded in CI or the release checklist.

## Commands

These are the exact scripts in `package.json`:

- `npm run dev` - `wxt`
- `npm run dev:firefox` - `wxt -b firefox`
- `npm run build` - `wxt build`
- `npm run build:firefox` - `wxt build -b firefox`
- `npm run zip` - `wxt zip`
- `npm run zip:firefox` - `wxt zip -b firefox`
- `npm run compile` - `tsc --noEmit`
- `npm test` or `npm run test` - `vitest run`
- `npm run test:watch` - `vitest`
- `npm run lint` - `eslint .`
- `npm run format` - `prettier -w .`
- `npm run check` - `npm run compile && npm run lint && npm run test`
- `npm run postinstall` - `wxt prepare`

For HMR, run `npm run dev` or `npm run dev:firefox` and load the generated `.output/<target>` directory as an unpacked extension. Use `build` and `build:firefox` for production artifacts.

## Before declaring done

1. Run `npm run check` and require it to pass.
2. Build the affected browser targets.
3. Load the production build as an unpacked extension in current stable Chrome and Firefox on the available OS. For a release, test every cell in the declared browser by OS matrix.
4. Drive the real tool: drop or select a real file, observe progress and cancellation, and verify the downloaded output and filenames. Tests alone do not prove worker loading, CSP behavior, downloads, or UX.

## Conventions

- Keep TypeScript strict. Use React function components and hooks.
- Use Tailwind for styling. Do not add CSS modules. Preserve the shipped light, warm-neutral, emerald-accented theme documented in `docs/DESIGN.md`.
- Route all heavy work through a Web Worker. Keep the app responsive and never move compute into the background service worker.
- Put each new tool in `lib/tools/<name>/` with its worker and UI boundary, add its tab or entry in `entrypoints/app/App.tsx`, and add a Vitest test.
- Make only repo-relevant changes. Do not add generated-work or assistant authorship attribution in code, docs, commits, or release text. Preserve legally required third-party notices, licenses, and provenance.

## Roadmap

Follow [`ROADMAP.md`](ROADMAP.md) and build tools in phase order. Unzip under `lib/tools/unzip/` is the flagship seed, not a complete reusable architecture or permission model.
