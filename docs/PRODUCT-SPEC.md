# File Tools: Product Spec

> Cross-references: [VISION](./VISION.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [DESIGN](./DESIGN.md)

## 1. Personas and jobs-to-be-done

### Everyday recipient

Gets a `.zip` (or similar) attachment or download and just wants the contents, especially on
ChromeOS or Google Drive, which have no built-in unarchive for most formats.

- When I download a `.zip` I didn't ask to think about, let me see what's inside and get the
  files out without installing desktop software.
- When I'm on a Chromebook and Drive can't open an archive, give me a way to extract it that
  doesn't route me through an unfamiliar website first.
- When I extract something, let me trust nothing was uploaded, without having to read a privacy
  policy to believe it.

### Developer / IT / power user

Needs checksums, encodings, and archive plumbing as part of a technical workflow, and cares
that files never leave the device.

- When I download a build artifact or ISO, let me verify its MD5/SHA checksum against a
  published value without installing a CLI tool or trusting a browser-based upload site.
- When I need a quick base64 of a small file for an API payload or a config value, get me the
  string without a round trip to an online converter.
- When I have a `.tar.gz` from a Linux box or need to split/merge a large file for transfer, do
  it locally, fast, without a service in the loop.

### Privacy-conscious user

Refuses upload-based online tools on principle, independent of how convenient they are.

- When any tool asks me to "just drop your file here" on a website, let me do the exact same
  job in a way I can verify never left my machine.
- When I look at what permissions a tool requests, let me see zero, not a "we only use it for
  X" justification.
- When I choose between an extension and a website for a file job, give me a reason to pick the
  extension that isn't just habit.

## 2. Tool set by tier

| Tier | Tool | Notes |
| --- | --- | --- |
| MVP | ZIP extract | Flagship; shipped seed feature. |
| MVP | ZIP create / compress | Same engine, symmetric job. |
| MVP | File hashing (MD5, SHA-1/256/512) | MD5 labeled compatibility-only, never "secure." |
| MVP | Base64 (text and file to data-URI) | |
| MVP | Split / merge files | `Blob.slice`-based, no dependency. |
| Fast-follow | TAR / GZ / TAR.GZ extract | |
| Fast-follow | Local-file metadata / EXIF inspector | |
| Fast-follow | Optional Chrome-only save-to-folder | Feature-detected; degrades to download elsewhere. |
| Pro / later | Encrypted and very-large (>4GB, Zip64) ZIP | |
| Pro / later | RAR extract | Reading only, pending UnRAR license review. |
| Pro / later | 7z extract | |
| Pro / later | Advanced batch processing | |
| Pro / later | Save-to-folder conveniences (expanded) | |
| SKIP (non-goal) | Generic file-format conversion | Offline, this is only image transcoding, already served (~78k daily users on Firefox); real conversion needs a server, which breaks the offline promise. |

## 3. MVP functional requirements and acceptance criteria

### 3.1 ZIP extract

**Requirements**

- Accept a `.zip` file via drag-and-drop onto a dropzone or via a file picker.
- Parse the archive's central directory and display a file tree (folders and files, with sizes
  and paths) before extracting anything.
- Let the user extract all entries or a selected subset.
- Show progress during extraction and allow cancellation mid-operation.
- Deliver output as individual file downloads, a "download all as one zip" convenience, or (on
  Chrome/Edge, feature-detected) direct write into a user-chosen folder via the File System
  Access API.
- Enforce archive-safety checks on every entry before it reaches the UI or disk: a zip-bomb cap
  (uncompressed-size/ratio limit) and Zip-Slip path sanitization (no entry may resolve outside
  the extraction target).
- Detect and clearly label unsupported archive conditions rather than failing silently or
  crashing.

**Acceptance criteria**

- Given a `.zip` with nested folders, the file tree shows every entry with its size and folder
  path.
- Given a valid `.zip` under the supported size range, extracting all entries produces every
  file with correct contents and correct relative paths.
- Given a multi-hundred-MB archive, extraction streams through a Web Worker and the page UI
  remains responsive throughout.
- Given an in-progress extraction, clicking cancel stops the operation within a short, bounded
  time and leaves no partial output silently presented as complete.
- Given an archive whose declared uncompressed size (or realized decompressed bytes) exceeds the
  configured safety cap, extraction is refused with a clear message; it never silently proceeds
  or hangs the tab.
- Given an entry name containing `..` segments, an absolute path, or another path-traversal
  pattern, that entry is sanitized or rejected so it cannot write outside the destination; it
  never overwrites a file outside the extraction target.
