# Learnings

Record durable project learnings here so future work can avoid rediscovering them.

## Current repo facts

- Repo: animeshkundu/file-tools. The shipped product is branded **Unzip** (manifest `name`); the repository and npm package remain `file-tools`, which also fixes the `/file-tools/` GitHub Pages path.
- Stack: TypeScript + React + Tailwind on WXT (MV3), packaged for Chrome and Firefox from one codebase.
- Commands: build `npm run build` / `npm run build:firefox`; typecheck `npm run compile`; lint `npm run lint`; test `npm run test`; all-in-one `npm run check`; real-Firefox E2E `npm run test:e2e`; screenshots and demo capture `npm run capture`.
- Primary OS: cross-platform. The extension is browser-hosted with no OS-specific application code; CI runs on `ubuntu-latest`.

## Entries

### 2026-07-13 — Real-Firefox E2E is provisioned by Selenium Manager and keyed on the add-on ID

- Context: the E2E suite and the screenshot/demo capture drive the built extension in real Firefox, not an emulator.
- What happened: Selenium Manager auto-provisions Firefox and geckodriver, and the specs resolve the `moz-extension://` UUID from the Gecko add-on ID (`unzip@animesh.kundus.in`). The ID lives in `wxt.config.ts` and must match `tests/e2e/unzip.e2e.ts` and `tests/e2e/capture.mjs`; a mismatch makes both fail to find the extension. An anti-false-green guard asserts the expected number of tests actually ran with zero skipped, so a "green" job cannot hide a suite that never executed.
- What to do next time: when the add-on ID changes, update it in all three places and re-run `npm run capture` and `npm run test:e2e`. See `tests/e2e/`, `.github/workflows/e2e.yml`.

### 2026-07-13 — Extraction is central-directory-driven and fails closed

- Context: ZIP parsing must resist crafted, encrypted, oversized, and "ghost" archives.
- What happened: feeding a whole archive to a streaming unzip lets a crafted, early-terminating DEFLATE plus an in-range hidden ("ghost") local header be emitted even though it is absent from the central directory.
- What to do next time: prevalidate every entry against the central directory into a plan, then inflate only each entry's central-validated byte slice and verify it consumes exactly the declared compressed size. Reject encrypted, Zip64/over-4 GB, and out-of-range entries before producing any output. Never push a whole archive to a streaming unzip. See `lib/tools/unzip/extract.ts`, `lib/core/safety.ts`.

### 2026-07-14 — A manifest/identity change only reaches users through a new release

- Context: renaming the extension or changing the Gecko ID updates `main`, but not artifacts already published.
- What happened: published release ZIPs are built at tag time, so a rebrand merged to `main` leaves the previously published assets carrying the old manifest.
- What to do next time: to ship a manifest change, cut a new patch release (bump `package.json`, tag at the updated head); the release workflow rebuilds the assets. Never move or replace a prior tag's assets — that breaks provenance and signatures.

## Adding a learning

Append a dated entry under `## Entries` in the form `### YYYY-MM-DD — Short title`, then `Context` / `What happened` / `What to do next time` / related file or link references.
