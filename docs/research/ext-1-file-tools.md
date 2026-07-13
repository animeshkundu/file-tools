# File Tools — browser extension design doc (Chrome + Firefox, MV3)

> Status: CANDIDATE FINAL (v1, in adversarial review). Owner: research. Last updated: 2026-07-12.
> One extension bundling client-side, offline, no-upload FILE-operation tools. Flagship: a ZIP extractor.
> All market numbers are dated and sourced; AMO figures are `average_daily_users` from the official AMO v5 API.

---

## 1. Executive summary & recommendation

**Recommendation: BUILD.** Ship a single, privacy-first "File Tools" extension whose flagship and wedge is an
**offline ZIP extractor + creator**, cross-published to Chrome and Firefox from one MV3 codebase. Bundle a small,
tightly-scoped set of adjacent client-side file tools (see §2) around it. Explicitly reject the search-hijack /
bundleware pattern that dominates the low-quality end of this category.

Why this clears the "popular-on-Chrome-but-absent-elsewhere is adverse-selected" bar (the repo's own caution):

- **The "market leader" is a dead-platform shim, not a real tool.** Teardown of the actual CRX (§6) shows
  **ZIP Extractor** (`mmfcakoljjhncfphlflcedhgogfhpbcd`, 200k+ installs / 15,164 ratings) is a **deprecated MV2 Chrome
  App launcher** — zero in-extension code, just a Google-Drive context-menu shortcut that opens the **zipextractor.app
  website**. The adjacent "Unzip" tool likewise just redirects to **openzip.app**. So there is **no high-adoption,
  credible, offline in-browser incumbent on either Chrome or Firefox** — the genuine MV3 tools that exist (`zipmanager`;
  Firefox's ~401-user ZIP Manager) are tiny (§4, §6.3). The thing to beat is a _website_ (a redirect out of the browser,
  and for most online tools an upload), and Google _cannot even publish new Chrome Apps_, so the incumbent can't respond in
  kind. The gap is not adverse-selected: it exists because the leaders are grandfathered zombies, not because the job is
  hard.
- **Structural, not accidental, demand.** ChromeOS / Google Drive have no native unarchive for many formats, and the
  browser is where a lot of people already receive `.zip` attachments and downloads. Demand is a standing job-to-be-done,
  not a fad. (Chrome demand quantified in §3.)
- **The gap on Firefox is real and honest.** The best _genuine_ same-job archive extractor on AMO is **ZIP Manager at
  ~401 average daily users**; the largest "archive" listing is a **2,824-daily-user search-hijack bundle** ("Zip-Unzip
  Files & Custom Web Search"). RAR / 7z / tar are effectively unserved. This is a category served badly, not a category
  that's saturated (§4).
- **It's technically cheap and safe to do well.** ZIP extract/create, hashing, base64, tar/gz are _easy_ fully client-side
  with mature MIT/BSD libraries; the extension needs **no host permissions and does no network I/O**, which is both a
  trust wedge and a store-review advantage (§6).
- **The competition's weakness is trust, not capability.** The incumbents that have scale got it through bundling and
  keyword farming (or are dead App shims), not product quality — a clean, no-upload, no-tracking tool is a credible
  differentiator (§6, §9).

**What NOT to over-scope:** RAR and 7z _extraction_ are feasible but costly (large WASM, restrictive UnRAR license) — treat
as a later/"pro" tier, not MVP. Generic "file format conversion" is a trap (either it's just image transcoding, which is
already served offline, or it implies server-side conversion, which breaks the offline promise). Split/merge and a
metadata inspector are cheap niceties, not headline features.

**MVP in one line:** offline ZIP extractor + ZIP creator + file hashing (MD5/SHA-256) + base64, in a dedicated
drag-and-drop extension page, zero host permissions, identical on Chrome and Firefox. (Full build order in §11.)

---

## 2. Tools to include (ranked, with verdict)

> Verdict legend: **BUILD (MVP)** · **BUILD (fast-follow)** · **PRO/LATER** · **SKIP**.
> Ranked by (real demand × gap on Firefox × ease of doing well offline). Detail/evidence in §3–§7.

| #   | Tool                                                    | Verdict                    | One-line rationale                                                                                                  |
| --- | ------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | **ZIP extract** (unzip)                                 | **BUILD (MVP)** — flagship | Largest real demand; structural (ChromeOS/Drive); trivial offline with fflate/zip.js; Firefox gap is real.          |
| 2   | **ZIP create / compress**                               | **BUILD (MVP)**            | Same library, symmetric job; rounds out "zip tool"; cheap.                                                          |
| 3   | **File hashing** (MD5/SHA-1/256/512)                    | **BUILD (MVP)**            | Real dev/IT job; SHA via WebCrypto is free, MD5 via `hash-wasm`; streams large files; near-zero FF competition.     |
| 4   | **Base64 encode/decode** (text + file)                  | **BUILD (MVP)**            | Tiny to build; FF options are text-only/dev-tool-flavored; complements the toolset.                                 |
| 5   | **TAR / GZ / TAR.GZ extract**                           | **BUILD (fast-follow)**    | Easy with fflate; common on Linux/dev downloads; unserved on FF.                                                    |
| 6   | **Split / merge files**                                 | **BUILD (fast-follow)**    | Pure `Blob.slice`, no dependency; genuinely unserved; low effort.                                                   |
| 7   | **File metadata / inspector** (type sniff, EXIF, sizes) | **BUILD (fast-follow)**    | Cheap with `file-type`/`exifr`; "what is this file" utility; FF EXIF tools are web-image only.                      |
| 8   | **RAR extract**                                         | **PRO/LATER**              | Feasible via libarchive/unrar WASM but heavy + UnRAR license constraints; high user value, defer to pro tier.       |
| 9   | **7z extract**                                          | **PRO/LATER**              | Feasible via libarchive/7z WASM but large bundle; defer.                                                            |
| 10  | **Generic file-format conversion**                      | **SKIP** (mostly)          | Offline = only image transcoding (already served ~78k FF); real conversion needs a server → breaks offline promise. |

Rationale narrative and per-tool evidence: §3 (Chrome), §4 (Firefox), §7 (feasibility).

---

## 3. Market & Chrome demand (per tool)

> Chrome `userCount` figures below combine the repo's pinned Jan-2025 snapshot (`data/snapshots/chrome/2025-01-05`,
> exposed in `results/utilities.csv`) with live verification. **The snapshot's coarse `userCount` buckets (e.g.
> "200,000") are lower bounds, not current counts** — Chrome Web Store reports users in rounded tiers. Ratings _count_
> is the more reliable relative-popularity signal.