- Given an entry name encoded as CP437 versus UTF-8, the displayed filename matches the encoding
  flag in the entry header rather than rendering as mojibake.
- Given a password-protected or Zip64 (>4GB) archive, since the MVP's plain-ZIP engine does not
  support encryption or Zip64, the UI shows a clear "not supported yet" message and never
  crashes or produces silently-corrupt output.
- Given the extraction runs to completion, no network request is made at any point in the flow.

### 3.2 ZIP create / compress

**Requirements**

- Accept one or more files and/or folders (where the browser supports folder selection or
  drag-and-drop of a folder) as input.
- Let the user review and remove items before compressing.
- Compress to a standard `.zip` and offer it as a download.
- Show progress for larger inputs and allow cancellation.

**Acceptance criteria**

- Given a set of selected files, the produced `.zip` opens correctly in a standard archive tool
  and contains every selected file with correct contents.
- Given a folder dropped onto the dropzone (where supported), the produced archive preserves the
  folder's relative structure.
- Given a large total input size, compression runs off the main thread and the UI stays
  responsive with visible progress and a working cancel control.
- Given the user cancels mid-compression, no partial or corrupt `.zip` is offered as the final
  download.
- Given the archive is produced, no network request is made at any point in the flow.

### 3.3 File hashing (MD5, SHA-1/256/512)

**Requirements**

- Accept one or more files and compute the selected hash algorithm(s).
- Support MD5, SHA-1, SHA-256, and SHA-512.
- Use incremental (streaming) hashing for large files rather than reading the whole file into
  memory at once, since `SubtleCrypto.digest` is one-shot and cannot stream.
- Label MD5 explicitly as compatibility-only, never presented as a secure choice.
- Let the user copy the resulting hash and, ideally, compare it against a pasted expected value.

**Acceptance criteria**

- Given a small text file, the computed SHA-256 matches the value produced by a standard
  reference tool (e.g. a system `shasum`/`sha256sum` equivalent).
- Given a multi-GB file, hashing completes via incremental reads without loading the entire file
  into memory at once and without freezing the UI.
- Given MD5 is selected, the interface labels it as compatibility-only and does not describe it
  as secure or collision-resistant anywhere in the UI or copy.
- Given a user pastes an expected hash value next to the computed one, the interface indicates
  a match or mismatch without extra steps.
- Given hashing runs to completion, no network request is made at any point in the flow.

### 3.4 Base64 (text and file to data-URI)

**Requirements**

- Encode arbitrary text to base64 and decode base64 back to text.
- Encode a selected file to a base64 data-URI (and, where feasible, decode a data-URI back to a
  downloadable file).
- Correctly handle non-Latin1 byte sequences and multi-byte text, since the native `btoa`/`atob`
  functions throw or corrupt data on non-Latin1 input if used naively.

**Acceptance criteria**

- Given text containing multi-byte UTF-8 characters (e.g. emoji or non-Latin scripts), encoding
  to base64 and decoding back returns the original text exactly, byte for byte.
- Given a binary file (e.g. an image), the produced base64 data-URI, when decoded, reproduces the
  original file's bytes exactly.
- Given a large file, encoding does not crash or silently truncate; the UI clearly communicates
  size limits, if any, before the user waits on a large operation.
- Given an invalid base64 string is pasted for decoding, the interface shows a clear error rather
  than silently producing garbage output.
- Given the operation runs to completion, no network request is made at any point in the flow.

### 3.5 Split / merge files

**Requirements**

- Split a file into a specified number of parts or a specified part size using `Blob.slice`.
- Merge a previously split set of parts back into the original file using `Blob` concatenation.
- Name output parts predictably (e.g. sequential suffixes) so they can be reassembled in the
  correct order.

**Acceptance criteria**

- Given a file split into N parts and then merged back together in the correct order, the merged
  file is byte-for-byte identical to the original.
- Given parts are selected for merge out of their intended order, the interface either sorts them
  correctly by their sequence indicator or warns the user rather than silently producing a
  corrupted file.
- Given a very large file is split, the operation streams via `Blob.slice` rather than reading the
  entire file into memory at once, and the UI remains responsive.
- Given the split or merge completes, no network request is made at any point in the flow.

## 4. Non-functional requirements

### Privacy

- Zero network requests at runtime, in every code path, for every tool.
- Zero host permissions in the shipped manifest; the shipped build requests zero permissions
  overall.
