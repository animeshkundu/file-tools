# No-egress CSP research

- **Date:** 2026-07-12
- **Owner:** animeshkundu/file-tools
- **Work unit:** No-egress CSP in `wxt.config.ts` + `scripts/verify-csp.mjs` + CI wiring
- **Correlation:** `unit-id: e4b007a1-f6b1-4096-a32e-1e2103b1fc1b`

## Research question

What is the smallest repository-aligned change that enforces a strict no-egress extension-page
CSP in both MV3 build artifacts and blocks regressions in CI?

## Findings

1. `wxt.config.ts:12-14` already emits an MV3 `content_security_policy.extension_pages`, but it
   only constrains scripts and objects. Its current `object-src 'self'` is weaker than the required
   deny policy, and the other egress-capable directives are absent.
2. `CLAUDE.md:41-51` defines the required capability contract and explicitly requires deny rules
   for connections, forms, frames, objects, and base URIs plus local-only source directives. It
   also warns that CSP is one enforcement layer, not proof that every possible navigation path is
   mechanically blocked.
3. `docs/PEER-REVIEW.md:14` identifies the missing no-egress CSP and built-manifest CI check as a
   FIX-NOW item because zero extension permissions do not independently prevent network egress.
4. `.github/workflows/ci.yml:37-49` already builds Chrome and Firefox sequentially and then uploads
   `.output/`. A verifier step placed after both builds and before upload can inspect
   `.output/chrome-mv3/manifest.json` and `.output/firefox-mv3/manifest.json` in one invocation.
5. The project is ESM (`package.json:6`), uses Node 22 in CI (`.github/workflows/ci.yml:19-23`), and
   has no `scripts/` files today. A dependency-free `.mjs` verifier can use Node's built-in file and
   process APIs without changing package metadata or dependencies.
6. Vitest runs Node-based tests from `tests/**/*.test.ts` (`vitest.config.ts:3-7`). One focused test
   can execute the verifier in temporary working directories containing synthetic versions of both
   built manifests. This directly covers success and adversarial failures without importing an
   untyped `.mjs` module into strict TypeScript.

## Recommended verifier contract

- Read both fixed build paths on every invocation; missing files, unreadable files, invalid JSON,
  missing MV3 `extension_pages`, or a malformed policy must fail closed.
- Parse directives rather than searching the CSP text with substrings.
- Reject duplicate or unexpected directives.
- Require deny directives to contain exactly `'none'`.
- Require local source directives to contain only the expected tokens: `'self'`, plus
  `'wasm-unsafe-eval'` only on `script-src`.
- Report the target path and reason for every invalid manifest and exit non-zero if either target
  fails.

This exact allowlist rejects remote origins, schemes, wildcard sources, nonce/hash drift, unsafe
eval, and accidental new egress-capable directives rather than trying to enumerate every dangerous
token.

## Scope decision

Implementation is limited to `wxt.config.ts`, `scripts/verify-csp.mjs`,
`.github/workflows/ci.yml`, and one focused `tests/verify-csp.test.ts`. The two requested durable
planning artifacts are preparatory records, not implementation scope. No UI, Unzip, safety,
dependency, third-party notice, accessibility, roadmap, ADR, changelog, or learning file should
change. In particular, the broad Definition of Done documentation clause yields to the mission's
explicit narrow-file constraint.

## Risks

- Chrome and Firefox may serialize the manifest differently; verification must read the actual
  post-build JSON shape and both production builds must be run.
- A permissive parser could miss duplicate directives or unusual whitespace; parsing should
  normalize whitespace while rejecting duplicates and unknown directives.
- A verifier that stops after Chrome could leave Firefox unchecked; tests and CI placement must
  prove both fixed paths are required.
- CSP cannot reliably prevent every top-level navigation mechanism on every browser. The verifier
  should make no broader “proven zero egress” claim.

## Sources

- `CLAUDE.md:19-26,41-51,67-92`
- `wxt.config.ts:4-23`
- `.github/workflows/ci.yml:11-49`
- `package.json:6-20`
- `vitest.config.ts:1-8`
- `.github/instructions/tests.instructions.md:1-15`
- `docs/ARCHITECTURE.md:337-345,377-407`
- `docs/PEER-REVIEW.md:9-16,30-37`

