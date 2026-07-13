# File Tools

A privacy-first Chrome and Firefox extension for opening ZIP files entirely on your device, with no upload, account, ads, or tracking. Its CSP blocks fetch, XHR, WebSocket, beacon, form, and frame egress; the extension implements no navigation or WebRTC egress and requests no host or install-time permissions.

## Privacy and capabilities

**Contract:** local processing, no upload; zero install-time permissions for the core; optional
`downloads` permission requested only at the moment the user invokes tree-preserving multi-file
save — never at install.

| Guarantee | Status |
| --- | --- |
| Zero install-time permissions | ✓ shipped — `permissions: []` in the manifest |
| All file work runs on-device in a Web Worker | ✓ shipped |
| No host permissions, no content scripts | ✓ shipped |
| No telemetry, analytics, or account | ✓ shipped |
| Firefox `data_collection_permissions: { "required": ["none"] }` | ✓ shipped |
| Archive safety (Zip-Slip, byte cap, time cap) | ✓ shipped |
| Full no-egress CSP (`connect-src 'none'`, etc.) | ○ target — current CSP is partial |
| CI check over built manifests for egress sources | ○ target — not yet implemented |
| Optional `downloads` permission for tree extract | ○ target — feature not yet built |
| Production-artifact integration tests | ○ target — planned release gate |

"✓ shipped" means true on `main` today and verifiable in source. "○ target" means the control is
planned but not yet present; until then, source review is the enforcement path.

See [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md) for the full contract, verification steps,
and an explanation of what the permission model does and does not technically prevent.

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

Production extension directories are emitted under `.output/`. The toolbar action opens the durable full-page app instead of a popup, and the extension requests zero permissions.

## Architecture

- `entrypoints/app/`: durable React tool host
- `entrypoints/background.ts`: glue that opens the app tab
- `lib/core/`: shared drop, download, worker, formatting, and mandatory archive-safety logic
- `lib/tools/unzip/`: flagship extraction implementation and worker
- `components/`: reusable Tailwind UI
- `tests/`: safety and real ZIP round-trip tests
- `docs/`: product, engineering, research, teardown, and backlog documentation
