# Plan: DoD Pages-site scaffold

- **Date:** 2026-07-12
- **Owner:** File Tools maintainers
- **Work unit:** `3de2b0ca-e7fc-4792-a2eb-0dc4bffa2417`
- **Research:** [Pages-site scaffold findings](../research/2026-07-12-dod-pages-site-scaffold-a-static-design-system-matched-marke.md)

## Context and boundaries

Create a dependency-free static marketing and documentation scaffold for GitHub project Pages,
served under `/file-tools/`, and an exact-pinned Pages workflow. Preserve the shipped warm-neutral,
emerald-accented light design.

Implementation ownership is limited to:

- `site/**`
- a new `.github/workflows/pages.yml`

The durable research and plan files are the only requested exceptions. Do not edit shared
integration files, dependency manifests, extension code, existing workflows, changelog, ADRs, or
learnings. Do not implement or detail future Phase-1 tools, a ZIP central-directory engine,
screenshot/video capture, or a tagged GitHub Release.

## Step-by-step implementation plan

1. **Create the shared static visual foundation — `site/styles.css`.**
   - Transcribe the documented warm-neutral and emerald color tokens, system font stack, radial
     background, spacing, radii, and restrained card treatment.
   - Add responsive layout primitives for 320px through desktop widths.
   - Add an always-visible keyboard focus treatment, a skip-link treatment, sufficient hover/focus
     differentiation, reduced-motion-safe behavior, and print-safe defaults.
   - Keep the stylesheet self-contained: no remote imports, fonts, scripts, trackers, or analytics.

2. **Create the current-product landing page — `site/index.html`.**
   - Add semantic header, navigation, main content, and footer landmarks with a skip link and logical
     heading order.
   - Present Unzip as the flagship current tool and describe local, client-side ZIP handling without
     claiming gated work has shipped.
   - Include the capability contract verbatim:
     “Local processing, no upload; zero install-time permissions for the core; optional `downloads`
     permission requested only for tree-preserving extract-all.”
   - Explain that privacy is backed by the extension architecture and reviewable controls, not by a
     claim that zero permissions alone proves no egress.
   - Link stylesheet and internal navigation using `/file-tools/`-rooted URLs.

3. **Create the documentation scaffold — `site/docs/index.html`.**
   - Reuse the same semantic header, navigation, footer, and visual system.
   - Add concise sections for using Unzip, local-processing/privacy boundaries, permissions,
     standard-ZIP support and safety limits, Chrome/Firefox scope, and support/source navigation.
   - Clearly scope “offline” to installed extension processing; do not imply the hosted Pages site
     itself is offline.
   - Name deferred areas only when needed to avoid confusion, without implementation detail or
     promises.

4. **Add the Pages pipeline — `.github/workflows/pages.yml`.**
   - Trigger static validation for pull requests affecting owned files, and build/deploy for `main`
     pushes plus manual dispatch.
   - Pin checkout, configure-pages, upload-pages-artifact, and deploy-pages to verified full commit
     SHAs; annotate each immutable pin with its human-readable release.
   - In the build job, validate that required site files exist, internal URLs use `/file-tools/`,
     local targets resolve, HTML has expected semantic/accessibility markers, and no external
     executable resources are referenced.
   - Configure Pages and upload only `site/` as the Pages artifact.
   - Gate deployment away from pull requests, use the `github-pages` environment, expose the deployed
     URL, use deployment concurrency, and grant only the permissions each job requires.
   - Reference no store credentials or repository secrets.

5. **Verify the work unit before handoff.**
   - Confirm the implementation diff contains only `site/**` and `.github/workflows/pages.yml`.
   - Run the full repository gate and browser builds: `npm run check`, `npm run build`, and
     `npm run build:firefox`; retain verbatim output.
   - Exercise the same static checks used by the workflow locally.
   - Serve the repository so `/file-tools/` maps to `site/`; open `/file-tools/` and
     `/file-tools/docs/`, verify all navigation and assets, and inspect at desktop and 320px widths.
   - Keyboard-test every interactive element and run an automated accessibility scan where the
     available browser tooling supports it; require no serious WCAG 2.1 AA findings.
   - Review the workflow for immutable action pins, least privilege, deploy gating, base-path
     correctness, concurrency, and absence of secret dependencies.
   - Scan every changed file for secrets, run code/security validation, and commit with Conventional
     Commits. Include `unit-id: 3de2b0ca-e7fc-4792-a2eb-0dc4bffa2417` in the first implementation
     commit trailer and eventual PR body.

## Acceptance criteria and evidence

| Criterion | Applicability to this bounded unit | Verification |
| --- | --- | --- |
| 1. Bounded-memory streaming Unzip | Out of ownership; no Unzip code changes | Confirm no extension or test files changed and record as unchanged, not newly satisfied by this unit |
| 2. No-egress extension CSP | Out of ownership; `wxt.config.ts` and CI gate are serialized elsewhere | Confirm no CSP/config files changed; ensure the site itself loads no third-party executable resources |
| 3. Safety module and adversarial ZIP corpus | Out of ownership | Confirm no safety or fixture files changed and record as unchanged |
| 4. Capability contract | In scope for site copy | Exact canonical wording appears on the landing/docs surfaces; review copy for no overclaim |
| 5. Accessibility AA | In scope for the site, not the Unzip UI | Semantic/keyboard/responsive checks plus automated accessibility scan; preserve documented AA palette and focus treatment |
| 6. Pages scaffold and deploy workflow | Primary unit deliverable | Both routes render under `/file-tools/`; workflow validates/uploads `site/`, uses required Pages actions pinned to SHAs, deploys only from permitted events, and needs no secrets |

The broader current-phase criteria are mission-level gates. This unit verifies the parts it owns and
must not claim that unrelated criteria have been completed.

## Key risks

- Canonical privacy wording can become inaccurate if shortened; keep it verbatim and add precise
  context.
- Root-relative links can accidentally target `/` rather than `/file-tools/`; validate every local
  URL.
- A workflow-level permission block can overgrant pull-request jobs; keep deployment permissions
  job-scoped.
- Moving action tags undermine reproducibility; require full SHA pins.
- Marketing content can imply future tools are available; keep the site centered on current Unzip.
- A static site can pass visual review while failing keyboard or narrow-screen use; require both
  manual and automated checks.

## Handoff evidence

The implementation handoff must include:

- files changed and why;
- actual verbatim output from the full check and both builds;
- static validation, browser route, responsive, keyboard, and accessibility results;
- one-by-one disposition of the six mission criteria, distinguishing owned verification from
  out-of-scope unchanged items;
- action versions and immutable SHAs used;
- risks or blockers without silent scope reduction;
- the commit and PR references, including the work-unit marker.