**ID note (RESOLVED).** The flagship "ZIP Extractor" is id `mmfcakoljjhncfphlflcedhgogfhpbcd` (200,000+ installs,
**15,164 ratings**, 4.28★), publisher `zipextractor.app`. The `mmfcakoljjhncfppmeilbgppmhaobf` in the original brief was
a truncated/incorrect id; the correct id is confirmed against the repo CSV and a successful live CRX pull (teardown §6).
Note what that listing actually is: a **deprecated MV2 Chrome App** that just opens the zipextractor.app website (§6.1)
— so its install count measures demand for a Drive shortcut to a site, not for an in-browser extension. The 15,164 ratings
demonstrate **substantial cumulative demand for the unzip job, well beyond an ordinary 200k listing**; they are not a
current active-user count (see the demand read below). The live active-install tier is unknown and should be read off the
CWS listing before quoting a hard number.

Repo snapshot rows for context (`results/utilities.csv`, snapshot 2025-01-05):

| Chrome extension       | userCount (bucket) | rating | ratings (n) | id                               | note                                                        |
| ---------------------- | ------------------ | ------ | ----------- | -------------------------------- | ----------------------------------------------------------- |
| ZIP Extractor          | 200,000            | 4.28   | 15,164      | mmfcakoljjhncfphlflcedhgogfhpbcd | zipextractor.app; large real userbase                       |
| Kriptonita Zip         | 400,000            | 1.00   | 4           | fbefajnakmfifehnaneljnhojeijccna | high installs / 4 ratings → likely low-quality or inflated  |
| WinZip Courier         | 800,000            | 4.2    | 5           | lomojjnmhlhdepbfoknpkenickajcphi | email-attachment zipping, not general extraction; 5 ratings |
| Wicked Good Unarchiver | 100,000            | 2.77   | 405         | mljpablpddhocfbnokacjggdbmafjnon | ChromeOS Files-app unarchiver (legacy)                      |

**Chrome demand read (per job).** _Only the four snapshot rows above are verified counts (repo CSV); we did not
independently pull live per-job CWS/chrome-stats counts for the smaller utilities — those are assessed via the Firefox/AMO
landscape (§4) plus the snapshot, and should be spot-checked live before a build commit._

- **ZIP extraction — large and structural.** The **15,164 ratings** (4.28★) are the signal: a rating count that large is
  far beyond an ordinary 200k listing and demonstrates **substantial cumulative demand** for the unzip job. It is **not** a
  current active-user count — ratings accrue over a ~decade-old listing, and the tool is a Drive→website shim (§6.1), so the
  demand is largely funneled to a website; the live active-install tier is unknown and should be read off the CWS listing
  before quoting a hard number. The **job** is unambiguously high-volume. Structural driver: **ChromeOS and Google Drive
  have no built-in unarchive** for most formats — opening a `.zip` on a Chromebook or in Drive routes users to exactly these
  tools. _(Confidence: high that the job is large and structural; the exact current install count is unverified.)_
- **Kriptonita Zip (400k / 4 ratings, 1.0★)** and **WinZip Courier (800k / 5 ratings)** — high install buckets, near-zero
  ratings → **not credible product demand**: Kriptonita reads as inflated/low-quality; WinZip Courier is _email-attachment
  zipping_, a different job. Discount both.
- **Wicked Good Unarchiver (100k / 405 ratings, 2.77★)** — a legacy ChromeOS Files-app unarchiver; real but small and
  poorly rated. Confirms ChromeOS extraction is an unmet, low-satisfaction need.
