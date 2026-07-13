# Competitor landscape — browser-based file tools & privacy-first extensions

> Scope: browser extensions and web apps that overlap with the File Tools mission
> (offline ZIP/archive extraction, file hashing, base64, split/merge, metadata).
> Sourced from firsthand CRX teardowns (see `docs/TEARDOWN.md`), AMO v5 API sweep
> (2026-07-12), Chrome Web Store listings, and live site review.
> Desktop-only tools are included only for reference framing.

---

## 1. Chrome extensions

| Name | Install signal | Offline? | Privacy posture | Notable features | Gaps we can win on | Source |
|------|---------------|----------|-----------------|------------------|--------------------|--------|
| **ZIP Extractor** (zipextractor.app) | 200 k+ installs, 15,164 ratings, 4.28★ | ✗ No — opens a website | Files uploaded to zipextractor.app server; no extension logic whatsoever | Google Drive context-menu shortcut; opens zipextractor.app web UI | Dead-platform shim (MV2 Chrome App); cannot run on Firefox; server-upload privacy risk; zero in-browser work | [CWS listing](https://chromewebstore.google.com/detail/mmfcakoljjhncfphlflcedhgogfhpbcd) · [zipextractor.app](https://zipextractor.app) |
| **Unzip** (unzip\_realtool) | Small (<5 k) | ✗ No — opens openzip.app | Files handed off to openzip.app; no extraction code in extension | Injects deep-link icons into Google Search results for .zip/.rar/.7z links; one-click send to website | Redirects sensitive files to a third-party site; Chrome-only; no real offline capability | [CWS listing](https://chromewebstore.google.com/detail/aeadldkkhkophglffolphilappjgjdbj) · [openzip.app](https://openzip.app) |
| **zipmanager** | Small (~500 users est.) | ✓ Yes — 100% client-side | Genuinely offline; zero network calls confirmed in code review; no analytics | MV3, WXT + SolidJS + Tailwind; Chrome side panel; Zip64 streaming in a Web Worker; 70-locale i18n; ~350 KB JS | **Chrome-only** (uses File System Access API + `sidePanel` absent in Firefox); no encrypted-ZIP; no TAR/GZ; no hashing/base64/split | [CWS listing](https://chromewebstore.google.com/detail/lpgfdpapbfpgakgejlieajfmgbgafajg) |
| **Wicked Good Unarchiver** | 100 k installs, 405 ratings, 2.77★ | ✓ Yes — offline extraction | Open source (libarchive); no network calls; ChromeOS Files-app integration | ChromeOS Files-app provider; 7z, ISO, TAR, CAB, deb, rpm, and more via libarchive WASM; free & OSS | **ChromeOS-only** (Files app API); poorly rated (2.77★); reports of unremovable install; not a general browser extension | [CWS listing](https://chromewebstore.google.com/detail/mljpablpddhocfbnokacjggdbmafjnon) · [GitHub](https://github.com/vapier/chrome-ext-wicked-good-unarchiver) |
| **RAR File Opener** | Not prominently ranked | ✓ Claimed client-side | Claims local-only processing; no independent code audit in repo research | ZIP, RAR, 7z, TAR, GZ, password-protected archives; RAR-to-ZIP conversion | Unaudited; no Firefox; limited to archive extraction only; no hashing or utility tools | [CWS listing](https://chromewebstore.google.com/detail/aecmmicolefgbhkenffndikmdadkjlkl) |
| **WinZip Courier** | 800 k installs, 5 ratings | Partial | Email-attachment context only; brand-name trust unclear | Attaches and compresses files in Gmail/Outlook Web; not a general extractor | Different job (email zipping, not extraction); near-zero ratings signal inflated/low-engagement install base | [CWS listing](https://chromewebstore.google.com/detail/lomojjnmhlhdepbfoknpkenickajcphi) |
| **Kriptonita Zip** | 400 k installs, 4 ratings, 1.0★ | Unknown | Unknown; near-zero ratings signal low engagement or inflated install | Unclear — listing quality very low | Near-zero rating (1.0★) with 400 k installs is a red flag for inflated/bundled distribution; not a credible product | [CWS listing](https://chromewebstore.google.com/detail/fbefajnakmfifehnaneljnhojeijccna) |

---

## 2. Firefox extensions (AMO)

> Figures are `average_daily_users` from the AMO v5 API, retrieved 2026-07-12.

| Name | Avg daily users | Offline? | Privacy posture | Notable features | Gaps we can win on | Source |
|------|----------------|----------|-----------------|------------------|--------------------|--------|
| **ZIP Manager** | 401 | ✓ Yes — local | Offline extraction; no disclosed network calls | Extracts local or remote ZIP links; file tree with selective extraction; free | **Chrome-locked fork** on the Chrome side; Firefox version confirmed genuine but tiny; no RAR/7z/tar; no hashing or other utilities | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/zip-manager/) |
| **Zip-Unzip Files & Custom Web Search** | 2,824 | Unknown | Bundleware: hijacks search defaults on install | Archive label used as a hook; main payload is search-default replacement | **Bundleware anti-pattern** — installs driven by deceptive bundling, not product value; single rating; last updated 2023 | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/zipunzipfiles-customweb-search/) |
| **ezyZip File Extractor** | 66 | ✓ Partial (companion to ezyzip.com) | Right-click helper; delegates heavy work to ezyzip.com web app | Extracts linked archives from right-click context menu via ezyzip.com | Requires visiting ezyzip.com for actual extraction; tiny user base; not standalone | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/ezyzip-file-extractor/) |
| **ZipWeb (it)** | 291 | Unknown | Unknown | Minor archive utility | Minimal footprint; Italian-market-focused; no public code audit | AMO search result |
| **GitZip** | 3,070 | ✗ No | Downloads GitHub subfolder as zip via GitHub API | Download a GitHub repo sub-directory as .zip; not a local extractor | **Different job** — downloads remote repo content, not a local file tool; requires GitHub API access | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/gitzip/) |
| **Files MD5 SHA1 Calculate & Compare** | 278 | ✓ Yes — local | Local computation; no network | MD5 and SHA-1 hashing of local files; checksum comparison | Only MD5/SHA-1; no SHA-256/512; no file utilities bundle; tiny | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/calculate-md5-sha1-hash-che-1/) |
| **base64 decoder** | 3,695 | ✓ Yes — local | Text-only; no network | Decode base64-encoded text selected on a page | **Text only**, not file-to-data-URI; developer-flavored; no file utility bundle | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/base64-decoder/) |
| **Exif Viewer** | 13,448 | ✓ Yes (web images) | Reads EXIF from images already loaded in browser | EXIF/IPTC metadata for images on web pages | **Web images only** — does not inspect local files from disk; no archive or general file utility | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/exif-viewer/) |
| **Save webP as PNG or JPEG** | 78,020 | ✓ Yes — local | Image transcode only; no upload | One-click re-save of webP/AVIF on web pages as PNG or JPEG | **Image transcode only** — served slot; don't compete here | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/save-webp-as-png-or-jpeg/) |
| **File Converter — Online-Convert.com** | 12,654 | ✗ No — uploads files | Files uploaded to online-convert.com servers | Wide-format file conversion via upload | **Upload-based** — breaks offline/privacy promise; depends on third-party server | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/file-converter/) |
| **Web Apps by 123apps** | 19,436 | ✗ No — uploads files | Files uploaded to 123apps servers (mp3cut.net, etc.) | Launcher to 123apps audio/video/file suite | Upload-based; ad-supported; account-gated; same pattern as the dead Chrome App launchers | [AMO listing](https://addons.mozilla.org/en-US/firefox/addon/web-apps-by-123apps/) |

---

## 3. Privacy-first web apps (client-side, no upload)

| Name | Platform | Offline? | Privacy posture | Notable features | Gaps we can win on | Source |
|------|----------|----------|-----------------|------------------|--------------------|--------|
| **BrowserZip** | Web app (PWA-style) | ✓ Yes after page load | 100% client-side JS; explicit "files never leave your device"; no analytics claimed | ZIP, TAR, GZ open/extract/create; AES-256 ZIP creation; no install; cross-browser | No browser extension (requires a tab navigation); no hashing/base64/split/merge tools; no RAR/7z; requires page load for each session | [browserzip.com](https://browserzip.com) |
| **tarpanda.com** | Web app | ✓ Yes after page load | 100% client-side (WASM); no upload; no server contact | ZIP, TAR, GZ, multi-GB archives; inline preview of text/images/PDFs; VirusTotal SHA-256 check link; no size limit; password-protected and multipart support | No extension distribution; requires tab navigation; no archive creation; no hashing/base64/split utilities; no RAR/7z | [tarpanda.com](https://tarpanda.com) |
| **ezyZip.com** (web version) | Web app + optional desktop app | ✓ Yes — 100% client-side | Client-side processing; stated no-upload; ad-supported; 4.1/5 stars (33 k+ reviews) | 140+ archive formats; ZIP/7z/TAR/RAR/ISO/GZ extract & convert; batch ops; inline preview; File System Access API for direct save; 2 GB web limit | **Ad-supported**; no extension; no hashing/base64/split tools; 2 GB limit in browser; desktop Pro version costs money | [ezyzip.com](https://www.ezyzip.com) |
| **openzip.app** | Web app | ✓ Claimed client-side | Claims local JS processing; no upload stated; no independent audit | ZIP extract/create; drag-drop; ~500 MB soft limit | No extension (reached only via redirect from the "Unzip" Chrome extension); no other file utilities; independent audit unavailable | [openzip.app](https://openzip.app) |

---

## 4. Upload-based web services (privacy risk — included for completeness)

| Name | Offline? | Privacy posture | Notable features | Gaps we can win on | Source |
|------|----------|-----------------|------------------|--------------------|--------|
| **zipextractor.app** | ✗ No — server-side | Files processed on remote server; temporary server storage; file-size limits | ZIP/RAR extract; Google Drive integration; simple UI | Upload risk; server dependency; size limits; no extension after Chrome Apps sunset | [zipextractor.app](https://zipextractor.app) |
| **Archive Extractor Online** | ✗ No — server-side | Files uploaded to remote server | 70+ formats; up to 200 MB free; Dropbox/Drive/URL input | Upload = privacy risk; size cap; server dependency; no offline | [extract.me](https://extract.me) |
| **Unzip-Online.com** | ✗ No — server-side | Files uploaded to remote server; temporary storage | Basic ZIP extraction; 200 MB limit | Upload risk; minimal features; no offline | [unzip-online.com](https://unzip-online.com) |
| **Zamzar** | ✗ No — server-side | Upload and server-side conversion; email delivery of results | Very wide format conversion (archives, media, documents) | Upload dependency; registration required for large files; not private; not suitable for sensitive files | [zamzar.com](https://www.zamzar.com) |
| **123apps suite** (mp3cut.net, online-convert.com, etc.) | ✗ No | Upload-based; ad-supported; account-gated ("Remove Ads", "Sign In") | Audio cut, video cut, file convert, archive tools under one brand | Upload = privacy risk; ad-supported; account-gated; the incumbent that the dead Chrome App launchers pointed to | [123apps.com](https://123apps.com) |

---

## 5. Desktop tools (reference only — not browser-based)

| Name | Platform | Offline? | Privacy posture | Notable features | Relevance |
|------|----------|----------|-----------------|------------------|-----------|
| **7-Zip** | Windows (open source) | ✓ Yes — fully local | Open source; no telemetry; LGPL/unRAR | 7z, ZIP, RAR, TAR, GZ, BZIP2, XZ and more; command-line + GUI; very strong compression | Gold standard for power users; our web extension competes for casual/Chromebook/no-install users | [7-zip.org](https://www.7-zip.org) |
| **PeaZip** | Windows/Linux/macOS | ✓ Yes — fully local | Open source (LGPL); no telemetry | 180+ formats; GUI + portable; strong compression; FOSS | Strong desktop offering; not available in browser; our target is zero-install browser users | [peazip.github.io](https://peazip.github.io) |
| **The Unarchiver** | macOS | ✓ Yes — fully local | No telemetry; App Store vetted | Wide format support on macOS; free; well-maintained | macOS desktop; not browser-based; no overlap with extension market | [theunarchiver.com](https://theunarchiver.com) |

---

## 6. Win conditions — where File Tools has a clear opening

The analysis above reveals four structural gaps that no current competitor closes simultaneously:

| Gap | Evidence | How File Tools wins |
|-----|----------|---------------------|
| **No genuine MV3 cross-browser offline extractor exists** | zipmanager is Chrome-only (File System Access + sidePanel); ZIP Manager (Firefox) has ~401 users and no Chrome parity; all other Chrome "leaders" are dead website launchers | Ship a single MV3 codebase on both Chrome and Firefox; offline, no upload, zero install-time permissions |
| **Every capable web app requires a browser tab and a page visit** | BrowserZip, tarpanda, ezyZip are web apps — no extension distribution, no toolbar shortcut, each session starts with a navigation | An extension lives one click away and can operate without navigating anywhere |
| **No competitor bundles archive + hashing + base64 + split/merge** | ZIP Manager does only ZIP; Files MD5 SHA1 does only hashing; base64 decoder handles only text; split/merge has no incumbent at all | A single "File Tools" extension covers the whole local file-ops job-to-be-done without tool-hopping |
| **Trust and privacy copy is unearned or absent** | Bundleware search-hijackers (Zip-Unzip, Converter Suite) hold top AMO user counts via deceptive installs; upload-based tools bury their privacy risks in ToS | Zero install-time permissions (verifiable in the manifest), explicit no-upload copy, offline badge, and open review source are concrete claims — not marketing |

### Formats and jobs still open for Phase 2 and Phase 3

| Format / job | Best current browser option | Current state |
|---|---|---|
| RAR extraction | tarpanda (web app, no ext); ezyZip (web app) | No extension on either browser; no offline extension at all |
| 7z extraction | tarpanda (web app); ezyZip (web app) | Same as RAR |
| TAR / TGZ / BZIP2 | tarpanda (web app); ezyZip (web app) | No extension |
| File hashing (SHA-256/512, MD5) | Files MD5 SHA1 ext (~278 users); SubtleCrypto in DevTools | Under-served; no SHA-256+ extension on Firefox |
| Base64 file encode/decode | base64 decoder ext (text only, 3.7 k users) | File base64 (data URI) completely unserved |
| File split / merge | None found | Completely unserved in extensions |
| Local-file metadata / EXIF | Exif Viewer (web images only, 13 k users) | Local-file framing open |
