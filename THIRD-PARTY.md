# Third-party software

Exact shipped runtime dependency BOM for version 0.1.0. Versions are pinned in `package-lock.json`.

| Package      | Version | SPDX license | Purpose                                                |
| ------------ | ------: | ------------ | ------------------------------------------------------ |
| `client-zip` |   2.5.0 | MIT          | Stream-compatible creation of the bundled download ZIP |
| `fflate`     |   0.8.3 | MIT          | Standard ZIP decompression                             |
| `hash-wasm`  |  4.12.0 | MIT          | Incremental hashing foundation for the roadmap         |
| `react`      |  19.2.7 | MIT          | User interface                                         |
| `react-dom`  |  19.2.7 | MIT          | Browser rendering                                      |
| `scheduler`  |  0.27.0 | MIT          | React runtime dependency                               |

No runtime package in the current build ships a WASM binary.

## Formats deferred for licensing reasons

RAR support via `node-unrar-js` bundles RarLab UnRAR and is non-free/restrictive. `7z-wasm` combines LGPL code with bundled UnRAR components. Neither is shipped; both remain later/Pro candidates pending a dedicated license review and complete redistribution documentation.
