import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  workers: 1,
  // A stray `test.only` in CI would silently narrow the suite to one spec and
  // still report green — reject it so the full E2E set always runs on CI.
  forbidOnly: Boolean(process.env.CI),
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  // Emit a machine-readable result so the post-run guard (assert-e2e-ran.mjs)
  // can fail the build when specs are skipped or fewer than expected executed,
  // plus an HTML report uploaded as an artifact when the job fails. Paths are
  // anchored at the repo root (Playwright resolves a relative reporter
  // outputFile against the config's rootDir, i.e. tests/e2e, not the cwd).
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(REPO_ROOT, 'e2e-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(REPO_ROOT, 'playwright-report') }],
  ],
});
