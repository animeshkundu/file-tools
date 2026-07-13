// @ts-nocheck
/**
 * End-to-end tests for the Unzip tool running inside a real Firefox WebExtension.
 *
 * Uses selenium-webdriver with the system Firefox and geckodriver, which
 * reliably navigates moz-extension:// pages (unlike Playwright's Juggler).
 *
 * Extension loading: installs .output/firefox-mv3 as a temporary add-on via
 * Marionette (driver.installAddon). The moz-extension:// UUID is read from
 * the extensions.webextensions.uuids preference in the CHROME context.
 *
 * Network-egress check: after exercising the Unzip flow, the Performance
 * Resource Timing API is queried for any entry not from the extension origin.
 * The test fails if any such URL is found.
 */

import { test, expect } from '@playwright/test';
import { Builder, By, until } from 'selenium-webdriver';
import { Options as FirefoxOptions, ServiceBuilder, Context } from 'selenium-webdriver/firefox.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const EXT_DIR = path.join(REPO_ROOT, '.output/firefox-mv3');
const FIXTURE_ZIP = path.join(__dirname, 'fixtures/sample.zip');
const EXT_ID = 'file-tools@local';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildGeckoDriver() {
  const options = new FirefoxOptions()
    .addArguments('--headless')
    .addArguments('-remote-allow-system-access');
  const service = new ServiceBuilder();
  return new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();
}

async function getExtensionUUID(driver: ReturnType<typeof buildGeckoDriver>): Promise<string> {
  await driver.setContext(Context.CHROME);
  const raw: string = await driver.executeScript(
    `return Services.prefs.getCharPref('extensions.webextensions.uuids');`,
  );
  await driver.setContext(Context.CONTENT);
  const uuids = JSON.parse(raw) as Record<string, string>;
  const uuid = uuids[EXT_ID];
  if (!uuid) {
    throw new Error(`UUID not found for ${EXT_ID}; available keys: ${Object.keys(uuids).join(', ')}`);
  }
  return uuid;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Unzip — Firefox extension E2E', () => {
  let driver: Awaited<ReturnType<typeof buildGeckoDriver>>;
  let extUUID: string;

  test.beforeAll(async () => {
    driver = await buildGeckoDriver();
    await driver.installAddon(EXT_DIR, /* temporary */ true);
    extUUID = await getExtensionUUID(driver);
  });

  test.afterAll(async () => {
    if (driver) await driver.quit();
  });

  test('loads the app page', async () => {
    const appURL = `moz-extension://${extUUID}/app.html`;
    await driver.get(appURL);
    await driver.wait(until.elementLocated(By.css('h1')), 30_000);
    const heading = await driver.findElement(By.css('h1'));
    expect(await heading.getText()).toBe('Unzip, privately.');
  });

  test('extracts fixture ZIP and lists entries without network egress', async () => {
    const appURL = `moz-extension://${extUUID}/app.html`;
    await driver.get(appURL);
    await driver.wait(until.elementLocated(By.css('h1')), 30_000);

    // Upload the fixture ZIP via the hidden file input.
    const fileInput = await driver.findElement(By.css('input[type="file"]'));
    await fileInput.sendKeys(FIXTURE_ZIP);

    // Wait until the page body text shows "N files" (extraction complete).
    await driver.wait(
      async () => {
        const body = await driver.findElement(By.css('body'));
        return /\d+\s+files?/i.test(await body.getText());
      },
      15_000,
      'Timed out waiting for extraction result',
    );

    // Both fixture entries must appear in the file tree.
    const hello = await driver.findElement(By.xpath('//*[contains(text(),"hello.txt")]'));
    const nested = await driver.findElement(By.xpath('//*[contains(text(),"subdir/nested.txt")]'));
    expect(await hello.isDisplayed()).toBe(true);
    expect(await nested.isDisplayed()).toBe(true);

    // No resource must have been loaded from outside the extension origin.
    const prefix = `moz-extension://${extUUID}/`;
    const externalRequests: string[] = await driver.executeScript(
      `return performance.getEntriesByType('resource')
        .map(function(e) { return e.name; })
        .filter(function(url) {
          return !url.startsWith(arguments[0]) && !url.startsWith('about:');
        });`,
      prefix,
    );
    expect(
      externalRequests,
      `External requests: ${(externalRequests ?? []).join(', ')}`,
    ).toHaveLength(0);
  });
});
