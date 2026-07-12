# Smoke findings — Unzip flow (main)

Exploratory pass over the current main Unzip flow. Covers `entrypoints/app/App.tsx`,
`lib/core/worker.ts`, `lib/tools/unzip/` (extract, worker, types),
`components/` (Button, FileTree, Progress), and `lib/core/` (dropzone, download, format,
safety). Each finding includes a file:line reference and a severity tag.

Severity scale: **Critical** — broken user flow or silent data issue · **High** —
significantly impairs a core use case or accessibility requirement · **Medium** — degrades
UX or has reachable edge-case failures · **Low** — polish, minor friction, or cosmetic
inconsistency.

---

## Broken / awkward states

### F-01 · Cancel lands on the error screen instead of returning to idle — **High**

**Location:** `entrypoints/app/App.tsx:38-40`, `lib/core/worker.ts:61`

`cancel()` rejects the worker promise with `new Error('Extraction cancelled.')`. The
`catch` branch in `openArchive` sets `status = 'error'` regardless of the reason, so the
user ends up on the red "This archive could not be opened" panel after a deliberate
cancel. Cancellation is a user action, not a failure; the expected destination is the idle
drop zone. The error message "Extraction cancelled." also reads as a system problem rather
than confirmation that the operation stopped cleanly.

---

### F-02 · Dropping a non-ZIP file shows a destructive error card — **Medium**

**Location:** `entrypoints/app/App.tsx:22-26`

When a non-`.zip` file is dropped, `status` is set to `'error'` and the full red error
card appears ("This archive could not be opened" / "Choose a .zip file."). The red panel
is designed for extraction failures; a wrong-type drop is an informational prompt, not an
error. The result is visual alarm for a normal mis-drop, with no path back without
clicking a button.

---

### F-03 · `downloadAll` has no in-progress guard and no error handling — **Medium**

**Location:** `entrypoints/app/App.tsx:50-54`

`downloadAll()` is `async` and calls `downloadZip(files).blob()`, which can take
perceptible time on large archives. While it runs: the "Download all" button remains
enabled (double-click starts two parallel zip blobs); there is no visual feedback; and if
`downloadZip` throws, the rejection is silently swallowed by the `void` cast at
`App.tsx:125`. The same omission applies to the individual-file `downloadEntry` path if
`Blob` construction fails.

---

### F-04 · `archiveName` is stale during the wrong-type-error state — **Low**

**Location:** `entrypoints/app/App.tsx:22-28`

The wrong-type guard returns early *before* `setArchiveName(file.name)`, so `archiveName`
keeps the name of the previous successful archive. The error card does not display
`archiveName`, so this is invisible today, but any future change that references
`archiveName` in the error panel would display the wrong name.

---

## Cancel / progress behavior

### F-05 · `cancel()` cannot abort a large in-flight `file.arrayBuffer()` read — **High**

**Location:** `lib/core/worker.ts:41-62`

`file.arrayBuffer()` is called in the main thread before the file is posted to the
worker. The `cancel()` function sets `settled = true`, but the `arrayBuffer()` callback
only checks `if (settled) return` *after* the read finishes. For a large file, pressing
Cancel has no effect until the full read completes; the UI stays in the extracting state
and the worker is never started. There is no way to abort a `Promise`-based file read
with the current approach.

---

### F-06 · Progress bar carries no semantic content for assistive technology — **High**

**Location:** `components/Progress.tsx:3-4`

`<div role="progressbar">` is missing the required ARIA attributes `aria-valuemin`,
`aria-valuemax`, and `aria-valuenow` (or `aria-label`/`aria-labelledby`). An
indeterminate bar should set `aria-valuenow` to nothing and provide an `aria-label` such
as "Extracting archive". Without these, screen readers announce "progressbar" with no
additional information. The extracting section container also lacks `aria-busy="true"` or
a live region to announce completion or error transitions.

---

### F-07 · Progress bar animation ignores `prefers-reduced-motion` — **Medium**

**Location:** `components/Progress.tsx:4`

