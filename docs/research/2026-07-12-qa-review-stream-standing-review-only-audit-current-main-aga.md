# QA review stream: current-main audit research

Date: 2026-07-12  
Scope: standing review-only audit of current `main`  
Controller correlation: `unit-id: b1c4c7d6-0736-4caa-ab31-573bae3f66d8`

## Purpose and boundaries

This research supports one bounded follow-up: write the current-main QA audit to
`docs/backlog/qa/audit-main.md`. It assesses the current phase only against `docs/VISION.md`,
`CLAUDE.md`, the binding findings in `docs/PEER-REVIEW.md`, and the supplied acceptance criteria.
It does not propose source edits and does not cover deferred roadmap tools, the central-directory
engine, capture features, or a tagged release beyond naming them as out of scope.

## Sources inspected

- Product and engineering contract: `CLAUDE.md`, `docs/VISION.md`, `docs/PRODUCT-SPEC.md`,
  `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/PEER-REVIEW.md`, `docs/PUBLISHING.md`,
  `docs/ROADMAP.md`.
- Unzip implementation: `entrypoints/app/App.tsx`, `lib/core/worker.ts`,
  `lib/core/safety.ts`, `lib/core/download.ts`, `lib/core/dropzone.tsx`,
  `lib/tools/unzip/*`, `components/*`.
- Verification and delivery: `tests/*`, `package.json`, `docs/THIRD-PARTY.md`, `wxt.config.ts`,
  `.github/workflows/*`, `README.md`.
- Repository searches for network APIs, worker transfer/cleanup, accessibility semantics,
  permission copy, dependency ranges, standing-stream artifacts, Pages, Playwright, and
  adversarial fixtures.

No runtime behavior was changed. Findings below combine source/workflow inspection with a clean
dependency install and repository-gate baseline.

## Verification baseline

- `npm ci`: completed; npm reported nine development-tree advisories (one low, two moderate, three
  high, three critical).
- `npm audit --omit=dev`: passed with zero runtime dependency vulnerabilities.
- `npm run check`: passed (TypeScript, ESLint, two Vitest files, nine tests).
- `npm run build`: passed and produced `.output/chrome-mv3`.
- `npm run build:firefox`: passed and produced `.output/firefox-mv3`.

These checks establish that current main compiles, lints, unit-tests, and builds for both targets.
They do not close the acceptance gaps below or substitute for real-browser execution.

## Executive assessment

The seed has the correct durable-page/Web-Worker boundary, a small background glue surface, no
network API calls in application source, a warm-neutral emerald light UI, basic archive safety
primitives, and Chrome/Firefox production builds in CI. It does not yet satisfy any of the six
current-phase acceptance criteria end-to-end. The largest release blockers are unbounded
whole-input/whole-output retention, an incomplete CSP with no artifact gate, no adversarial corpus,
inconsistent permission claims, missing accessibility mechanics/tests, and absent standing-stream,
Pages, and real-Firefox foundations.

## Findings by current-phase acceptance criterion

### AC1 — Bounded-memory streaming Unzip: not satisfied (P0)

Evidence:

- `lib/core/worker.ts:41-45` calls `file.arrayBuffer()` and transfers the complete archive.
- `entrypoints/app/App.tsx:21-32` has no input-size check before worker creation.
- `lib/tools/unzip/extract.ts:27-48` grows a buffer for each file and retains all completed entries;
  `unzip.worker.ts:8-12` returns every output together.
- `components/Progress.tsx:3-4` is indeterminate; the worker protocol has no progress response.
- Cancellation terminates the worker, but `tests/` has no worker lifecycle, cancel, timeout,
  URL-cleanup, or partial-result cleanup coverage.
- `downloadBlob` revokes a URL after one second, but there is no central cleanup contract for all
  success/error/cancel/timeout paths.

Actionable follow-up: harden the Unzip worker boundary with a pre-worker input cap, bounded chunked
input, sequential bounded output accounting (including per-entry and in-flight limits),
determinate progress, prompt cancellation, and lifecycle cleanup tests.

