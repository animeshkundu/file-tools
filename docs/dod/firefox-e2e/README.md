# Firefox E2E — Definition-of-Done artifact (Unzip)

Real-Firefox end-to-end verification of the Unzip tool, driving the built
extension's `moz-extension://` page via selenium-webdriver (Selenium Manager
provisions Firefox + geckodriver; pre-warmed in `global-setup` so the timed
`beforeAll` never downloads).

## Result (2026-07-13, PR #19)

5-run reliability proof — **flaky: 0**:

| run     | result            | time  |
|---------|-------------------|-------|
| cold 1  | 2 passed          | 18.5s |
| cold 2  | 2 passed          | 16.7s |
| cold 3  | 2 passed          | 17.1s |
| warm 1  | 2 passed          | 3.5s  |
| warm 2  | 2 passed          | 3.6s  |

- Both tests pass in every run, including
  `extracts fixture ZIP and lists entries without network egress` — the no-egress
  assertion `expect(externalRequests).toHaveLength(0)` genuinely executed and
  passed in each run.
- No `beforeAll` provisioning timeout (cold runs ~17s, warm ~3.5s).
- `selenium-webdriver` (4.46.0) is a devDependency only; confirmed **absent** from
  the built `.output/firefox-mv3` bundle (content + filename greps).

`unzip-firefox-e2e.png` is a screenshot captured by the harness of the real Unzip
UI rendered in Firefox on the `moz-extension://` origin.