- Source is reviewable: no obfuscation beyond standard minification, and unminified sources are
  available for store review (required by AMO for minified submissions).

### Offline

- Every tool functions fully with no network connection after the extension is installed.
- Any WASM or heavy asset the tools depend on ships bundled with the extension or is fetched once
  and cached locally (e.g. in IndexedDB); nothing is fetched from a remote CDN at runtime.

### Performance

- The UI thread stays responsive during heavy operations; all archive, hashing, and compression
  work runs in a Web Worker, not on the page's main thread and not in the MV3 service worker.
- Every operation expected to take more than a couple of seconds shows visible progress and
  offers cancellation.
- Cancellation takes effect within a short, bounded time and never leaves the UI in an ambiguous
  "is it still running" state.

### Bundle size

- The base bundle (core UI plus MVP tools) stays small; heavy format support (RAR, 7z, and other
  Pro/later formats) is lazy-loaded only when the user opens that specific tool.
- The zip-bomb and Zip-Slip safety logic ships as part of the base bundle, not as an optional
  add-on, since it protects the MVP's flagship tool.

### Accessibility

- The dropzone and all controls are fully keyboard-operable (tab to focus, enter/space to
  activate, arrow-key navigation within file trees and lists where applicable).
- Focus is always visibly indicated; nothing relies on a mouse-only hover state to convey
  information.
- Interactive elements and dynamic content (progress, file trees, results) carry appropriate
  screen-reader labels and live-region announcements for state changes.
- Motion respects `prefers-reduced-motion`; animations are reduced or removed accordingly.
- The interface supports a light color scheme as a baseline, with sufficient contrast for text
  and controls.

## 5. Success metrics

| Metric | Definition |
| --- | --- |
| Activation | Percentage of installs that complete a first tool run in session 1. |
| Retention | Repeat-use rate; WAU/MAU. |
| Conversion | Free-to-Pro one-time-unlock rate, plus donation rate. |
| Trust / quality | Store rating, "scam/ads" complaint rate, uninstall rate, first-pass store-review approval rate. |

**Caveat.** With no telemetry, almost all of these come from store dashboards and public reviews,
not in-app analytics. A deeper conversion or activation funnel would require instrumentation that
conflicts with the no-telemetry stance this product is built on. That tension is real: we are
choosing to measure less well in exchange for having nothing to disclose and nothing to protect.
We state this plainly rather than promise in-app analytics we do not intend to build.

## 6. Monetization

**Model.** Free core forever, covering every MVP tool (ZIP extract/create, hashing, base64,
split/merge) plus the fast-follow tier. This is the install and trust engine; a tool that gates
its basic job loses to the next free alternative in a category already crowded with mediocre
options. On top of that, a one-time "Pro" unlock covers heavy or convenience features: RAR/7z
extraction, batch processing, encrypted-zip creation, and save-to-folder.

**The honesty problem.** A one-time purchase normally needs an entitlement-recovery path (what
happens on a new device, a reinstall, or a browser profile reset), and the conventional way to
provide that is an account or a server call, which conflicts directly with "no account, no
network." This is a genuine design tension, not a solved problem, and this spec does not pretend
otherwise.

**Options considered:**

| Option | How it works | Trade-off |
| --- | --- | --- |
| (a) Signed, offline-verifiable license file | User purchases externally, receives a signed license file, imports it; the extension verifies the signature locally with no runtime network call. | Preserves the offline promise for the app itself; the purchase and recovery flow still lives on an external store/website, which is an online step outside the extension. |
| (b) Store-native licensing | Use the browser store's built-in licensing/payments API. | Rejected: Chrome's extension licensing API is deprecated, and Firefox has no equivalent. |
| (c) Donations ("buy me a coffee") | Low-friction, optional secondary revenue, no entitlement to track. | Doesn't fund heavy features directly; especially relevant on Firefox, where paid tiers convert worse. |

**Recommendation.** Option (a) as the primary mechanism, paired with (c) as a low-friction
secondary. Option (b) is rejected outright.

**Open question.** The purchase and license-recovery flow under option (a) is inherently online
(an external store page, an email delivery step, or similar), even though the extension itself
never makes a network call at runtime. Where exactly that boundary sits, and whether it is honest
enough to state plainly in the listing ("the app is offline; buying a license involves an external
page"), is not yet resolved and should be revisited before Pro ships.

**Explicitly rejected, unconditionally:** ads, affiliate redirects, bundled search-default
changes, telemetry, and subscriptions.