- **Create/compress zip, hashing, base64, split/merge, metadata** ride along as expected utilities; none shows a single
  dominant, high-rating Chrome incumbent, consistent with the Firefox picture (§4). Generic _file conversion_ on Chrome is
  dominated by **upload-based** tools (online-convert, 123apps) that break the offline promise — a SKIP for us (§2, §4.6).

**Bottom line:** the flagship unzip job is genuinely large and structurally driven; the rest are legitimate but secondary
utilities. No file-op job here is a keyword-farm mirage _except_ where noted (Kriptonita, WinZip Courier).

---

## 4. Firefox competitive landscape (per tool) — AMO evidence

> Source: AMO v5 API (`/api/v5/addons/search/`, `app=firefox`, `sort=users`), retrieved **2026-07-12T08:20Z**.
> Metric is `average_daily_users`. Multiple query phrasings tested per job; full sweep saved during research.
> **This is deliberately honest: where Firefox is already served, it says so.**

### 4.1 Archive extraction (zip / rar / 7z / tar) — WIDE OPEN, badly served

Searching `unzip`, `unzip files`, `extract zip`, `zip file`, `open zip`, `zip extractor` on AMO returns **no
general-purpose offline extractor near the top** — the top hits are FoxyProxy, IE View, WebScrapBook, email/link
extractors. The only genuine same-job archive add-ons anywhere in results:

| Add-on                              | avg daily users | rating (n) | last updated | AMO slug                         | read                                                                                                 |
| ----------------------------------- | --------------- | ---------- | ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **ZIP Manager**                     | **401**         | 5.0 (3)    | 2025-08-10   | `zip-manager`                    | The only clean, real same-job extractor. Tiny.                                                       |
| Zip-Unzip Files & Custom Web Search | 2,824           | 4.0 (1)    | 2023-09-25   | `zipunzipfiles-customweb-search` | **Search-hijack bundle** — installs likely from bundling; 1 rating. The anti-pattern to avoid (§10). |
| ezyZip File Extractor               | 66              | 5.0 (1)    | 2026-04-28   | `ezyzip-file-extractor`          | Companion to ezyzip.com; right-click a link → extract. Tiny.                                         |
| ZipWeb (it)                         | 291             | –          | –            | –                                | Minor.                                                                                               |
| GitZip                              | 3,070           | 4.57 (53)  | 2023-08-21   | `gitzip`                         | **Different job** — downloads a GitHub subfolder as zip, not a local extractor.                      |

- **RAR:** searches (`rar opener`, `open rar`, `extract rar`, `unrar`) return **nothing real** — the closest is the
  same 2,824u search-hijack bundle; a dedicated `unrar` listing has ~1 user. RAR on Firefox is effectively **unserved**.
- **7z:** `7z`/`7zip`/`seven zip` → only the search-hijack bundle (2,824u) and ZIP Manager (401u). **Unserved.**
- **tar / gz:** no dedicated offline extractor. **Unserved.**

**Read:** the entire archive-extraction job on Firefox is served by one ~401-user clean tool and one ~2,824-user
bundleware listing. A polished, honest extractor faces essentially no credible incumbent.

### 4.2 File hashing (md5 / sha256 / checksum) — near-unserved

| Add-on                             | avg daily users | rating (n) | slug                            | read                            |
| ---------------------------------- | --------------- | ---------- | ------------------------------- | ------------------------------- |
| Files MD5 SHA1 Calculate & Compare | 278             | 4.15 (13)  | `calculate-md5-sha1-hash-che-1` | The one real file-hasher. Tiny. |
| Secure Hash Generator              | 36              | –          | –                               | Minor.                          |

Big listings that _mention_ hashing (`HackBar` 4,365u, `Extension source viewer` 1,583u, VT4Browsers) are
security/dev tools, not a general file-hash utility. **Gap is real.**

### 4.3 Base64 — text-oriented, small

| Add-on                   | avg daily users | rating (n) | slug                       | read                                   |
| ------------------------ | --------------- | ---------- | -------------------------- | -------------------------------------- |
| base64 decoder           | 3,695           | 4.33 (24)  | `base64-decoder`           | Decodes selected **text**, not files.  |
| Online Tools by 10015.io | 923             | 4.67 (6)   | `online-tools-by-10015-io` | Multi-tool incl. base64; stale (2021). |

Base64 _of a file_ (data-URI) is not really served; text base64 is lightly served by a 3.7k dev-flavored tool.

### 4.4 Split / merge files — unserved

`split file` / `merge files` / `file splitter` return download managers, converter suites, and unrelated tools. No
real offline file split/merge utility. **Gap is real** (though demand is modest).

### 4.5 File metadata / EXIF — served for _web images_, not local files

| Add-on                 | avg daily users | rating (n) | slug          | read                                                              |
| ---------------------- | --------------- | ---------- | ------------- | ----------------------------------------------------------------- |
| Exif Viewer            | 13,448          | 3.24 (49)  | `exif-viewer` | EXIF/IPTC of **images on web pages**, not a local-file inspector. |
| View Image Info Reborn | 4,576           | –          | –             | Same — web images.                                                |

A general "inspect any local file" (type sniff + size + EXIF) is not directly served; the adjacent web-image EXIF job
_is_ (13k). Position ours as local-file inspection to stay in the gap.

