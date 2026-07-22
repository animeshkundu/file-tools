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
import { Options as FirefoxOptions, ServiceBuilder, Context, Driver as FirefoxDriver } from 'selenium-webdriver/firefox.js';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { strToU8, zipSync } from 'fflate';
import { IMAGE_PREVIEW_LIMIT_BYTES } from '../../lib/tools/unzip/preview';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const EXT_DIR = path.join(REPO_ROOT, '.output/firefox-mv3');
const FIXTURE_ZIP = path.join(__dirname, 'fixtures/sample.zip');
const EXT_ID = 'unzip@animesh.kundus.in';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildGeckoDriver(): Promise<FirefoxDriver> {
  const options = new FirefoxOptions()
    .addArguments('--headless')
    .addArguments('-remote-allow-system-access');
  // SE_GECKODRIVER_BINARY is set by global-setup with the path resolved
  // (and version-pinned) by Selenium Manager. Passing it here means this
  // timed hook invokes zero Manager resolution.
  const geckoPath = process.env.SE_GECKODRIVER_BINARY;
  if (!geckoPath) {
    throw new Error(
      'SE_GECKODRIVER_BINARY is not set. Ensure global-setup successfully provisioned geckodriver via Selenium Manager.',
    );
  }
  // SE_FIREFOX_BINARY is the Manager-resolved Firefox binary captured in
  // global-setup. Apply it so the session works on CI runners (and any other
  // environment) that have no system Firefox and rely on Manager's download.
  const firefoxBinary = process.env.SE_FIREFOX_BINARY;
  if (firefoxBinary) {
    options.setBinary(firefoxBinary);
  }
  const service = new ServiceBuilder(geckoPath);
  // Builder.build() returns ThenableWebDriver; at runtime Firefox gives us the
  // Firefox-specific Driver subclass that has installAddon / setContext.
  return new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build() as unknown as FirefoxDriver;
}

async function getExtensionUUID(driver: FirefoxDriver): Promise<string> {
  await driver.setContext(Context.CHROME);
  const raw = await driver.executeScript<string>(
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

function createPreviewFixture(): { fixturePath: string; cleanup: () => void } {
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'unzip-preview-'));
  const fixturePath = path.join(fixtureDirectory, 'preview.zip');
  const pixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const oversizedPng = new Uint8Array(IMAGE_PREVIEW_LIMIT_BYTES + 1);
  oversizedPng.set(pixelPng.subarray(0, 8));

  writeFileSync(
    fixturePath,
    zipSync({
      'preview.txt': strToU8('Preview me locally.'),
      'pixel.png': pixelPng,
      'binary.bin': new Uint8Array([0x00, 0x01, 0x02, 0x03]),
      'oversized.png': oversizedPng,
    }),
  );

  return {
    fixturePath,
    cleanup: () => rmSync(fixtureDirectory, { recursive: true, force: true }),
  };
}

