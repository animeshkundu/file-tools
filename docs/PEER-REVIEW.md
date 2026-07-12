# Peer review - file-tools plan (cross-lab critic)

Reviewer: codex-critic (gpt-5.6-sol), adversarial pass on VISION + PRODUCT-SPEC + ARCHITECTURE.
Verdict: load-bearing premise is unsound - a zero-permission MV3 manifest neither *proves* data
can't leave the device nor supports a reliable cross-browser "extract all to folders" experience
as specified. Scores: assumption-soundness 1/5, failure-mode coverage 2/5, alternatives 3/5. The
Unzip flagship + safety module stand; this hardens the claims and the extract-all UX.

Disposition key: **FIX-NOW** · **GATE** (resolve before that phase) · **SPEC** (policy + tests) ·
**VALIDATE** (strategic, your call).

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | Critical | Zero-permission ≠ privacy proof: no host perms only blocks *privileged* cross-origin; egress still possible via CORS/no-CORS fetch, `<img>`, forms, navigations, `tabs.create`. CSP lacks `connect-src`/`form-action`/`frame-src` deny. `data_collection: none` is a declaration, not enforcement. AND the zero-perm fallback can't do the flagship "extract all to folders": anchor downloads strip path separators + can't recreate a tree; "download all as one zip" isn't extraction; FF has no FSA folder sink → tree-preserving extract-all needs optional `downloads` perm. | **FIX-NOW**: write one **capability contract** (what's technically prevented vs promised; which ops are permissionless vs prompt); ship a **no-egress CSP** (`connect-src 'none'`, `form-action 'none'`, ...) + CI check; and honestly restate to "zero *install-time* permissions for the core," requesting optional `downloads` for tree extract. |
| 2 | Critical | Seed isn't memory-bounded as claimed: `file.arrayBuffer()` reads unbounded input in the page *before* worker safety runs; cancel/timeout can't abort that read. Peak includes archive + all inflated outputs + growable spare + transfer/rebuild + rebuilt ZIP, not just the 512 MiB counter. A big renamed file OOMs the tab before the budget acts. | **FIX-NOW**: add an immediate input-size limit in the seed; pass the `File` (stream) to the worker instead of `arrayBuffer()`; test peak memory on a low-RAM Chromebook before asserting "bounded, fails safely." |
| 3 | High | Planned ZIP architecture doesn't meet MVP reqs: "show full tree before extract" + subset extract need **central-directory / random-access**; sequential `File.stream()`→fflate doesn't provide it (esp. data-descriptor entries); current impl inflates every entry first; fflate's non-UTF-8 fallback ≠ the specified CP437 + Unicode-path-extra-field behavior; CRC/unsupported-methods/multi-disk/dup-paths/conflicting-metadata undefined; `client-zip` streams containers but has no DEFLATE path. | **GATE**: run an **engine spike** (`@zip.js/zip.js` or a deliberate two-phase central-directory reader) before more UI; it's an MVP alternative, not just a Pro dep. |
| 4 | High | Market/moat overstated: ChromeOS Files already extracts ordinary ZIP; the extension has no file-association / Drive "Open with" so it doesn't match the incumbent flow (install → new tab → re-pick file); a frozen Chrome App can still launch a **live, updateable website** that can go client-side WASM / PWA - so "structurally cannot respond" is false. Legacy installs ≠ demand for *offline privacy*. The installable local-processing **PWA** alternative isn't evaluated. | **VALIDATE** + positioning: soften the moat claim; add the Drive/OS-integration reality; justify extension-vs-PWA. |
| 5 | High | Large-file promises conflict with the timeout + sinks: fixed 30 s wall-clock rejects legit multi-hundred-MB work + is incompatible with the >4 GB roadmap (use a no-progress watchdog + resource limits instead); "one message per entry" still buffers the largest entry with no backpressure; FF has no API to stream arbitrary output into a chosen folder (`downloads.download()` takes a URL/blob, not a `WritableStream`); streaming-to-disk needs staging/rollback/cleanup/partial-output UX (undesigned). | **SPEC** + **GATE**: redesign limits + define the FF large-file contract before promising symmetric Zip64 extraction. |
| 6 | High | Archive security has sound primitives (emitted-byte accounting, traversal reject, worker isolation, no-recursion, special-entry reject) but insufficient coverage: **fuzzing + adversarial fixtures must be a release gate, not "next."** Add CRC-corruption, local/central disagreement, unsupported methods, dup + case-colliding paths, oversized names, Unicode-bidi spoof, Windows reserved names, truncated archives. TAR fast-follow expands attack surface (PAX/GNU overrides, sparse, hardlinks, special files, numeric overflow, concatenated streams). SHA-1 = compatibility/legacy only (like MD5). | **SPEC** (gate): fuzz corpus as a release gate; TAR safety design before that tier. |
| 7 | High | Chrome **single-purpose-policy** risk: ZIP + hashing + base64 + EXIF + split/merge are separate user jobs; "local file utilities" isn't narrow. | **VALIDATE/GATE**: keep the archive extension archive-focused; package dev-encodings/hashing or metadata tools as *sibling* extensions unless store pre-review says otherwise. (Aligns with the 3-extension program.) |
| 8 | Med-high | Cross-browser treated as a build concern, not a runtime contract. WXT normalizes APIs, not DOM/behavior. No min-version matrix for module workers, `File.stream()`, `DecompressionStream`, FSA, optional downloads, WASM caching. | **SPEC**: declare a min Chrome/FF matrix + production-artifact integration tests (worker load, cancel, nested downloads, filenames, offline, CSP) on both browsers. |
| 9 | Med | Pro unlock is **honorware**: a signed license proves issuance but is freely copyable without account/device binding, and any local gate is patchable in an unpacked extension. | **VALIDATE**: model conversion as honorware; RAR/7z paid tier must clear LGPL/UnRAR notices + AMO source + WASM provenance first. |
| 10 | Med | Several success metrics aren't measurable under the no-telemetry policy (store dashboards don't expose first-run activation or WAU/MAU cohorts; purchases ≠ in-extension funnel). | **SPEC**: make the metric set operational or explicitly qualitative. |

**Explicitly sound (reviewer):** durable page + dedicated worker (not SW compute); no host
permissions/content scripts in the core; locally-bundled executable assets; terminate-on-cancel;
counting actual inflated bytes; the BOM/source-review path; and honestly flagging the telemetry +
purchase-recovery tensions.

**Single highest-priority fix (reviewer):** replace "zero permissions proves offline while
supporting extract-all" with a **tested cross-browser capability contract** - strict no-egress CSP
+ CI enforcement, plus an explicit decision to request optional `downloads` or narrow the Firefox
extraction workflow.

**Lead disposition:** accept all findings. Unzip flagship + safety module stand. #1 and #2 are
FIX-NOW; #3/#5 gate the extract-all UX + large-file roadmap; #6 fuzzing is a release gate; #4/#7/#9
are strategic (extension-vs-PWA, single-purpose split, honorware) and yours to call.
