#!/usr/bin/env node
/**
 * Anti-false-green guard for the real-Firefox E2E suite.
 *
 * The E2E job runs `npm run test:e2e`, whose exit code already fails the build
 * on a failing spec. But a suite can exit 0 while silently NOT exercising the
 * assertions that matter — for example if the two real-browser flows are
 * skipped (a `test.skip`, an install/session error swallowed into a skip) while
 * the cheap provisioning checks still pass. That is a green light with no real
 * verification behind it.
 *
 * This guard reads the Playwright JSON report and fails unless the run actually
 * executed the expected number of tests with zero skips, zero failures, and
 * zero flakes. It is deterministic (parses the report object; it does not grep
 * console output) and fail-closed: any missing or malformed field is a failure,
 * never a pass.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = path.join(REPO_ROOT, 'e2e-results.json');

// The suite must run at least this many tests. Bump when adding/removing specs.
const EXPECTED_MIN = Number(process.env.E2E_EXPECTED_MIN ?? '5');

function fail(message) {
  process.stderr.write(`[assert-e2e-ran] FAIL: ${message}\n`);
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(REPORT_PATH, 'utf8');
} catch (e) {
  fail(`could not read Playwright JSON report at ${REPORT_PATH} (did test:e2e run?): ${e.message}`);
}

let report;
try {
  report = JSON.parse(raw);
} catch (e) {
  fail(`Playwright JSON report is not valid JSON: ${e.message}`);
}

const stats = report && report.stats;
if (!stats || typeof stats !== 'object') {
  fail('report has no `stats` object (unexpected Playwright report shape)');
}

for (const key of ['expected', 'skipped', 'unexpected', 'flaky']) {
  if (typeof stats[key] !== 'number' || Number.isNaN(stats[key])) {
    fail(`report.stats.${key} is not a number (unexpected Playwright report shape)`);
  }
}

const { expected, skipped, unexpected, flaky } = stats;

if (Number.isNaN(EXPECTED_MIN) || EXPECTED_MIN < 1) {
  fail(`E2E_EXPECTED_MIN must be a positive integer, got "${process.env.E2E_EXPECTED_MIN}"`);
}
if (unexpected !== 0) {
  fail(`${unexpected} test(s) failed`);
}
if (flaky !== 0) {
  fail(`${flaky} test(s) were flaky (passed only on retry) — treat as not-green`);
}
if (skipped !== 0) {
  fail(`${skipped} test(s) were skipped — every E2E spec must execute`);
}
if (expected < EXPECTED_MIN) {
  fail(`only ${expected} test(s) passed; expected at least ${EXPECTED_MIN} to actually run`);
}

process.stdout.write(
  `[assert-e2e-ran] OK: ${expected} passed, ${skipped} skipped, ${unexpected} failed, ${flaky} flaky (min expected ${EXPECTED_MIN}).\n`,
);
