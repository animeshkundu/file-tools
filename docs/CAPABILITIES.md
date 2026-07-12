# Capability contract

> Local processing, no upload; zero install-time permissions for the core; optional `downloads`
> permission requested only for tree-preserving extract-all.

## Core capabilities

File Tools processes selected files in the extension page and its Web Worker. The core does not
upload file contents or require an account, and it does not request extension or host permissions
at installation.

The following Unzip operations remain permissionless:

| Operation                                               | Extension permission |
| ------------------------------------------------------- | -------------------- |
| Select or drop a ZIP and inspect its validated contents | None                 |
| Download an individual extracted file                   | None                 |
| Download all extracted files as a new ZIP               | None                 |

These downloads use files generated locally by the extension page. Downloading all files as a new
ZIP does not recreate the archive's directory tree as separate files on disk.

## Optional tree-preserving extraction

Writing separate extracted files into their original directory tree requires the optional
`downloads` permission. File Tools will request that permission only when the user invokes
tree-preserving extract-all, never at installation or merely when opening or inspecting an
archive. Declining the request leaves the permissionless core available.

This describes the capability boundary; tree-preserving extract-all is not part of the currently
shipped core.

## What enforces the contract

Zero install-time permissions limit access to privileged browser APIs, but do not by themselves
prove that an extension cannot send data over the network. The no-upload promise is supported by:

- local, client-side processing with bundled code;
- a no-egress extension-page Content Security Policy in production manifests;
- automated checks of both Chrome and Firefox production manifests;
- production-artifact tests and source review, including review for navigation-based egress.

The CSP denies network connections, forms, frames, plugins, and remote base URLs while allowing
only the local resources the extension needs. CSP cannot reliably eliminate every top-level
navigation path across both browsers, so the project does not claim that zero egress is
mechanically proven by either the manifest or CSP alone.

“No upload” means input file contents and processing data stay on the device. User-initiated
downloads still write the resulting files through the browser.