### 4.6 File conversion — image transcoding IS served offline; real conversion isn't offline

| Add-on                                 | avg daily users | slug | read                                               |
| -------------------------------------- | --------------- | ---- | -------------------------------------------------- |
| Save webP as PNG or JPEG (Converter)   | 78,020          | –    | **Offline image transcode — already well served.** |
| File Converter - By Online-Convert.com | 12,654          | –    | **Upload-based** (sends files to a server).        |
| Web Apps by 123apps                    | 19,436          | –    | Upload-based.                                      |
| Converter Suite & Custom Web Search    | 74,738          | –    | **Search-hijack bundle.**                          |

**Read:** offline image conversion is taken (78k). Everything else labeled "file converter" is either upload-based
(breaks our offline promise) or bundleware. This is why generic conversion is a **SKIP** for us (§2).

---

## 5. Firefox landscape summary (honest scorecard)

| Job                         | Best genuine FF incumbent | Its users         | Gap verdict                     |
| --------------------------- | ------------------------- | ----------------- | ------------------------------- |
| ZIP extract                 | ZIP Manager               | 401               | **Wide open**                   |
| RAR / 7z / tar extract      | (none clean)              | ~0                | **Unserved**                    |
| ZIP create                  | (none general)            | ~0                | **Wide open**                   |
| File hashing                | Files MD5 SHA1 …          | 278               | **Wide open**                   |
| Base64 (files)              | base64 decoder (text)     | 3,695 (text)      | **Mostly open**                 |
| Split / merge               | (none)                    | ~0                | **Unserved**                    |
| Metadata/EXIF (local files) | Exif Viewer (web images)  | 13,448 (web imgs) | **Open for local-file framing** |
| File conversion (image)     | Save webP as PNG/JPEG     | 78,020            | **Served — skip**               |

---

## 6. Incumbent teardown & how we build better (the real competitor is a website)

Source: each incumbent's CRX was pulled from the Chrome Web Store and unpacked under `research/incumbents/`. Everything
below is read firsthand from the shipped code, not from store copy.

### 6.1 The "leaders" are dead Chrome-App launchers, not extensions

- **ZIP Extractor** v2.9 (`mmfcakoljjhncfphlflcedhgogfhpbcd`) is an **MV2 Chrome _App_**, not an extension. Its entire
  manifest is a Google-Drive integration: `"app": { "launch": { "web_url": "https://zipextractor.app/" } }` plus
  `gdrive_mime_types` registering `application/zip` / `x-rar-compressed` so it shows up as an "Open" action inside Google
  Drive. **The package is 9 files, all icons — zero logic.** Extraction happens on the zipextractor.app _website_.
  [`research/incumbents/zipextractor/manifest.json`]
- Google **ended the Chrome Apps platform**; new ones cannot be published. The 200k+ installs / 15,164 ratings are
  grandfathered demand for a _Drive shortcut to a site_, not for an in-browser tool. On Firefox these Apps never existed;
  Firefox users just open the website. **Net: the real MV3 in-browser slot is empty on both browsers.**

### 6.2 Even the "#2 real unzip" is a website redirect (honest correction)

The teardown notes flagged `research/incumbents/unzip_realtool` ("Unzip", MV3) as a "small client-side unzip." Reading
its code, that is **not accurate** — it contains **no extraction logic at all**:

- `background.js`: on install opens `https://welcome.openzip.app/`; on toolbar click opens `https://openzip.app/`.
- `content.js`: a content script injected into `google.com/search` that finds result links ending in
  `.zip/.rar/.7z/.tar.gz`, appends an icon, and on click opens `https://openzip.app?url=<base64 of the link>`.
- `manifest.json`: `permissions: []`, but it injects into Google Search and ships a `web_accessible_resources` icon.

  [`research/incumbents/unzip_realtool/{background,content}.js`, `manifest.json`]

So the two visible "leaders" are **both website funnels** (zipextractor.app, openzip.app). This _strengthens_ the
thesis: no incumbent does the work locally in the browser.

### 6.3 The one genuine MV3 client-side model: `zipmanager` (emulate it, minus its Chrome-lock)

`zipmanager` v0.3.1 is the real reference — a legitimate in-browser extractor. What it does well, and its portability
trap:

| Aspect      | What zipmanager does                                                                                                                                                                                                                                                                                                                                              | Source                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Manifest    | MV3, `minimum_chrome_version: 114`, **permissions only `["sidePanel","storage"]`** — no host perms                                                                                                                                                                                                                                                                | `manifest.json`                                              |
| UI surface  | **Chrome side panel** (`side_panel.default_path`); toolbar click opens it via `sidePanel.setPanelBehavior({openPanelOnActionClick:true})`                                                                                                                                                                                                                         | `manifest.json`, `background.js`                             |
| Stack       | Built with **WXT**; UI in **SolidJS + Tailwind**; **70-locale** i18n; ~350 KB JS total                                                                                                                                                                                                                                                                            | `chunks/*`, `_locales/*`                                     |
| ZIP engine  | A **bundled streaming ZIP library** — handles **Zip64** + central directory + CRC32, runs in a **Web Worker** (inline `new Worker(URL.createObjectURL(new Blob([...])))`). No AES/password strings found → **no encrypted-zip support**. Library identity renamed by minification (no fflate/JSZip/zip.js token); behaviorally consistent with zip.js/client-zip. | `chunks/sidepanel-*.js`                                      |
| File output | **File System Access API** — `picker.html` calls `showDirectoryPicker({mode:"readwrite"})`, persists the directory handle, then writes each entry via `dirHandle.getFileHandle(name,{create:true}).createWritable()`. Zip creation streams out via `createWritable` too.                                                                                          | `picker.html`, `chunks/picker-*.js`, `chunks/sidepanel-*.js` |
| Network     | **None** — only `http://www.w3.org/2000/svg` namespace strings; no analytics, no upload. Genuinely offline.                                                                                                                                                                                                                                                       | `chunks/*.js`                                                |

