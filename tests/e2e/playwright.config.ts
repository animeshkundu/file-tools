import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  workers: 1,
  globalSetup: path.join(__dirname, 'global-setup.ts'),
});
