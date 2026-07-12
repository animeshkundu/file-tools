# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: unzip.e2e.ts >> Unzip — Firefox extension E2E >> extracts fixture ZIP and lists entries without network egress
- Location: tests/e2e/unzip.e2e.ts:91:3

# Error details

```
Error: page.goto: NS_ERROR_NOT_AVAILABLE
Call log:
  - navigating to "moz-extension://c7e8f6a5-1b2c-3d4e-5f6a-7b8c9d0e1f2a/app.html", waiting until "load"

```

# Test source

```ts
  4   |  * Setup: builds (if needed) .output/firefox-mv3, launches Firefox with a
  5   |  * temporary profile that loads the extension via the developer-proxy-file
  6   |  * mechanism, and drives the full extract flow against a small in-repo fixture.
  7   |  *
  8   |  * Network-egress check: all navigations and resource fetches are monitored;
  9   |  * the test fails if any request leaves the moz-extension:// origin.
  10  |  */
  11  | 
  12  | import { firefox, type BrowserContext } from '@playwright/test';
  13  | import { test, expect } from '@playwright/test';
  14  | import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
  15  | import { tmpdir } from 'os';
  16  | import path from 'path';
  17  | import { fileURLToPath } from 'url';
  18  | 
  19  | const __dirname = path.dirname(fileURLToPath(import.meta.url));
  20  | const REPO_ROOT = path.resolve(__dirname, '../..');
  21  | const EXT_DIR = path.join(REPO_ROOT, '.output/firefox-mv3');
  22  | const EXT_ID = 'file-tools@local';
  23  | // Fixed UUID so the extension URL is predictable across runs.
  24  | const EXT_UUID = 'c7e8f6a5-1b2c-3d4e-5f6a-7b8c9d0e1f2a';
  25  | const APP_URL = `moz-extension://${EXT_UUID}/app.html`;
  26  | const FIXTURE_ZIP = path.join(__dirname, 'fixtures/sample.zip');
  27  | 
  28  | // ---------------------------------------------------------------------------
  29  | // Helpers
  30  | // ---------------------------------------------------------------------------
  31  | 
  32  | function createFirefoxProfile(): string {
  33  |   const profileDir = mkdtempSync(path.join(tmpdir(), 'ff-ext-'));
  34  | 
  35  |   // Proxy file: a plain-text file whose content is the absolute path to the
  36  |   // unpacked extension directory.  Firefox reads this on startup and loads the
  37  |   // extension from that location (developer / unsigned mode).
  38  |   mkdirSync(path.join(profileDir, 'extensions'), { recursive: true });
  39  |   writeFileSync(path.join(profileDir, 'extensions', EXT_ID), EXT_DIR, 'utf8');
  40  | 
  41  |   // user.js is re-applied by Firefox on every startup before reading prefs.js.
  42  |   const uuids = JSON.stringify({ [EXT_ID]: EXT_UUID });
  43  |   writeFileSync(
  44  |     path.join(profileDir, 'user.js'),
  45  |     [
  46  |       // Allow loading unsigned / temporary extensions.
  47  |       'user_pref("xpinstall.signatures.required", false);',
  48  |       // Prevent Firefox from auto-disabling extensions based on install scope.
  49  |       'user_pref("extensions.autoDisableScopes", 0);',
  50  |       // Pin the extension's moz-extension:// UUID so the URL is predictable.
  51  |       `user_pref("extensions.webextensions.uuids", ${JSON.stringify(uuids)});`,
  52  |     ].join('\n'),
  53  |     'utf8',
  54  |   );
  55  | 
  56  |   return profileDir;
  57  | }
  58  | 
  59  | async function launchExtensionContext(): Promise<{ context: BrowserContext; profileDir: string }> {
  60  |   const profileDir = createFirefoxProfile();
  61  |   const context = await firefox.launchPersistentContext(profileDir, {
  62  |     headless: true,
  63  |   });
  64  |   return { context, profileDir };
  65  | }
  66  | 
  67  | // ---------------------------------------------------------------------------
  68  | // Tests
  69  | // ---------------------------------------------------------------------------
  70  | 
  71  | test.describe('Unzip — Firefox extension E2E', () => {
  72  |   let context: BrowserContext;
  73  |   let profileDir: string;
  74  | 
  75  |   test.beforeAll(async () => {
  76  |     ({ context, profileDir } = await launchExtensionContext());
  77  |   });
  78  | 
  79  |   test.afterAll(async () => {
  80  |     await context.close();
  81  |     rmSync(profileDir, { recursive: true, force: true });
  82  |   });
  83  | 
  84  |   test('loads the app page', async () => {
  85  |     const page = await context.newPage();
  86  |     await page.goto(APP_URL);
  87  |     await expect(page.getByRole('heading', { name: 'Unzip, privately.' })).toBeVisible();
  88  |     await page.close();
  89  |   });
  90  | 
  91  |   test('extracts fixture ZIP and lists entries without network egress', async () => {
  92  |     const page = await context.newPage();
  93  | 
  94  |     // Collect every URL the page requests during this scenario.
  95  |     const requestedUrls: string[] = [];
  96  |     page.on('request', (req) => {
  97  |       const url = req.url();
  98  |       // Allow only extension-internal and browser-internal origins.
  99  |       if (!url.startsWith(`moz-extension://${EXT_UUID}/`) && !url.startsWith('about:')) {
  100 |         requestedUrls.push(url);
  101 |       }
  102 |     });
  103 | 
> 104 |     await page.goto(APP_URL);
      |                ^ Error: page.goto: NS_ERROR_NOT_AVAILABLE
  105 | 
  106 |     // The hidden file input is the entry point for programmatic file selection.
  107 |     const fileInput = page.locator('input[type="file"]');
  108 |     await fileInput.setInputFiles(FIXTURE_ZIP);
  109 | 
  110 |     // Wait for the ready state: the heading shows "N files".
  111 |     await expect(page.getByText(/\d+ files?/u)).toBeVisible({ timeout: 15_000 });
  112 | 
  113 |     // Both fixture entries must appear in the file tree.
  114 |     await expect(page.getByText('hello.txt')).toBeVisible();
  115 |     await expect(page.getByText('subdir/nested.txt')).toBeVisible();
  116 | 
  117 |     // No request must have escaped the extension origin.
  118 |     expect(requestedUrls, `External network requests detected: ${requestedUrls.join(', ')}`).toHaveLength(0);
  119 | 
  120 |     await page.close();
  121 |   });
  122 | });
  123 | 
```