### AC2 — No-egress CSP and manifest gate: not satisfied (P0)

Evidence:

- `wxt.config.ts:12-14` permits `object-src 'self'` and omits `connect-src`, `form-action`,
  `frame-src`, `base-uri`, and explicit local-only worker/style/image/font/media directives.
- No script or CI step parses both `.output/chrome-mv3/manifest.json` and
  `.output/firefox-mv3/manifest.json`.
- Application-source search found no `fetch`, XHR, WebSocket, EventSource, beacon, or HTTP URL use;
  that is useful review evidence but is not artifact enforcement.

Actionable follow-up: set the exact restrictive extension-page CSP, add a parser-based dual-manifest
gate, and test allowed local tokens plus rejected egress-capable directives/sources.

### AC3 — Safety hardening and adversarial corpus: partially satisfied (P0)

Evidence:

- `lib/core/safety.ts` already defines aggregate emitted-byte, entry-count, path-depth,
  recursion-depth, and wall-time limits; uses `bigint`; rejects common traversal/control forms;
  rejects duplicate exact paths; and defaults recursion to zero.
- `lib/tools/unzip/extract.ts:37-39` accounts for emitted bytes before copying each chunk.
- Missing or unproven protections include a distinct per-entry cap, maximum in-flight memory,
  case-colliding paths, Windows reserved names, Unicode bidi spoofing, and ZIP external-attribute
  detection for symlinks/special files.
- `tests/safety.test.ts` and `tests/unzip.test.ts` cover only a small direct-input table, one
  round-trip, and one aggregate emitted-byte cap.
- No committed adversarial fixture corpus exists for CRC corruption, local/central disagreement,
  unsupported methods, duplicate/case collisions, oversized names, bidi names, reserved names, or
  truncation.

Actionable follow-up: close policy gaps in `lib/core/safety.ts`, enforce them in the Unzip adapter,
and make the complete adversarial corpus a deterministic `npm test`/CI release gate with bounded
failure behavior.

### AC4 — Capability contract consistency: not satisfied (P0)

Evidence:

- The governing wording is in `CLAUDE.md:43-45`.
- Current UI says `No permissions` (`App.tsx:136-140`), while `README.md`,
  `docs/VISION.md`, `docs/PRODUCT-SPEC.md`, `docs/DESIGN.md`, and `docs/PUBLISHING.md` repeatedly
  claim zero extension permissions.
- `wxt.config.ts` has `permissions: []` but no optional `downloads` declaration or invocation-time
  request.
- `docs/ARCHITECTURE.md:174-184` describes the intended optional permission, but shipped copy and
  behavior do not implement the same capability contract.
- No dedicated store-listing copy scaffold was found.

Actionable follow-up: use the precise contract consistently in UI, tests, primary docs, publishing
material, and listing copy; distinguish the current permissionless ZIP-in/ZIP-out path from
tree-preserving extract-all, which requests optional `downloads` only when invoked.

### AC5 — Accessibility AA: partially satisfied (P1)

Evidence:

- Strengths: native buttons, a keyboard-addressable dropzone, semantic list markup, a
  screen-reader-only action heading, and the documented light palette.
- `Button.tsx` and `dropzone.tsx` have no explicit `focus-visible` ring despite
  `docs/DESIGN.md:193-214`.
- The dropzone has no accessible name/state attributes; Space handling does not prevent default
  page scrolling.
- `Progress.tsx` has no accessible name, values, or status announcement and uses `animate-pulse`
  without `motion-reduce`.
- Dynamic extraction, success, error, and cancellation states have no live-region/focus-management
  strategy.
- No automated accessibility check exists in tests or CI.

Actionable follow-up: complete keyboard/focus/ARIA/live-region/reduced-motion behavior, verify
WCAG 2.1 AA contrast against actual surfaces, and add an automated production-UI accessibility
gate where feasible.

### AC6 — Standing streams and delivery foundations: not satisfied (P0/P1)

Evidence:

- `.github/workflows/ci.yml` runs compile, lint, unit tests, and both builds on Ubuntu.
- `.github/workflows/release.yml` puts mandatory AMO publication before GitHub Release creation;
  missing Firefox secrets can therefore block the GitHub Release path.
- No Pages site or `/file-tools/` base-path configuration and no Pages deployment workflow exist.
- No Playwright dependency/config/test and no workflow that boots `.output/firefox-mv3` exist.
- No repository artifacts establish Discovery, QA-review, real-Firefox E2E, or exploratory-smoke
  standing streams; `docs/backlog/qa/` does not yet exist.
- CI has no accessibility, adversarial-corpus-specific, CSP-manifest, or exploratory-smoke gate.
- Workflow actions use mutable major-version tags; package dependencies use caret ranges despite
  `CLAUDE.md` requiring exact pins. `docs/THIRD-PARTY.md` matches lockfile runtime versions, but
  `package.json` is not exact-pinned.
- A clean `npm ci` reports nine advisories in the development dependency tree, although
  `npm audit --omit=dev` reports no runtime dependency vulnerabilities.

Actionable follow-up: establish independently runnable standing-stream artifacts, separate
secret-free package/GitHub-Release work from optional store publication, add Pages and real-Firefox
capture workflows, and enforce dependency/workflow provenance consistent with repository policy.

## Cross-cutting review

### North-star and privacy alignment

The durable page, worker compute boundary, glue-only background, local dependencies, and absence of
network API calls align with `docs/VISION.md`. Claims currently overstate what the manifest proves:
zero permissions is not a no-egress mechanism, and several surfaces omit the invocation-time
optional-permission qualification required by the binding capability contract.

### Cross-tool consistency

Only Unzip is shipped, so there is no implemented cross-tool interaction to compare. Shared
Button/Dropzone/FileTree/Progress components provide a useful consistency base. The audit must not
turn future-tool documentation into implementation work during this phase.

### Design-system consistency

`App.tsx`, shared components, `assets/tailwind.css`, and `entrypoints/app/index.html` preserve the
documented warm-neutral, emerald-accented, fixed-light theme. Gaps are behavioral rather than a
redesign need: focus treatment, determinate progress, reduced motion, and accessible state changes.

### Performance and failure behavior

Heavy decompression is correctly off the UI thread, but memory scales with complete input plus all
inflated outputs and a rebuilt download ZIP. The fixed 30-second timer can reject legitimate work,
while whole-file reading starts before worker cancellation/safety accounting. These prevent a
bounded-memory or robust large-input claim.

## Prioritization for the audit backlog

1. **P0 release blockers:** AC1 bounded-memory lifecycle; AC2 CSP/artifact gate; AC3 adversarial
   safety gate; AC4 precise capability contract.
2. **P0 foundation blockers:** secret-independent GitHub Release path, standing-stream ownership,
   Pages scaffold, and real-Firefox production-artifact harness.
3. **P1 quality gate:** complete keyboard/focus/ARIA/live-region/reduced-motion behavior and
   automated accessibility coverage.
4. **P1 supply-chain consistency:** exact dependency pins and immutable workflow-action references.

Each backlog item should cite evidence, name a single concern, define measurable acceptance checks,
avoid overlapping ownership of shared integration files, and remain small enough for independent
review.

## Risks and uncertainties

- Static inspection cannot prove browser runtime behavior, memory ceilings, cancellation latency,
  CSP enforcement, downloads, or Firefox parity; those require production-artifact tests and real
  browser evidence.
- Documentation describes target behavior beside shipped behavior. Audit wording must not report a
  planned capability as implemented.
- Several remediations converge on shared files (`App.tsx`, `wxt.config.ts`, workflows,
  `package.json`, `docs/THIRD-PARTY.md`); follow-up units must serialize those edits.
- The no-egress claim must remain bounded: CSP, manifest tests, production-artifact tests, and
  source review strengthen enforcement but do not justify saying all egress is mechanically proven
  impossible.