**The portability trap:** zipmanager is **Chrome-locked** — `sidePanel` and `showDirectoryPicker` / `createWritable`
(File System Access API) are Chrome/Edge-only, absent in Firefox as of 2026. Its whole "extract straight into a chosen
folder" flow does not run on Firefox. We take its UX bar and drop its Chrome-only dependencies from the critical path.

### 6.4 How we build better (the wedge)

1. **Be the real in-browser MV3 tool** — do the work locally, never redirect to a website. That alone beats
   zipextractor.app / openzip.app on privacy and on the "no upload" promise.
2. **Match zipmanager's UX bar** (drop → file tree with sizes → select/extract → progress/cancel, zero network) **without
   its Chrome lock**:
   - Cross-browser core: a **dedicated extension page** (runs in both) with drag-drop + `<input type=file>`; heavy work in
     a **Web Worker**; output via **anchor/objectURL download** (plus a "download all as one zip" convenience).
   - **Optional, feature-detected Chrome enhancements:** side-panel surface, and File System Access "extract to folder" —
     enabled only where the APIs exist, never required.
3. **Add what zipmanager lacks** — encrypted-zip, tar/gz, hashing, base64 — using MIT/BSD libs, keeping the base bundle
   small and lazy-loading heavy formats.
4. **Zero host permissions, zero network, reviewable source** — a conspicuously clean posture that earns trust and clears
   store review in a category whose reputation is poisoned by bundleware.

The UI/UX bar to hit: **zipmanager's side panel** (drop → tree → extract-to-folder) and **the zipextractor.app web-app
flow** (drop → tree → extract), delivered as a real offline extension that also runs on Firefox.

---

## 7. Technical build (libraries per tool, MV3 architecture, feasibility)

### 7.1 Library choice per operation

> Sizes are approximate (min+gzip unless noted), corroborated by feasibility research + the libraries' npm/GitHub pages
> (Appendix A). Verdict = how hard to do _well, fully client-side_.

| Operation                                           | Library / API                                                                                                                                                                                             | License                                                                | Approx size        | Coverage                                                                                                                               | Verdict                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ZIP extract/create (plain)**                      | **fflate**                                                                                                                                                                                                | MIT                                                                    | ~12 KB gz          | DEFLATE, zip in/out, **streaming**; verify Zip64/large-file handling at build time (fall back to zip.js if a gap); **no** AES/password | **EASY** — default engine                                                                                                                           |
| **ZIP (encrypted / password / very large / split)** | **@zip.js/zip.js**                                                                                                                                                                                        | BSD-3                                                                  | larger, workerized | AES + ZipCrypto password, Zip64, split, streaming, built-in Web Worker                                                                 | **EASY–MED** — use when encryption/huge needed; can be the _only_ engine if size is acceptable                                                      |
| ZIP (reference, avoid for big)                      | JSZip                                                                                                                                                                                                     | MIT                                                                    | mid                | loads whole archive in memory                                                                                                          | avoid on large files (OOM)                                                                                                                          |
| **RAR extract**                                     | node-unrar-js (UnRAR→wasm)                                                                                                                                                                                | **non-free RarLab UnRAR**                                              | ~n/a               | RAR4/5, encrypted                                                                                                                      | **MED + LICENSE RISK** — UnRAR license forbids reusing its code to build a RAR _compressor_ and constrains redistribution; **flag before shipping** |
| RAR/7z/tar (alt)                                    | **libarchive.js** (libarchive→wasm)                                                                                                                                                                       | BSD-2 (RAR reader may pull UnRAR-derived code — **verify provenance**) | ~2.3 MB wasm       | reads rar/7z/tar/zip/…                                                                                                                 | **MED, cleaner license, heavy** — preferred RAR/7z path                                                                                             |
| **7z extract**                                      | 7z-wasm (p7zip) / libarchive.js                                                                                                                                                                           | LGPL (+bundled UnRAR)                                                  | large wasm         | 7z/zip/rar/tar                                                                                                                         | **HARD (bundle size)** — Pro/lazy-load                                                                                                              |
| **TAR / GZ / TAR.GZ**                               | **fflate** for gzip/gunzip (+zlib/deflate); tar is a container fflate does **not** parse — add a tiny tar reader (`js-untar` or ~100 lines); native `DecompressionStream` also does gzip in both browsers | MIT                                                                    | small              | gz, tar, tgz (**bz2 needs a separate lib**)                                                                                            | **EASY**                                                                                                                                            |
| **Hashing**                                         | **SubtleCrypto.digest** for SHA-1/256/384/512 — but it is **one-shot (no streaming)**, so hash large files with **hash-wasm**'s incremental API (also the only source of **MD5**; WebCrypto has none)     | native / MIT                                                           | tiny               | md5, crc32, sha family (streaming via hash-wasm)                                                                                       | **EASY**                                                                                                                                            |
| **Base64**                                          | native `btoa`/`atob`; `FileReader.readAsDataURL` for files                                                                                                                                                | native                                                                 | 0                  | text + file→data-URI                                                                                                                   | **EASY** (gotcha: `btoa` throws on non-Latin1 — encode bytes via `Uint8Array`/`TextEncoder` first)                                                  |
| **Split / merge**                                   | native `Blob.slice` (split); `new Blob([...parts])` (merge)                                                                                                                                               | native                                                                 | 0                  | any file                                                                                                                               | **EASY** — no dependency                                                                                                                            |
| **Metadata / EXIF / type sniff**                    | `file-type` (magic bytes) + `exifr` (EXIF/IPTC)                                                                                                                                                           | MIT                                                                    | small–mid          | container type, image EXIF                                                                                                             | **EASY** (fast-follow)                                                                                                                              |

