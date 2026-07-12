# File Tools: Vision

> Cross-references: [PRODUCT-SPEC](./PRODUCT-SPEC.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [DESIGN](./DESIGN.md)

## North star

**The file toolkit that does the work on your device, so opening, creating, hashing, and
archiving files never uploads, tracks, or phones home.**

File Tools is a cross-browser MV3 extension (Chrome and Firefox, one WXT + React + TypeScript
+ Tailwind codebase) that performs local file operations entirely client-side: no upload, no
ads, no account, and a shipped build that requests zero permissions. Every claim we make about
privacy is meant to be checkable by the user in about ten seconds by reading the manifest, not
taken on faith.

## Expanded vision (3-year horizon)

In three years, File Tools is the default answer to "how do I unzip this without uploading it
anywhere," on both Chrome and Firefox. It has grown from a ZIP-first utility into the real
offline file toolkit: archive extraction and creation across ZIP, TAR/GZ, and (license permitting)
RAR/7z; file hashing; base64; split/merge; and local-file metadata inspection, all still running
without a single network request. It is the tool people recommend to a coworker who just wants
their download to open, and the tool privacy-conscious users point to as proof that "no upload"
extensions can actually ship.

It also becomes the proof of a pattern, not a one-off. The drop-zone UI, Web Worker compute
harness, download flow, and cross-browser manifest plumbing are a shared core that other
single-purpose, offline-first tools in the same family can build on, the same way the archive
teardown that motivated File Tools also surfaced adjacent, underserved categories. File Tools
earns the credibility (installs, ratings, a track record of clean store reviews) that makes
those sibling tools easier to ship and easier to trust on day one.

Revenue, if it exists at all, stays honest: a free core that never expires, plus an optional
one-time unlock for the heavy or convenience features, never ads, never a phoned-home account.
Three years out, that model has either found a sustainable offline-verifiable shape or we have
said so plainly rather than quietly adding a network call to make it easier.

## Positioning: the real competitor is a website, not an extension

A firsthand teardown of the category's Chrome Web Store "leaders" found they are not tools at
all. **ZIP Extractor** (200,000+ installs, **15,164 ratings**, 4.28 stars) is a deprecated MV2
Chrome App: 9 files, all icons, zero logic. Its manifest registers a Google Drive "Open" action
that launches the `zipextractor.app` website. The adjacent "Unzip" listing behaves the same way,
redirecting to `openzip.app`. Google ended the Chrome Apps platform, so neither can be
republished or meaningfully updated; their install counts are grandfathered demand for a Drive
shortcut to a website, not for an in-browser tool. On Firefox these Chrome Apps never existed, so
Firefox users already just use the same upload-based websites.

Net: the real MV3, in-browser, fully offline tool slot is empty on both browsers. The thing we
have to beat is not an extension, it is a website: upload, wait, ads, sign-in. An incumbent stuck
on a dead platform structurally cannot respond in kind.

On Firefox, the AMO listings confirm the same emptiness rather than a saturated market: the only
genuine same-job archive extractor is a roughly 401-daily-user tool called ZIP Manager, next to a
roughly 2,824-user listing whose real business is search-hijack bundleware. RAR, 7z, and tar
extraction are effectively unserved there.

We match the good part of the incumbent flow (drop a file, see a file tree, extract) and remove
the bad part (redirect off-device, upload, waiting, ads, an account gate). The one genuine,
clean MV3 reference in the category is `zipmanager`, a SolidJS side-panel unzip tool with zero
host permissions and no network calls. It sets the UX bar, but it is Chrome-locked (File System
Access API plus `sidePanel`); we take its bar and drop its Chrome-only dependencies from the
critical path so the same experience runs on Firefox too.

## Who it's for

| Persona | In one line |
| --- | --- |
| Everyday recipient | Got a `.zip` attachment or download and just needs it open, especially on ChromeOS/Drive where there is no native unarchive. |
| Developer / IT / power user | Needs checksums (MD5/SHA), base64, tar/gz, split/merge, and cares that files never leave the device. |
| Privacy-conscious user | Refuses upload-based online tools on principle, regardless of convenience. |

All three are essentially unserved on Firefox today, and served badly (via dead-shim websites)
on Chrome.

## Why now

1. **The leaders are dead-platform zombies.** Google cannot refresh a Chrome App; the incumbents
   are frozen in place while the underlying job keeps recurring.
2. **The demand is structural, not a fad.** ChromeOS and Google Drive still have no native
   unarchive for most formats, so people keep landing on these tools specifically because the
   platform doesn't solve the problem for them.
3. **AMO now requires `data_collection_permissions`** (since 2025-11-03), a disclosure regime
   that rewards a tool that genuinely collects nothing, rather than penalizes it like it would a
   tool trying to hide something.
4. **MV3 plus WebAssembly make the heavy lifting feasible fully client-side** at last, so
   "offline" no longer means "limited."

## The wedge

Offline. No upload. No ads. No account. Minimal permissions (the shipped build requests zero).
Every one of those claims is mechanically verifiable: a user can open the manifest and see there
are no host permissions and no network access requested, rather than trusting a privacy-policy
page. That verifiability is the point, not a footnote, because the category's reputation was
built by tools that said "your privacy matters" while uploading the file anyway.

## Explicit non-goals

- **No generic file-format conversion.** Fully offline, that reduces to image transcoding, which
  is already well served on Firefox (roughly 78,000 daily users on the leading webp converter);
  real cross-format conversion needs a server and breaks the offline promise outright.
- **No ads, affiliate redirects, bundled search-default changes, or telemetry.** These are the
  exact moves that poisoned this category's reputation (see the roughly 2,824-daily-user
  search-hijack "archive" listing on Firefox) and they would forfeit the entire differentiator.
- **Not a sprawling "toolbox."** Chrome's single-purpose policy is a real constraint, but it also
  matches the product instinct: the single purpose is local file utilities, not an
  everything-app.
- **No cloud sync, account, or server component**, ever, for the core product.
- **RAR compression is out entirely** (the UnRAR license forbids it); RAR *reading* is only ever
  considered for a later Pro tier, and only after a license review.
