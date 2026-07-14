# Third-party software

Exact shipped runtime dependency BOM. Versions are pinned in `package.json` and `package-lock.json`.

## How to refresh

After changing dependencies, run `npm install`, then update the runtime package table below from `package-lock.json` so every non-dev package keeps its exact installed version and SPDX license.

| Package      | Version | SPDX license | Purpose                                                |
| ------------ | ------: | ------------ | ------------------------------------------------------ |
| `client-zip` |   2.5.0 | MIT          | Stream-compatible creation of the bundled download ZIP |
| `fflate`     |   0.8.3 | MIT          | Standard ZIP decompression                             |
| `hash-wasm`  |  4.12.0 | MIT          | Incremental hashing foundation for the roadmap         |
| `react`      |  19.2.7 | MIT          | User interface                                         |
| `react-dom`  |  19.2.7 | MIT          | Browser rendering                                      |
| `scheduler`  |  0.27.0 | MIT          | React runtime dependency                               |

No runtime package in the current build ships a WASM binary.

## E2E test tools (devDependencies — not bundled into the shipped extension)

| Package                     | Version | SPDX license | Purpose                                             |
| --------------------------- | ------: | ------------ | --------------------------------------------------- |
| `@playwright/test`          |  1.61.1 | Apache-2.0   | E2E test runner and assertions                      |
| `selenium-webdriver`        |  4.46.0 | Apache-2.0   | Firefox WebDriver client for moz-extension:// E2E   |
| `@types/selenium-webdriver` |  4.35.6 | MIT          | TypeScript type declarations for selenium-webdriver |

## Formats deferred for licensing reasons

RAR support via `node-unrar-js` bundles RarLab UnRAR and is non-free/restrictive. `7z-wasm` combines LGPL code with bundled UnRAR components. Neither is shipped; both remain later/Pro candidates pending a dedicated license review and complete redistribution documentation.
