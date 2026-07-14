# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-07-14

No functional changes to extraction. Packaging, release-integrity, site, and documentation improvements.

### Changed

- The Chrome build no longer carries the Firefox-only `browser_specific_settings.gecko` key.
- Release archives are named `unzip-<version>-<browser>.zip`.
- Release signatures now use the modern Sigstore bundle format (`SHA256SUMS.sigstore.json`), verified in CI immediately after signing.

### Added

- Open Graph and Twitter Card metadata, a preview image, an SVG favicon, canonical URLs, and a theme color on the site.
- A populated changelog, a release-version badge, front-page links to the security policy and contributing guide, and inline definitions of security terms in the README.

## [0.1.1] - 2026-07-14

### Changed

- Renamed the extension to **Unzip** end to end: the manifest `name`, the app page title, and the public site and documentation. The Firefox add-on ID is now `unzip@animesh.kundus.in`.

There are no functional changes in this release; it repackages 0.1.0 under the Unzip identity.

## [0.1.0] - 2026-07-13

Initial release. Private, offline ZIP extraction that runs entirely in the browser. (Published under the name "File Tools"; renamed to "Unzip" in 0.1.1.)

### Added

- Streaming, bounded-memory extraction with per-entry and aggregate emitted-byte caps.
- Central-directory-driven, fail-closed ZIP parsing. Encrypted, Zip64 and larger-than-4 GB, corrupt, crafted, and ghost archives are rejected with friendly messages.
- Full path safety against Zip Slip, absolute, UNC, and drive paths; Windows reserved names; bidirectional and Unicode spoofing; and case-colliding names.
- Virtualized, sortable, filterable file tree for large archives and high entry counts.
- Download a single file or the whole tree, preserving folder names, with collision-safe filenames.
- Cancellation and a drop-outside guard against accidental data loss.
- WCAG AA accessibility with an axe gate in CI, and real-Firefox end-to-end tests in CI.
- One MV3 codebase for Chrome and Firefox, built with WXT.

### Security

- Zero install-time permissions and a strict no-egress extension-page Content Security Policy (`connect-src 'none'`, `form-action 'none'`, `object-src 'none'`, `base-uri 'none'`), both checked in CI against the built manifest.

[Unreleased]: https://github.com/animeshkundu/file-tools/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/animeshkundu/file-tools/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/animeshkundu/file-tools/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/animeshkundu/file-tools/releases/tag/v0.1.0
