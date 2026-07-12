# File Tools

A privacy-first Chrome and Firefox extension for opening ZIP files entirely on your device. No
upload, account, ads, or tracking.

## Capability contract

> Local processing, no upload; zero install-time permissions for the core; optional `downloads`
> permission requested only for tree-preserving extract-all.

The permissionless core can inspect ZIPs, download individual files, and download all results as a
new ZIP. Tree-preserving extract-all is outside the currently shipped core and will request
`downloads` only when the user invokes it. Zero permissions alone do not prove privacy; the
no-upload promise is also supported by a no-egress CSP, production-manifest checks, artifact
tests, and source review. See [the capability contract](docs/CAPABILITIES.md) for the exact
boundary and enforcement limits.

## Included seed tool

**Unzip:** drop a standard `.zip`, inspect its safely validated file tree, download individual files, or download all files as a fresh ZIP. Extraction runs in a page-hosted Web Worker and can be cancelled. Zip-Slip and archive-expansion limits are enforced before results reach the UI.

`fflate` does not support Zip64, TAR, or bzip2. See `CLAUDE.md` for format and security guardrails.

## Develop

```sh
npm install
npm run dev
npm run dev:firefox
```

## Verify and build

```sh
npm run check
npm run build
npm run build:firefox
```

Production extension directories are emitted under `.output/`. The toolbar action opens the
durable full-page app instead of a popup, and the core requests zero install-time permissions.

## Architecture

- `entrypoints/app/`: durable React tool host
- `entrypoints/background.ts`: glue that opens the app tab
- `lib/core/`: shared drop, download, worker, formatting, and mandatory archive-safety logic
- `lib/tools/unzip/`: flagship extraction implementation and worker
- `components/`: reusable Tailwind UI
- `tests/`: safety and real ZIP round-trip tests
- `.docs/`: research and incumbent teardown
