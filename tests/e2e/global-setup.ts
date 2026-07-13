import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Pinned geckodriver version — bump this constant when a new release is required.
const GECKODRIVER_VERSION = '0.37.0';

export default async function globalSetup(): Promise<void> {
  // Build Firefox extension if the output is missing.
  const manifest = path.join(REPO_ROOT, '.output/firefox-mv3/manifest.json');
  if (!existsSync(manifest)) {
    execSync('npm run build:firefox', { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  // Expose the pinned version as an env var so it is visible to the test
  // process and any diagnostic tooling without re-reading this file.
  process.env.SE_GECKODRIVER_VERSION = GECKODRIVER_VERSION;

  // Pre-provision geckodriver via Selenium Manager before any timed test hook
  // runs. Passing --driver-version ensures the same binary is resolved across
  // time and environments. Capturing the JSON output gives us the exact
  // resolved binary path, which is stored in SE_GECKODRIVER_BINARY so the
  // timed beforeAll can hand it directly to ServiceBuilder and bypass any
  // further Manager resolution inside the test.
  const smPlatform =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
  const smFile = smPlatform === 'windows' ? 'selenium-manager.exe' : 'selenium-manager';
  const smBin = path.join(
    REPO_ROOT,
    'node_modules/selenium-webdriver/bin',
    smPlatform,
    smFile,
  );
  if (existsSync(smBin)) {
    const output = execFileSync(
      smBin,
      ['--browser', 'firefox', '--driver-version', GECKODRIVER_VERSION, '--output', 'json'],
      { encoding: 'utf8' },
    );
    let parsed: { result: { driver_path: string; browser_path?: string } };
    try {
      parsed = JSON.parse(output) as { result: { driver_path: string; browser_path?: string } };
    } catch (e) {
      throw new Error(
        `Selenium Manager returned unexpected output (expected JSON).\nRaw output: ${output}\nCause: ${e}`,
      );
    }
    process.env.SE_GECKODRIVER_BINARY = parsed.result.driver_path;
    // browser_path is the Manager-resolved Firefox binary. Storing it lets the
    // timed beforeAll use the same Firefox on environments without a system
    // Firefox (e.g. CI runners that rely on Manager's downloaded Firefox).
    // browser_path is typed optional: SM omits it when it cannot locate or
    // download Firefox. In that case we leave SE_FIREFOX_BINARY unset and rely
    // on whatever Firefox is in PATH (same as the previous behavior).
    if (parsed.result.browser_path) {
      process.env.SE_FIREFOX_BINARY = parsed.result.browser_path;
    } else {
      // If SM did not supply a browser_path the session will use system Firefox.
      // This is expected on developer machines; on a CI runner without system
      // Firefox this will cause a SessionNotCreatedError at test time.
      console.warn(
        '[global-setup] Selenium Manager did not return a browser_path; ' +
          'the timed beforeAll will rely on a system Firefox being in PATH.',
      );
    }
  }
}
