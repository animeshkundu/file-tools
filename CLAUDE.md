# CLAUDE.md — File Tools (privacy-first offline file tools, Chrome + Firefox)

## What this is

A cross-browser MV3 WebExtension that does local file operations **100% client-side, offline, with no upload, no ads, no account, and minimal permissions**. Built with WXT + React + TypeScript + Tailwind. The market context, competitive teardown, and per-tool plan are in `.docs/` (read `ext-0-overview.md` then `ext-1-file-tools.md`) — the short version: the market leaders are deprecated Chrome-App shims that open upload-based websites, so the wedge is being the real offline in-browser tool.

## Architecture (do not violate)

- **Durable host = the app page** (`entrypoints/app/`), opened in a tab. Background SW = glue only (opens the tab, context menus); never heavy work there.
- **Heavy work in a Web Worker** from the app page; progress + cancel + cleanup-on-failure.
- **Offline, no network, no remote code.** WASM must be bundled; CSP has `wasm-unsafe-eval`.
- **Minimal permissions** (this repo: none). Output via download; File System Access and side panel are Chrome-only optional enhancements. Firefox output = per-file or single-zip.
- One codebase for both browsers via WXT's auto-imported `browser.*` namespace.

## Guardrails (verified — don't regress)

- `fflate` handles standard ZIP only. It has no Zip64 (>4 GB), TAR, or bzip2 support. Use `client-zip` or `@zip.js/zip.js` for >4 GB/streaming ZIP creation, a dedicated TAR parser for TAR, and a dedicated codec for bzip2/xz. Never claim otherwise.
- `SubtleCrypto.digest()` is not incremental and requires the whole buffer. Use `hash-wasm`'s incremental `init/update/digest` API for large files. MD5 is compatibility-only, never a security primitive.
- Every archive entry must pass `lib/core/safety.ts`. Enforce caps on actual emitted bytes, entry count, path depth, recursion depth, and wall-time. Treat declared sizes as untrusted hints, parse Zip64-sized integers with `bigint`, and never recursively extract archives by default.
- Prevent Zip-Slip after final filename decoding: reject `..`, absolute/UNC/drive-letter paths, backslashes, NUL/control characters; resolve against the extraction root; accept regular files and directories only. Never write symlinks or devices.
- RAR (`node-unrar-js`, RarLab UnRAR) and 7z (`7z-wasm`, LGPL + UnRAR) carry restrictive/non-free components. They are Pro/later only and require license review before use.
- Keep `THIRD-PARTY.md` exact: package, pinned installed version, and SPDX license for every shipped dependency including WASM.

## Commands

- `npm run dev` / `npm run dev:firefox` — HMR dev, load `.output/<target>` as an unpacked extension.
- `npm run build` / `npm run build:firefox` — production builds.
- `npm run compile` — typecheck. `npm test` — unit tests. `npm run lint`. `npm run check` — all three.
- **Before declaring a change done: `npm run check` must pass, and load the built extension and drive the actual tool** (drop a real file, verify output). Tests alone do not prove the UX.

## Conventions

- TypeScript strict; React function components + hooks; Tailwind for styling (no CSS modules).
- Heavy/CPU work goes through `lib/core/worker.ts`; never block the UI thread.
- A new tool belongs in `lib/tools/<name>/` (worker + UI), gets a tab entry in `App.tsx`, and has a Vitest test.
- No attribution to AI, LLMs, vendors, or model providers anywhere (commits, code, docs).

## Roadmap

See `ROADMAP.md`. Flagship Unzip is implemented as the seed; build the next tools in phase order.
