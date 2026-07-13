# Unzip

Private, safe ZIP extraction for Firefox and Chrome, entirely in your browser.

![Unzip showing an extracted ZIP file tree](docs/media/screenshots/unzip-ready.png)

[![CI](https://img.shields.io/github/actions/workflow/status/animeshkundu/file-tools/ci.yml?branch=main&label=CI)](https://github.com/animeshkundu/file-tools/actions/workflows/ci.yml) [![Firefox E2E](https://img.shields.io/github/actions/workflow/status/animeshkundu/file-tools/e2e.yml?branch=main&label=Firefox%20E2E)](https://github.com/animeshkundu/file-tools/actions/workflows/e2e.yml) [![MIT License](https://img.shields.io/github/license/animeshkundu/file-tools?label=License)](LICENSE)

## The privacy promise

> **Your files never leave your device. No uploads, no accounts, no telemetry. All processing runs locally in your browser.**

A strict no-egress content-security policy plus zero install-time permissions constrain network access; verified by CI and production-artifact tests.

## Features

- **Streaming, bounded-memory extraction** with per-entry and aggregate caps.
- **Defensive ZIP parsing** driven by the central directory and designed to fail closed. Encrypted, Zip64 and larger-than-4 GB, corrupt, crafted, and ghost archives are rejected with friendly messages.
- **Full path safety** against zip-slip, absolute, UNC, and drive paths; Windows reserved names; bidi and Unicode spoofing; and case-colliding names.
- **Fast navigation at scale** with a virtualized, sortable, filterable file tree for large archives and high entry counts.
- **Flexible downloads** for one file or the full tree, preserving structure and generating collision-safe names.
- **Safe interruption** with cancellation and a drop-outside guard that prevents accidental data loss.
- **Accessible by design**, meeting WCAG AA with a live axe gate in CI.
- **Real-Firefox end-to-end coverage** in CI, not browser emulation.
- **One MV3 codebase** for Chrome and Firefox.
- **Zero install-time permissions.**

## Screenshots

### Start with a ZIP

Drop an archive or choose one from your device.

![Unzip empty state with its ZIP dropzone](docs/media/screenshots/unzip-idle.png)

### Inspect and download

Browse the extracted tree, filter or sort entries, then download one file or everything.

![Unzip ready state with an extracted file tree](docs/media/screenshots/unzip-ready.png)

### Friendly failures

Unsafe, unsupported, or damaged archives fail closed with a clear message.

![Unzip friendly archive error state](docs/media/screenshots/unzip-error.png)

[Watch the short real-Firefox demo](docs/media/unzip-demo.webm)

## Install

- **Firefox:** coming soon (AMO)
- **Chrome:** coming soon (Chrome Web Store)

## How it works

A durable extension app page owns the interface and operation lifetime, while a page-owned Web Worker keeps archive work off the UI thread. Extraction uses `fflate` within its standard-ZIP boundary, guarded by fail-closed validation and a strict no-egress CSP. Read the [vision](docs/VISION.md), [product specification](docs/PRODUCT-SPEC.md), [architecture](docs/ARCHITECTURE.md), and [design guide](docs/DESIGN.md).

## Development

Install dependencies with `npm install`, then use the scripts below:

| Task             | Chrome          | Firefox                 |
| ---------------- | --------------- | ----------------------- |
| Development      | `npm run dev`   | `npm run dev:firefox`   |
| Production build | `npm run build` | `npm run build:firefox` |

Quality and test commands:

```sh
npm run check
npm run test
npm run test:e2e
```

To load an unpacked production build:

1. Build the target browser.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`.
3. In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`.

## License

Licensed under the [MIT License](LICENSE).
