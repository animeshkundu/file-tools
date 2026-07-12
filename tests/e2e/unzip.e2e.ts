/**
 * End-to-end test for the Unzip tool running inside a real Firefox WebExtension.
 *
 * Setup: builds (if needed) .output/firefox-mv3, launches Firefox with a
 * temporary profile that loads the extension via the developer-proxy-file
 * mechanism, and drives the full extract flow against a small in-repo fixture.
 *
 * Network-egress check: all navigations and resource fetches are monitored;
 * the test fails if any request leaves the moz-extension:// origin.
 */

import { firefox, type BrowserContext } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const EXT_DIR = path.join(REPO_ROOT, '.output/firefox-mv3');
const EXT_ID = 'file-tools@local';
// Fixed UUID so the extension URL is predictable across runs.
const EXT_UUID = 'c7e8f6a5-1b2c-3d4e-5f6a-7b8c9d0e1f2a';
const APP_URL = `moz-extension://${EXT_UUID}/app.html`;
const FIXTURE_ZIP = path.join(__dirname, 'fixtures/sample.zip');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFirefoxProfile(): string {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'ff-ext-'));

  // Proxy file: a plain-text file whose content is the absolute path to the
  // unpacked extension directory.  Firefox reads this on startup and loads the
  // extension from that location (developer / unsigned mode).
  mkdirSync(path.join(profileDir, 'extensions'), { recursive: true });
  writeFileSync(path.join(profileDir, 'extensions', EXT_ID), EXT_DIR, 'utf8');

  // user.js is re-applied by Firefox on every startup before reading prefs.js.
  const uuids = JSON.stringify({ [EXT_ID]: EXT_UUID });
  writeFileSync(
    path.join(profileDir, 'user.js'),
    [
      // Allow loading unsigned / temporary extensions.
      'user_pref("xpinstall.signatures.required", false);',
      // Prevent Firefox from auto-disabling extensions based on install scope.
      'user_pref("extensions.autoDisableScopes", 0);',
      // Pin the extension's moz-extension:// UUID so the URL is predictable.
      `user_pref("extensions.webextensions.uuids", ${JSON.stringify(uuids)});`,
    ].join('\n'),
    'utf8',
  );

  return profileDir;
}

async function launchExtensionContext(): Promise<{ context: BrowserContext; profileDir: string }> {
  const profileDir = createFirefoxProfile();
  const context = await firefox.launchPersistentContext(profileDir, {
    headless: true,
  });
  return { context, profileDir };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Unzip — Firefox extension E2E', () => {
  let context: BrowserContext;
  let profileDir: string;

  test.beforeAll(async () => {
    ({ context, profileDir } = await launchExtensionContext());
  });

  test.afterAll(async () => {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  });

  test('loads the app page', async () => {
    const page = await context.newPage();
    await page.goto(APP_URL);
    await expect(page.getByRole('heading', { name: 'Unzip, privately.' })).toBeVisible();
    await page.close();
  });

  test('extracts fixture ZIP and lists entries without network egress', async () => {
    const page = await context.newPage();

    // Collect every URL the page requests during this scenario.
    const requestedUrls: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      // Allow only extension-internal and browser-internal origins.
      if (!url.startsWith(`moz-extension://${EXT_UUID}/`) && !url.startsWith('about:')) {
        requestedUrls.push(url);
      }
    });

    await page.goto(APP_URL);

    // The hidden file input is the entry point for programmatic file selection.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_ZIP);

    // Wait for the ready state: the heading shows "N files".
    await expect(page.getByText(/\d+ files?/u)).toBeVisible({ timeout: 15_000 });

    // Both fixture entries must appear in the file tree.
    await expect(page.getByText('hello.txt')).toBeVisible();
    await expect(page.getByText('subdir/nested.txt')).toBeVisible();

    // No request must have escaped the extension origin.
    expect(requestedUrls, `External network requests detected: ${requestedUrls.join(', ')}`).toHaveLength(0);

    await page.close();
  });
});