**Easy vs hard, plainly:** ZIP (plain), create-zip, hashing, base64, split/merge, tar/gz are all **easy** and small.
**Encrypted zip** is easy with zip.js. **RAR and 7z are hard** — large WASM and (for RAR) a **restrictive UnRAR license**;
keep them behind a lazy-loaded Pro tier.

### 7.2 MV3 cross-browser architecture (one build, both browsers)

- **UI surface (cross-browser core):** a **dedicated extension page** (`app.html` opened in a tab) — identical in Chrome
  and Firefox; room for a big drop target, file tree, and progress. **Optional** Chrome **side panel** + Firefox **sidebar**
  as feature-detected quick-access surfaces (zipmanager's surface, made optional).
- **Input:** `<input type=file>` + drag-drop (`DataTransfer`). No permission needed.
- **Heavy compute:** a **Web Worker** hosted by the page — **not** the MV3 service worker (service workers terminate on
  idle (~30 s), have no DOM, and are the wrong place for CPU/memory-heavy extraction). WASM libs load **locally** into the
  worker.
- **Output — this is the part that actually differs across browsers, and it matters most for a _directory_ result.** An
  anchor `a[download]` yields a single file and **cannot recreate a folder tree** (and firing many single-file downloads can
  spam the download prompt). So:
  - **Chrome/Edge:** File System Access API (`showDirectoryPicker` + `createWritable`) writes the extracted tree straight
    into a user-chosen folder — the real "extract here" feel (zipmanager's flow).
  - **Firefox (and Chrome fallback):** use `browser.downloads.download()` with **relative `filename` paths** (needs the
    `"downloads"` permission) to write each entry under the Downloads folder while preserving the tree; and always offer
    **"download all as a single .zip"** plus per-file save. Make the UI explicit that "extract into any folder" is a
    Chrome/Edge capability; on Firefox the result lands in Downloads.
    This keeps the flagship feeling like _extraction_, not "here's another zip."
- **Not in the core:** `chrome.offscreen` documents are **Chrome-only** (absent in Firefox) — a page/tab + Worker covers
  the same need cross-browser, so offscreen is not part of the design.
- **Permissions:** minimal — **no host permissions, no content scripts.** Likely just **`"downloads"`** (an API permission,
  not a host/content permission) for the tree-preserving Firefox/Chrome-fallback output; `"storage"` for settings;
  `"sidePanel"` only for the optional Chrome surface. A plain anchor download needs no permission but can't recreate a tree.
- **CSP / WASM:** MV3's default CSP forbids remote code and `unsafe-eval`; instantiating WASM needs **`'wasm-unsafe-eval'`**
  in the `extension_pages` CSP — allowed in **both** Chrome and Firefox MV3. **All JS/WASM is bundled locally**; nothing is
  fetched at runtime (policy-required, and it's our privacy promise anyway).
- **Namespace / Firefox specifics:** use `webextension-polyfill` (or zipmanager's `globalThis.browser ?? chrome` shim) for
  `browser.*` vs `chrome.*`. Firefox needs `browser_specific_settings.gecko.id`; keep the Firefox background as a minimal
  **event page** (orchestration only), heavy work stays in the page's Worker.

### 7.3 Security the application must enforce (libraries won't do it for you)

- **Zip-bomb defense.** Before extracting, read declared uncompressed sizes from the central directory and enforce a
  **ratio + absolute cap** (e.g. refuse > N× compressed, or > a configurable GB budget); extract via streaming and **abort**
  if realized bytes exceed the declared/limit. A 42 KB zip can claim 4.5 PB. **The application must enforce this itself.**
- **Zip-Slip / path traversal.** Sanitize **every** entry name before writing — reject/neutralize absolute paths, `..`
  segments, and (on the FSA folder path) drive/backslash tricks — so no entry escapes the chosen output directory. Some
  libraries offer partial sanitization; **don't rely on it — enforce it yourself.** Applies to zip, tar, rar, 7z alike.
- **Filename encoding.** Zip entries may be CP437 or UTF-8 (general-purpose bit 11); decode by the flag or filenames come
  out as mojibake.
- **Large-file / memory.** Stream through the Worker, cap in-memory buffers, show progress + a hard **cancel**.
  Whole-file-in-memory (JSZip-style) OOMs the tab on multi-GB archives — prefer fflate/zip.js streaming.

### 7.4 Locked design principles

- **Cross-browser core uses only standard web + WebExtension APIs.** No `chrome.offscreen`, no File System Access API in the
  critical path (both Chrome-only). Dedicated page + `<input type=file>`/drag-drop + Web Worker + anchor/objectURL download.
  Chrome-only niceties (FSA "save to folder", side panel) are optional, feature-detected enhancements.
- **Zero host permissions, zero network.** The extension never fetches or uploads. This is the trust wedge _and_ the
  store-review advantage.

---

## 8. Product / UX

- **Surface:** a dedicated full-page tool (opens in a tab) with a large drag-and-drop target; a tiny toolbar popup that
  deep-links into it. Rationale: file work needs space, progress bars, and a file tree — a cramped popup is the wrong
  shape.
- **Core flow (extract):** drop `.zip` → see file tree with sizes → extract all / pick files → save (download, or
  "save to folder" where supported). Progress + cancel for big archives.
- **Trust cues everywhere:** "100% offline — your files never leave your device," visible because there are literally
  no network/host permissions requested.
- **Formats surfaced progressively:** zip first-class; tar/gz next; rar/7z behind a clearly-labeled "advanced formats"
  load (so the base bundle stays small).
- **Surface recommendation:** ship the **dedicated page** as the primary, cross-browser surface; add the Chrome **side
  panel** + Firefox **sidebar** as a secondary quick-access surface (feature-detected). "Save to folder" (FSA) shows up as
  an enhanced option only in Chrome/Edge; everywhere else the action is "Download" / "Download all (.zip)".
- **The UX wedge vs the incumbents' websites.** The online tools in this space (123apps / online-convert and similar) are
  typically **upload-first, ad-supported, and account-gated**; even the Drive-based zip openers route your file out of the
  browser into a web app. Ours wins by being **offline, no upload, no ads, no sign-in, instant** — process the file the
  moment it's dropped, everything local. Say exactly that on the store tile and the empty-state of the page. Match the
  incumbents' good part (drop → file tree → extract) and beat their bad part (the redirect/upload + wait + ads).

---

## 9. Monetization & go-to-market

**Monetization (realistic for a free-feeling utility):**

- **Free core, forever.** ZIP extract/create, hashing, base64, tar/gz, split/merge stay free — this is how you win installs
  and trust in a low-trust category. A utility that gates the basic job loses to the next free one.
- **One-time "Pro" (recommended primary revenue).** A single purchase unlocks the heavy/convenience features: **RAR/7z
  extraction**, **batch** processing, **encrypted-zip** create, and **"save to folder"** (FSA). One-time beats subscription
  for a tool people use occasionally — it matches the mental model ("I paid for the unzip app once").
- **Donations / "buy me a coffee"** as a low-friction secondary, especially on Firefox where paid tiers convert worse.
- **Explicitly rejected:** ads, affiliate redirects, bundled search-default changes, telemetry. These are the exact moves
  that made this category look scammy (§10) and would forfeit the entire differentiator. The privacy promise is the product.

**Go-to-market:**

- **SEO the store listing** for the literal jobs: "unzip", "zip extractor", "open zip/rar/7z", "extract files", "file hash /
  checksum", "base64". These are high-intent queries the incumbents rank for with worse products.
- **Lead with the wedge in the first line + first screenshot:** "Open ZIP files right in your browser — 100% offline, your
  files never leave your device. No upload, no ads, no sign-in." Screenshots show the drop → tree → extract flow.
- **ChromeOS / Google Drive angle.** Chromebooks and Drive have no built-in unarchive for most formats; target that
  audience directly (listing copy, and the Chrome-only "extract to folder" convenience lands especially well there).
- **Single-purpose framing** ("local file utilities") to stay onside of store policy (§10) while still shipping the toolset.
- **Firefox is a cheap second front:** near-zero credible competition (§4–§5), one shared codebase, so the marginal cost of
  the second store is low and the "we're on Firefox too" story is itself differentiating.

---

## 10. Risks

Known risks and mitigations:

- **The category's reputation is poisoned by bundleware** ("…& Custom Web Search" listings that hijack search). Mitigate
  by being conspicuously clean: single purpose, no host permissions, no network, open about it in the listing. Do **not**
  imitate their install tactics.
- **Single-purpose policy (Chrome).** A "toolbox" can read as multi-purpose. Frame the single purpose as "local file
  utilities" and keep everything genuinely local-file-scoped; don't add unrelated surfaces.
- **No remote code (Chrome MV3).** All JS/WASM must be bundled and run locally — no CDN fetch, no `eval`. We need
  `'wasm-unsafe-eval'` in the CSP (allowed) but nothing more; keep it that way.
- **AMO review friction.** Firefox requires **reviewable source** for minified/bundled code — submit unminified sources +
  documented build steps (Node/bundler versions). Plan the repo and build tooling for reproducible builds from day one.
- **RAR / UnRAR license.** UnRAR's license restricts using its code to recreate the RAR _compression_ algorithm and has
  redistribution terms — vet before shipping RAR; prefer libarchive's read support, but **verify whether libarchive's RAR
  reader itself includes UnRAR-derived code** and document the license posture. This is the main reason RAR is Pro/later,
  not MVP.
- **Large-file / memory OOM.** Whole-file-in-memory extraction can crash the tab on multi-GB archives — stream through the
  Worker, cap buffers, expose clear size limits and a cancel (§7.3).
- **Chrome-only enhancement drift.** `sidePanel` + FSA raise `minimum_chrome_version` and don't exist on Firefox — keep
  them strictly optional/feature-detected so the core never regresses on either browser.

---

## 11. Prioritized MVP build order

1. **Skeleton + dedicated page + drag-drop + Web Worker plumbing** (cross-browser, minimal permissions — no host perms, at
   most `downloads`; webextension-polyfill).
2. **ZIP extract** (fflate) — file tree, extract-all, per-file, progress, cancel, **zip-bomb cap + Zip-Slip path sanitization**.
3. **ZIP create** (fflate) — add files/folders, compress, download.
4. **Hashing** — hash-wasm incremental for large files (MD5 + SHA); WebCrypto for quick SHA of small inputs.
5. **Base64** (text + file → data-URI) and **split/merge** (Blob.slice) — cheap fillers.
6. **tar/gz** extract (fflate + tiny tar reader).
7. **Listing + privacy copy + screenshots; ship Chrome + Firefox** from the one build.
8. **Fast-follow:** metadata/EXIF inspector; **Pro/later:** RAR/7z via WASM, batch, encrypted-zip, save-to-folder.

---

## Appendix A — sources

**Market data (retrieved 2026-07-12):**

- AMO v5 API — `https://addons.mozilla.org/api/v5/addons/search/` (queries + `average_daily_users`, §4), retrieved
  2026-07-12T08:20–08:21Z.
- Repo snapshot — `results/utilities.csv`, `data/snapshots/chrome/2025-01-05` (Chrome demand buckets).
- Incumbent CRXs, unpacked and read firsthand under `research/incumbents/{zipextractor,unzip_realtool,zipmanager}/`
  (§6); teardown notes `research/incumbents/TEARDOWN.md`.

**Libraries (license + size corroborated by feasibility research; verify pins at build time):**

- fflate — `https://github.com/101arrowz/fflate` (MIT).
- zip.js — `https://github.com/gildas-lormeau/zip.js`, npm `@zip.js/zip.js` (BSD-3-Clause).
- JSZip — `https://stuk.github.io/jszip/` (MIT).
- libarchive.js — `https://github.com/nika-begiashvili/libarchivejs` (libarchive BSD-2; RAR reader provenance to verify).
- node-unrar-js — `https://github.com/YuJianrong/node-unrar.js` (bundles RarLab UnRAR — non-free license).
- 7z-wasm — `https://github.com/use-strict/7z-wasm` (p7zip, LGPL + bundled UnRAR).
- hash-wasm — `https://github.com/Daninet/hash-wasm` (MIT).
- file-type — `https://github.com/sindresorhus/file-type` (MIT); exifr — `https://github.com/MikeKovarik/exifr` (MIT).

**Platform / policy docs (direct URLs; verify live before quoting):**

- MDN File System Access API — `https://developer.mozilla.org/en-US/docs/Web/API/File_System_API`
- MDN `SubtleCrypto.digest` (one-shot, no streaming) — `https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest`
- MDN `DecompressionStream` — `https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream`
- MDN `Blob.slice` — `https://developer.mozilla.org/en-US/docs/Web/API/Blob/slice`
- MDN `downloads.download` (relative `filename` paths) — `https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/download`
- Chrome `offscreen` (Chrome-only) — `https://developer.chrome.com/docs/extensions/reference/api/offscreen`
- Chrome `sidePanel` (Chrome-only) — `https://developer.chrome.com/docs/extensions/reference/api/sidePanel`
- Chrome MV3 CSP / `wasm-unsafe-eval` — `https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy`
- Chrome Web Store program policies (single purpose, no remote code) — `https://developer.chrome.com/docs/webstore/program-policies`
- Firefox add-on source-code submission — `https://extensionworkshop.com/documentation/publish/source-code-submission/`
- Firefox MV3 migration — `https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/`
- `browser_specific_settings.gecko.id` — `https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings`

_Confidence notes:_ library sizes are approximate (min+gzip) and should be re-checked against bundlephobia/npm at build
time; RAR/libarchive provenance and fflate's Zip64 support need build-time verification (§7.1). The unzip demand figure is
an order-of-magnitude read from ratings volume (§3) — pin it to the live CWS install tier before quoting a hard number.