`animate-pulse` runs unconditionally. Tailwind's `animate-pulse` has no built-in
`prefers-reduced-motion` guard; users who have requested reduced motion still see the
pulsing fill. The shipped design doc (`docs/DESIGN.md:29-30`) flags this as a known
follow-up but it remains open.

---

### F-08 · No input-size limit before `file.arrayBuffer()` is called — **High**

**Location:** `lib/core/worker.ts:41`

There is no `file.size` pre-flight check in the app or worker bridge. Any file — however
large — is read into memory in the main thread before the worker's `ArchiveSafetyBudget`
can act. A malicious or accidentally large file can OOM the tab before any budget
enforcement. This is noted as FIX-NOW in `docs/PEER-REVIEW.md` (#2) and remains
unaddressed.

---

## Error / empty handling

### F-09 · FileTree renders an empty list body for all-directory archives — **Medium**

**Location:** `components/FileTree.tsx:18-33`

`extractZip` skips directory entries (`if (centralEntry.kind === 'directory') return`),
so `entries` only contains regular files. A ZIP consisting entirely of empty directories
(legitimately valid) results in `entries = []`, and `FileTree` renders a `<ul>` with no
rows — just the header "File / Size / Action" above blank space. There is no empty-state
message.

---

### F-10 · The `ready` panel shows `0 files · 0 B` with no explanatory text — **Low**

**Location:** `entrypoints/app/App.tsx:116-119`

Relates to F-09: when entries is empty, the heading reads "0 files · 0 B" with no
explanation that the archive may contain only directories or is legitimately empty. The
empty file tree below compounds the confusion.

---

### F-11 · Safety errors surface raw internal messages verbatim — **Low**

**Location:** `lib/tools/unzip/unzip.worker.ts:16`, `entrypoints/app/App.tsx:39`

`ArchiveSafetyError` messages such as "Archive local and central filenames do not match."
or "Archive central directory has entries missing from local records." are forwarded
directly to the UI as-is. These are technically accurate but written as diagnostic
strings for developers, not as user-facing feedback. A hostile archive triggering a
traversal check displays the same error level and tone as a corrupted archive.

---

## Accessibility

### F-12 · Download buttons are not distinguished by filename for screen readers — **High**

**Location:** `components/FileTree.tsx:28`

Every row's Download button says only "Download". A screen reader traversing the button
list hears "Download, button" repeated with no file context. Each button should carry an
`aria-label` such as "Download images/photo.jpg" (or a visually hidden span) so that
keyboard and AT users can target a specific file without inspecting the adjacent text.

---

### F-13 · Dropzone has no accessible name — **Medium**

**Location:** `lib/core/dropzone.tsx:23-27`

The `role="button"` element has no `aria-label` or `aria-labelledby`. The visible prompt
("Drop a ZIP file here") is not associated to the button role; a screen reader will
announce "button" with no description. The hidden file `<input>` (which does receive
focus through the button) also carries no `aria-label`.

---

### F-14 · FileTree list has no `aria-label` — **Low**

**Location:** `components/FileTree.tsx:18`

The `<ul>` that lists extracted files carries no `aria-label`. Screen readers announce a
plain "list" with no connection to the archive name or context. Adding `aria-label="Extracted files"` (or similar) would orient users arriving directly at the list.

---

### F-15 · Focus is not moved after extraction completes or fails — **Medium**

**Location:** `entrypoints/app/App.tsx:36-40`

When extraction finishes (success or error), focus stays on the Cancel button, which is
no longer in the DOM. The browser moves focus to `<body>`, leaving keyboard users to tab
from the top of the page. Shifting focus to the section heading (H2) or the first action
button after a state transition is standard WCAG 2.1 guidance for SPA state changes.

---

## Pixel / polish nits

### F-16 · "100% offline" pill is hidden on mobile — **Low**

**Location:** `entrypoints/app/App.tsx:79`

`hidden sm:block` hides the trust pill on screens narrower than the `sm` breakpoint
(640 px). The trust-chip footer row remains visible, but the prominent pill is the first
trust signal in the visual hierarchy and is absent on the viewports where a casual user
is most likely to question whether the page is doing network activity.

---

### F-17 · `formatBytes` produces garbled output for negative inputs — **Low**

**Location:** `lib/core/format.ts:3-6`

`formatBytes(-1)` returns `"-Infinity B"` because `Math.log(-1)` is `NaN`. Entry sizes
coming from the safety budget are always non-negative, but any defensive call elsewhere
(e.g. a future diff display showing delta size) would surface a broken string silently.

---

### F-18 · Dropzone drag-leave flickers when the pointer moves over a child element — **Low**

**Location:** `lib/core/dropzone.tsx:32`

`onDragLeave` calls `setDragging(false)` unconditionally. Moving the pointer from the
outer dropzone `<div>` to a child (the icon tile or the prompt text) fires `dragleave` on
the parent, causing the active-drag highlight to flash off briefly before `dragenter`
fires again on the parent. A `relatedTarget` check (`!event.currentTarget.contains(event.relatedTarget as Node)`) would prevent the flicker.

---

### F-19 · Individual-file download strips directory path — **Low**

**Location:** `entrypoints/app/App.tsx:47`

`entry.path.split('/').pop() ?? 'file'` drops the directory component. A file at
`assets/images/photo.jpg` downloads as `photo.jpg`. Two files in different subdirectories
with the same basename will download with identical filenames and, in browsers that
deduplicate, overwrite each other silently. The full path (with `/` replaced by `_` or
another safe separator, or using the Filesystem API) would preserve uniqueness.

---

### F-20 · The ↓ icon in the dropzone is a raw Unicode arrow, not a semantic icon — **Low**

**Location:** `lib/core/dropzone.tsx:50-52`

The icon tile contains the literal character `↓` (`U+2193`). It carries no `aria-hidden`
attribute, so screen readers announce "down arrow" as part of the button description.
Adding `aria-hidden="true"` to the icon tile would silence the extraneous announcement.

---

## Summary table

| ID   | Area                  | Severity | File : line                                     |
|------|-----------------------|----------|-------------------------------------------------|
| F-01 | State machine         | High     | `entrypoints/app/App.tsx:38-40`, `lib/core/worker.ts:61` |
| F-02 | Error handling        | Medium   | `entrypoints/app/App.tsx:22-26`                 |
| F-03 | Download              | Medium   | `entrypoints/app/App.tsx:50-54`, `:125`         |
| F-04 | State / data          | Low      | `entrypoints/app/App.tsx:22-28`                 |
| F-05 | Cancel                | High     | `lib/core/worker.ts:41-62`                      |
| F-06 | Accessibility         | High     | `components/Progress.tsx:3-4`                   |
| F-07 | Accessibility / motion| Medium   | `components/Progress.tsx:4`                     |
| F-08 | Safety / memory       | High     | `lib/core/worker.ts:41`                         |
| F-09 | Empty state           | Medium   | `components/FileTree.tsx:18-33`                 |
| F-10 | Empty state           | Low      | `entrypoints/app/App.tsx:116-119`               |
| F-11 | Error messages        | Low      | `lib/tools/unzip/unzip.worker.ts:16`            |
| F-12 | Accessibility         | High     | `components/FileTree.tsx:28`                    |
| F-13 | Accessibility         | Medium   | `lib/core/dropzone.tsx:23-27`                   |
| F-14 | Accessibility         | Low      | `components/FileTree.tsx:18`                    |
| F-15 | Focus management      | Medium   | `entrypoints/app/App.tsx:36-40`                 |
| F-16 | Polish                | Low      | `entrypoints/app/App.tsx:79`                    |
| F-17 | Edge case             | Low      | `lib/core/format.ts:3-6`                        |
| F-18 | Polish                | Low      | `lib/core/dropzone.tsx:32`                      |
| F-19 | Download              | Low      | `entrypoints/app/App.tsx:47`                    |
| F-20 | Accessibility         | Low      | `lib/core/dropzone.tsx:50-52`                   |
