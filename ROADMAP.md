# Roadmap

A living checklist derived from `.docs/ext-1-file-tools.md` §11.

## Phase 1 — MVP

- [x] Dedicated full-page app, drop zone, Web Worker plumbing, progress, cancel
- [x] Safe ZIP extraction with file tree, per-file download, and bundled download
- [ ] ZIP creation with files and folders
- [ ] Incremental file hashing: MD5 compatibility and SHA family
- [ ] Base64 text/file encode and decode
- [ ] File split and merge
- [ ] Store listing, privacy copy, screenshots, Chrome and Firefox release artifacts

## Phase 2 — Fast follow

- [ ] TAR/GZ extraction with a dedicated TAR reader
- [ ] Local-file metadata and EXIF inspector
- [ ] Optional feature-detected save-to-folder where supported
- [ ] Batch workflows and richer archive selection

## Phase 3 — Heavy / Pro

- [ ] Encrypted and very large ZIP support with a Zip64-capable streaming engine
- [ ] RAR extraction after restrictive-license review
- [ ] 7z extraction after LGPL/UnRAR review
- [ ] Advanced batch and save-to-folder conveniences
