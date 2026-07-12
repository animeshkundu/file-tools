# Plan: QA-review standing stream current-main audit

Date: 2026-07-12  
Controller correlation: `unit-id: b1c4c7d6-0736-4caa-ab31-573bae3f66d8`

<plan>

## Scope

Create one review-only artifact: `backlog/qa/audit-main.md`.

The implementation task owns only that file. It will not edit application source, tests,
configuration, workflows, dependencies, product documentation, or future-phase implementation.
Deferred roadmap tools, the central-directory engine, capture features, and a tagged release will
be named only as out of scope.

## Step-by-step implementation

1. Create `backlog/qa/` if needed and add `audit-main.md` with the audit date, reviewed revision,
   north-star references, current-phase boundary, and correlation marker.
2. Add a concise executive verdict that distinguishes verified strengths from release blockers:
   durable page/worker architecture, no network APIs found in app source, visual-theme alignment,
   and the six incomplete current-phase criteria.
3. Record one evidence table for AC1 through AC6. For every row, state satisfied/partial/not
   satisfied, cite exact repository files and lines, explain user/release impact, and provide a
   specific follow-up acceptance check.
4. Add cross-cutting sections for north-star alignment, cross-tool consistency, design-system
   consistency, privacy/permission claims, performance/failure cleanup, and accessibility.
5. Convert findings into prioritized, single-concern follow-ups. Each item will include severity,
   evidence, desired outcome, verification, file-ownership hints, and dependency/serialization
   notes for shared integration files. The audit will not implement or dispatch those items.
6. Add an explicit limitations section: source review cannot replace production Chrome/Firefox
   execution, memory/cancellation measurement, CSP artifact checks, download verification, or
   assistive-technology review.
7. Add an out-of-scope section naming only the gated future phases, without implementation detail.
8. Verify the audit against the research artifact and all six supplied criteria, ensuring no
   unsupported success claims, no scope reduction, no TODO-based bypass, and no authorship
   attribution.
9. Run `npm run check`, `npm run build`, and `npm run build:firefox`; paste actual command output or
   an explicit blocker into the implementation handoff. Because the implementation is review-only,
   do not add artificial tests solely to exercise Markdown content, and do not claim source
   behavior changed.
10. Scan `backlog/qa/audit-main.md` for secrets, inspect the final diff to confirm it is the only
    implementation file changed, and commit with a Conventional Commit message whose trailer
    contains the exact correlation marker.

## Acceptance-criterion verification

1. **Bounded-memory Unzip:** the audit cites the pre-worker whole-file read, retained outputs,
   indeterminate progress, cancellation/cleanup behavior, missing caps, and missing lifecycle
   tests; it defines measurable follow-ups without changing source.
2. **No-egress CSP:** the audit compares the current CSP with every required deny/local-only
   directive and confirms whether a dual-built-manifest CI parser exists.
3. **Safety and corpus:** the audit distinguishes existing safety primitives from missing
   per-entry/in-flight policy and fixture coverage, enumerating every required adversarial class.
4. **Capability contract:** the audit compares the governing wording across UI, tests, primary
   docs, publishing/listing copy, manifest declarations, and invocation-time permission behavior.
5. **Accessibility AA:** the audit covers keyboard operation, visible focus, semantics/live
   announcements, reduced motion, contrast, and automated CI coverage against the shipped theme.
6. **Standing streams and foundations:** the audit verifies repository evidence for all four
   streams, secret-independent release packaging, Pages at `/file-tools/`, and a Playwright-Firefox
   workflow booting `.output/firefox-mv3`.

## Key risks

- Target-state documentation may be mistaken for shipped behavior; every status must be grounded
  in implementation or workflow evidence.
- Static review cannot prove runtime privacy, memory, cleanup, accessibility, or browser parity;
  limitations and required runtime evidence must remain explicit.
- Follow-ups may accidentally become mission-sized or overlap shared files; split them by concern
  and serialize ownership where the house rules require it.
- Privacy wording can overclaim what CSP or zero permissions proves; retain the exact capability
  contract and distinguish product promise from technical enforcement.

</plan>