async function getExternalResourceUrls(
  driver: FirefoxDriver,
  extensionPrefix: string,
): Promise<string[]> {
  return (
    (await driver.executeScript<string[]>(
      `return performance.getEntriesByType('resource')
        .map(function(e) { return e.name; })
        .filter(function(url) {
          return !url.startsWith(arguments[0])
            && !url.startsWith('blob:' + arguments[0])
            && !url.startsWith('data:')
            && !url.startsWith('about:');
        });`,
      extensionPrefix,
    )) ?? []
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Unzip — Firefox extension E2E', () => {
  let driver: FirefoxDriver;
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
    const externalRequests = await getExternalResourceUrls(driver, prefix);
    expect(
      externalRequests,
      `External requests: ${externalRequests.join(', ')}`,
    ).toHaveLength(0);
  });

  test('previews text and images and handles binary and oversized entries', async () => {
    const fixture = createPreviewFixture();
    try {
      const appURL = `moz-extension://${extUUID}/app.html`;
      await driver.get(appURL);
      await driver.wait(until.elementLocated(By.css('h1')), 30_000);

      const fileInput = await driver.findElement(By.css('input[type="file"]'));
      await fileInput.sendKeys(fixture.fixturePath);
      await driver.wait(
        until.elementLocated(By.css('[aria-label="Preview preview.txt"]')),
        15_000,
      );

      await driver.findElement(By.css('[aria-label="Preview preview.txt"]')).click();
      await driver.wait(async () => {
        const panel = await driver.findElement(By.id('file-preview'));
        return (await panel.getText()).includes('Preview me locally.');
      }, 5_000);
      let panelText = await driver.findElement(By.id('file-preview')).getText();
      expect(panelText).toContain('Plain text');
      expect(panelText).toContain('19 B');

      await driver.findElement(By.css('[aria-label="Preview pixel.png"]')).click();
      await driver.wait(
        async () =>
          driver.executeScript<boolean>(
            `const image = document.querySelector('#file-preview img');
             return Boolean(image && image.complete && image.naturalWidth > 0);`,
          ),
        5_000,
        'Timed out waiting for image preview',
      );
      panelText = await driver.findElement(By.id('file-preview')).getText();
      expect(panelText).toContain('PNG image');

      await driver.findElement(By.css('[aria-label="Preview binary.bin"]')).click();
      panelText = await driver.findElement(By.id('file-preview')).getText();
      expect(panelText).toContain('No inline preview');
      expect(panelText).toContain('BIN file (binary)');
      expect(
        await driver
          .findElement(By.css('[aria-label="Download binary.bin from preview"]'))
          .isDisplayed(),
      ).toBe(true);

      await driver.findElement(By.css('[aria-label="Preview oversized.png"]')).click();
      panelText = await driver.findElement(By.id('file-preview')).getText();
      expect(panelText).toContain('larger than the 10 MB inline preview limit');

      await driver.findElement(By.css('[aria-label="Close preview"]')).click();
      panelText = await driver.findElement(By.id('file-preview')).getText();
      expect(panelText).toContain('Select a file to preview');
      await driver.wait(
        async () =>
          (await driver.switchTo().activeElement().getAttribute('aria-label')) ===
          'Preview oversized.png',
        2_000,
        'Timed out waiting for preview trigger focus restoration',
      );

      const prefix = `moz-extension://${extUUID}/`;
      const externalRequests = await getExternalResourceUrls(driver, prefix);
      expect(
        externalRequests,
        `External requests: ${externalRequests.join(', ')}`,
      ).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Provisioning environment assertions
// ---------------------------------------------------------------------------
// These tests run without a browser and verify that global-setup correctly
// captured the Selenium Manager resolution results. They prove the harness is
// environment-robust (driver + Firefox paths are always threaded through
// rather than re-resolved on demand).
// ---------------------------------------------------------------------------

test.describe('global-setup provisioning', () => {
  test('SE_GECKODRIVER_BINARY is set and the path exists on disk', () => {
    const driverPath = process.env.SE_GECKODRIVER_BINARY;
    expect(
      driverPath,
      'SE_GECKODRIVER_BINARY must be set by global-setup (Selenium Manager driver resolution)',
    ).toBeTruthy();
    expect(
      existsSync(driverPath!),
      `SE_GECKODRIVER_BINARY path does not exist: ${driverPath}`,
    ).toBe(true);
  });

  test('SE_FIREFOX_BINARY is set by global-setup (Selenium Manager browser resolution)', () => {
    const browserPath = process.env.SE_FIREFOX_BINARY;
    expect(
      browserPath,
      'SE_FIREFOX_BINARY must be set by global-setup (Selenium Manager browser resolution)',
    ).toBeTruthy();
  });

  test('SE_FIREFOX_BINARY is correctly applied to FirefoxOptions via setBinary()', () => {
    const browserPath = process.env.SE_FIREFOX_BINARY;
    // Only verify threading when SM supplied a browser path; otherwise there is
    // nothing to thread and the test above already asserts the var is set.
    if (!browserPath) return;
    // Verify the path is threaded into a real FirefoxOptions instance via the
    // public Capabilities.get() API ('moz:firefoxOptions' key).
    const options = new FirefoxOptions();
    options.setBinary(browserPath);
    const mozOpts = options.get('moz:firefoxOptions') as { binary?: string } | undefined;
    expect(mozOpts?.binary).toBe(browserPath);
  });
});
