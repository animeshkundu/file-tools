# No-egress CSP implementation plan

- **Date:** 2026-07-12
- **Owner:** animeshkundu/file-tools
- **Correlation:** `unit-id: e4b007a1-f6b1-4096-a32e-1e2103b1fc1b`
- **Related research:**
  [`../research/2026-07-12-no-egress-csp-in-wxt-config-ts-scripts-verify-csp-mjs-ci-yml.md`](../research/2026-07-12-no-egress-csp-in-wxt-config-ts-scripts-verify-csp-mjs-ci-yml.md)

## Context and constraints

Harden the MV3 extension-page CSP and enforce the built result for both browsers. Do not alter the
application, tools, archive processing, dependencies, design, accessibility, or unrelated
documentation. The implementation change set is exactly three production/CI files plus one focused
test.

## Step-by-step plan

1. **Establish the pre-change baseline.**
   - Run `npm run check`, `npm run build`, and `npm run build:firefox`.
   - Preserve actual command output and distinguish pre-existing failures from implementation
     regressions.

2. **Add the strict extension-page policy in `wxt.config.ts`.**
   - Replace the current partial policy with explicit local-only `script-src`, `worker-src`,
     `style-src`, `img-src`, `font-src`, and `media-src` directives.
   - Allow `'self'` on each local source directive and allow `'wasm-unsafe-eval'` only on
     `script-src`.
   - Set `connect-src`, `form-action`, `frame-src`, `object-src`, and `base-uri` to exactly
     `'none'`.
   - Leave manifest permissions and all unrelated WXT configuration unchanged.

3. **Create `scripts/verify-csp.mjs` as a fail-closed, dependency-free Node ESM gate.**
   - Always load `.output/chrome-mv3/manifest.json` and
     `.output/firefox-mv3/manifest.json`.
   - Validate that each file is readable JSON with an MV3
     `content_security_policy.extension_pages` string.
   - Parse semicolon-delimited directives and whitespace-delimited source tokens.
   - Reject missing, duplicate, or unexpected directives.
   - Require each deny directive to contain exactly `'none'`.
   - Require exact token allowlists for local source directives, keeping
     `'wasm-unsafe-eval'` exclusive to `script-src`.
   - Collect target-specific errors, print actionable diagnostics, and set a non-zero exit status
     if either manifest fails.

4. **Add one focused adversarial test at `tests/verify-csp.test.ts`.**
   - Run the real ESM script from temporary working directories containing synthetic Chrome and
     Firefox output manifests.
   - Assert success only when both manifests contain the exact policy.
   - Assert non-zero exits for a remote host, wildcard source, missing/relaxed deny directive,
     malformed or missing manifest, and one invalid target paired with one valid target.
   - Keep the test deterministic, isolated, and cleanup-safe; do not weaken existing tests.

5. **Wire the verifier into `.github/workflows/ci.yml`.**
   - Add one named `node scripts/verify-csp.mjs` step after both browser build steps and before
     artifact upload.
   - Do not modify triggers, permissions, dependency installation, existing checks, or artifact
     handling.

6. **Validate acceptance criterion 1.**
   - Run `npm run build` and `npm run build:firefox` and retain verbatim output.
   - Inspect both generated manifests to confirm the emitted MV3 `extension_pages` policy contains
     the six local-only directives, the five exact deny directives, and no placement of
     `'wasm-unsafe-eval'` outside `script-src`.

7. **Validate acceptance criterion 2 and the full regression gate.**
   - Run `npm run check` and retain verbatim compile, lint, and Vitest output.
   - Run `node scripts/verify-csp.mjs` against the two real build outputs and retain verbatim output.
   - Demonstrate the focused test rejects remote, wildcard, malformed, missing, and partially valid
     inputs.
   - Confirm the workflow ordering is Chrome build, Firefox build, CSP verification, artifact
     upload.

8. **Final security and review gates.**
   - Scan the four implementation files for secrets.
   - Run parallel code review and CodeQL validation, treating the CSP and CI behavior change as
     non-trivial.
   - If implementation changes after review, rerun the affected commands and validation.
   - Report every acceptance criterion separately, include actual command output, and explicitly
     disclose any blocker or intentionally deferred risk.

## File changes

- `wxt.config.ts` — strict MV3 `extension_pages` CSP.
- `scripts/verify-csp.mjs` — dual-manifest CSP parser and fail-closed gate.
- `.github/workflows/ci.yml` — post-build verification step.
- `tests/verify-csp.test.ts` — focused success and adversarial regression coverage.

No other implementation files are in scope.

## Key risks and mitigations

- **Cross-browser serialization:** verify actual Chrome and Firefox production manifests, not only
  the source config.
- **Parser bypass:** use exact directive/token allowlists and reject duplicates or unknowns.
- **Single-target blind spot:** hard-code and test the requirement that both output paths validate
  in one run.
- **Overclaiming:** describe the result as CSP and artifact enforcement, not proof against every
  possible browser navigation path.
- **Scope creep:** do not update Unzip, safety, tools, UI, dependencies, notices, accessibility,
  roadmap, ADR, changelog, or learnings.

## Acceptance criteria traceability

1. **Strict CSP and both builds:** steps 2 and 6.
2. **Dual-manifest ESM verifier and CI ordering:** steps 3, 4, 5, and 7.
3. **Definition of Done checks:** steps 1, 4, 6, 7, and 8.

