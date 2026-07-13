/**
 * End-to-end test for the Unzip tool running inside a real Firefox WebExtension.
 *
 * Extension loading: builds (if needed) .output/firefox-mv3, then uses Firefox's
 * Remote Debugging Protocol (RDP) to call installTemporaryAddon and reads the
 * assigned moz-extension:// UUID from the extensions.webextensions.uuids pref.
 *
 * Network-egress check: all navigations and resource fetches are monitored;
 * the test fails if any request leaves the moz-extension:// origin.
 *
 * Known limitation: Playwright's Juggler-patched Firefox (v151) does not support
 * page.goto to moz-extension:// URLs — the navigation never fires domcontentloaded.
 * The RDP install + UUID resolution works correctly.  Until Playwright adds native
 * moz-extension:// navigation support, run the full flow against the Chrome build
 * (see below) or use a geckodriver/selenium session for Firefox navigation.
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import net from 'net';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { firefox } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const EXT_DIR = path.join(REPO_ROOT, '.output/firefox-mv3');
const FIXTURE_ZIP = path.join(__dirname, 'fixtures/sample.zip');
const EXT_ID = 'file-tools@local';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

function createFirefoxProfile(): string {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'ff-ext-e2e-'));
  writeFileSync(
    path.join(profileDir, 'user.js'),
    [
      // Allow temporary/unsigned extensions installed via RDP.
      'user_pref("xpinstall.signatures.required", false);',
      'user_pref("extensions.autoDisableScopes", 0);',
      // Enable the Firefox Remote Debugging Protocol.
      'user_pref("devtools.debugger.remote-enabled", true);',
      'user_pref("devtools.debugger.prompt-connection", false);',
    ].join('\n'),
    'utf8',
  );
  return profileDir;
}

/** Wait until a TCP port is accepting connections. */
async function waitForPort(port: number, maxMs = 20_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 300));
    const ok = await new Promise<boolean>((resolve) => {
      const c = net.createConnection(port, '127.0.0.1');
      c.setTimeout(200);
      c.on('connect', () => { c.destroy(); resolve(true); });
      c.on('error', () => resolve(false));
      c.on('timeout', () => { c.destroy(); resolve(false); });
    });
    if (ok) return;
  }
  throw new Error(`Port ${port} never became available`);
}

/**
 * Uses Firefox's RDP (JSON over TCP, length-prefixed) to:
 * 1. Install the unpacked extension directory as a temporary add-on.
 * 2. Read the assigned UUID from the extensions.webextensions.uuids preference.
 *
 * Returns the moz-extension:// UUID string assigned by Firefox.
 */
function installExtensionAndGetUUID(rdpPort: number, extDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(rdpPort, '127.0.0.1');
    let buffer = '';
    type Step = 'greeting' | 'getRoot' | 'install' | 'getPref';
    let step: Step = 'greeting';
    let addonsActor = '';
    let prefActor = '';

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('RDP session timed out'));
    }, 20_000);

    const send = (msg: Record<string, unknown>): void => {
      const json = JSON.stringify(msg);
      socket.write(`${json.length}:${json}`);
    };

    const handle = (msg: Record<string, unknown>): void => {
      if (step === 'greeting' && msg['from'] === 'root') {
        step = 'getRoot';
        send({ to: 'root', type: 'getRoot' });
        return;
      }
      if (step === 'getRoot' && msg['from'] === 'root') {
        addonsActor = msg['addonsActor'] as string;
        prefActor = msg['preferenceActor'] as string;
        step = 'install';
        send({ to: addonsActor, type: 'installTemporaryAddon', addonPath: extDir });
        return;
      }
      if (step === 'install' && msg['addon']) {
        step = 'getPref';
        send({ to: prefActor, type: 'getCharPref', value: 'extensions.webextensions.uuids' });
        return;
      }
      if (step === 'getPref' && msg['value'] !== undefined) {
        clearTimeout(timer);
        socket.destroy();
        const uuids = JSON.parse(msg['value'] as string) as Record<string, string>;
        const uuid = uuids[EXT_ID];
        if (uuid) resolve(uuid);
        else reject(new Error(`UUID not found for ${EXT_ID}; keys: ${Object.keys(uuids).join(', ')}`));
        return;
      }
      if (msg['error']) {
        clearTimeout(timer);
        socket.destroy();
        reject(new Error(`RDP error (step=${step}): ${msg['error'] as string}: ${msg['message'] as string}`));
      }
    };

    socket.on('data', (data) => {
      buffer += data.toString('utf8');
      while (buffer.length > 0) {
        const ci = buffer.indexOf(':');
        if (ci === -1) break;
        const len = parseInt(buffer.slice(0, ci), 10);
        if (isNaN(len) || len <= 0) break;
        if (buffer.length < ci + 1 + len) break;
        const json = buffer.slice(ci + 1, ci + 1 + len);
        buffer = buffer.slice(ci + 1 + len);
        try { handle(JSON.parse(json) as Record<string, unknown>); } catch { /* ignore parse errors */ }
      }
    });

    socket.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function launchExtensionContext(): Promise<{
  context: BrowserContext;
  extUUID: string;
  profileDir: string;
}> {
  const rdpPort = await findFreePort();
  const profileDir = createFirefoxProfile();

  const context = await firefox.launchPersistentContext(profileDir, {
    headless: true,
    args: ['-start-debugger-server', String(rdpPort)],
  });

  await waitForPort(rdpPort);
  const extUUID = await installExtensionAndGetUUID(rdpPort, EXT_DIR);

  return { context, extUUID, profileDir };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Unzip — Firefox extension E2E', () => {
  let context: BrowserContext;
  let extUUID: string;
  let profileDir: string;

  test.beforeAll(async () => {
    ({ context, extUUID, profileDir } = await launchExtensionContext());
  });

  test.afterAll(async () => {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  });

  test('loads the app page', async () => {
    const page = await context.newPage();
    const appURL = `moz-extension://${extUUID}/app.html`;
    await page.goto(appURL);
    await expect(page.getByRole('heading', { name: 'Unzip, privately.' })).toBeVisible();
    await page.close();
  });

  test('extracts fixture ZIP and lists entries without network egress', async () => {
    const page = await context.newPage();
    const appURL = `moz-extension://${extUUID}/app.html`;

    // Collect every URL the page requests during this scenario.
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith(`moz-extension://${extUUID}/`) && !url.startsWith('about:')) {
        externalRequests.push(url);
      }
    });

    await page.goto(appURL);

    // The hidden file input is the entry point for programmatic file selection.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_ZIP);

    // Wait for the ready state: the heading shows "N files".
    await expect(page.getByText(/\d+ files?/u)).toBeVisible({ timeout: 15_000 });

    // Both fixture entries must appear in the file tree.
    await expect(page.getByText('hello.txt')).toBeVisible();
    await expect(page.getByText('subdir/nested.txt')).toBeVisible();

    // No request must have escaped the extension origin.
    expect(externalRequests, `External requests: ${externalRequests.join(', ')}`).toHaveLength(0);

    await page.close();
  });
});
