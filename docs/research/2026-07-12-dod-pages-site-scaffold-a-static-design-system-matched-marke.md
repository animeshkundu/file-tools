# Research: DoD Pages-site scaffold

- **Date:** 2026-07-12
- **Owner:** File Tools maintainers
- **Work unit:** `3de2b0ca-e7fc-4792-a2eb-0dc4bffa2417`

## Research question

What is the smallest static GitHub Pages scaffold that matches File Tools' shipped design,
communicates the privacy contract accurately, works under `/file-tools/`, and can be deployed by an
exact-pinned, secret-free Pages workflow without crossing this unit's ownership boundary?

## Repository findings

### Scope and current state

- No `site/` tree or Pages workflow exists. Existing automation consists of CI and release
  workflows; neither establishes a Pages deployment.
- The implementation unit owns only new files under `site/**` and
  `.github/workflows/pages.yml`. The two files under `docs/research/` and `docs/plans/` are
  explicitly requested durable planning artifacts, not implementation scope expansion.
- The site must remain a static scaffold. Adding a framework, dependency, package script, or lockfile
  change would violate the disjoint ownership constraint and is unnecessary for a small marketing
  and documentation surface.

### Product and privacy copy

- The current product is a single cross-browser MV3 Unzip extension, not the broader future toolkit
  (`docs/ARCHITECTURE.md:9-18`, `ROADMAP.md:5-27`).
- The governing capability wording is:

  > Local processing, no upload; zero install-time permissions for the core; optional `downloads`
  > permission requested only for tree-preserving extract-all.

  This wording must appear without implying that manifest permissions alone prove privacy
  (`CLAUDE.md:41-51`, `docs/PEER-REVIEW.md:12-18`).
- Marketing copy must describe the current Unzip focus and avoid presenting deferred tools or a
  tagged release as implemented. The future Phase-1 tools, central-directory engine,
  screenshot/video capture, and tagged GitHub Release remain out of scope.
- The site itself is delivered over the web, so “offline” and “no network” claims must be clearly
  scoped to extension file processing rather than to visiting the Pages site.

### Visual and accessibility system

- The shipped interface uses a fixed light, warm-neutral palette with emerald accents, system UI
  fonts, a radial pale-green background, white bordered cards, restrained shadows, and rounded
  surfaces (`docs/DESIGN.md:32-128`, `assets/tailwind.css:1-18`).
- The primary layout is a centered `56rem` container with responsive `1.25rem` page padding.
  Typography and color tokens are explicitly documented in `docs/DESIGN.md:34-97`.
- The site should use semantic landmarks and headings, a skip link, visible emerald focus outlines,
  a 320px minimum viewport, no animation, and WCAG 2.1 AA-compatible documented color pairings
  (`docs/DESIGN.md:193-219`).
- `mocks/home.html` is the closest static visual reference, but its future-tool cards cannot be
  copied into this current-phase site because those tools are gated out.

### Base path and deployment

- Every internal URL and asset reference must be rooted at `/file-tools/`, including navigation
  between the marketing page and docs page. Relative deployment assumptions would be fragile on
  GitHub project Pages.
- A dependency-free structure can use `site/index.html`, `site/docs/index.html`, and
  `site/styles.css`. No JavaScript or remote fonts/assets are required.
- The Pages workflow should:
  1. run for relevant pull requests to validate the static artifact without deploying;
  2. run for pushes to `main` and manual dispatch;
  3. grant only `contents: read`, with `pages: write` and `id-token: write` limited to deployment;
  4. use `actions/configure-pages`, `actions/upload-pages-artifact`, and
     `actions/deploy-pages`;
  5. pin every action to a full immutable commit SHA, with the release tag retained in a comment;
  6. use the `github-pages` environment and a deployment concurrency group;
  7. upload only `site/`, requiring no store credentials or repository secrets.
- The exact action SHAs must be resolved and verified against the upstream action releases during
  implementation rather than guessed in this planning unit.

## Proposed artifact shape

| File | Purpose |
| --- | --- |
| `site/index.html` | Current-product landing page, Unzip value proposition, capability contract, and docs entry point |
| `site/docs/index.html` | Small documentation index covering use, privacy/capabilities, browser scope, and safety boundaries |
| `site/styles.css` | Shared responsive design tokens, components, focus states, and print/reduced-motion-safe styling |
| `.github/workflows/pages.yml` | Static validation, Pages artifact upload, and protected deployment |

## Risks and mitigations

1. **Overclaiming privacy or shipped capability.** Keep the canonical contract verbatim, scope claims
   to extension processing, and distinguish current Unzip behavior from product direction.
2. **Broken project-site links.** Use `/file-tools/` for every internal route and stylesheet, then
   validate generated references in the workflow and browser.
3. **Supply-chain drift in Actions.** Use full commit SHAs, not moving major tags, and document the
   corresponding release beside each pin.
4. **Accidental deploys from pull requests.** Separate validation/upload from deployment and gate the
   deploy job to the default branch or manual dispatch.
5. **Insufficient accessibility.** Use semantic HTML, a skip link, visible focus, responsive reflow,
   documented AA color pairs, and automated HTML/accessibility checks available without expanding
   package ownership.
6. **Scope creep into deferred work.** Do not add extension code, future-tool pages, release
   automation, screenshots, video, analytics, telemetry, or external runtime assets.

## Verification expected during implementation

- Inspect every changed path to confirm only `site/**` and `.github/workflows/pages.yml` are
  implementation files.
- Run `npm run check`, `npm run build`, and `npm run build:firefox`, preserving complete command
  output for handoff.
- Validate all local site links and `/file-tools/` asset paths, and reject external executable
  resources.
- Serve `site/` at `/file-tools/`; inspect the landing and docs routes at desktop and 320px widths,
  keyboard through all links, and run an automated accessibility scan where available.
- Parse the workflow YAML, confirm all `uses:` values are full SHAs, and verify least-privilege job
  permissions, artifact path, environment, concurrency, and deploy gating.
- Run secret scanning on every changed artifact before commit.

## References

- [`CLAUDE.md`](../../CLAUDE.md)
- [`docs/VISION.md`](../VISION.md)
- [`docs/PRODUCT-SPEC.md`](../PRODUCT-SPEC.md)
- [`docs/DESIGN.md`](../DESIGN.md)
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`docs/PEER-REVIEW.md`](../PEER-REVIEW.md)
- [`docs/PUBLISHING.md`](../PUBLISHING.md)
- [`ROADMAP.md`](../../ROADMAP.md)
- [`mocks/home.html`](../../mocks/home.html)
- [`assets/tailwind.css`](../../assets/tailwind.css)

