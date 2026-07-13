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
    let parsed: { result: { driver_path: string } };
    try {
      parsed = JSON.parse(output) as { result: { driver_path: string } };
    } catch (e) {
      throw new Error(
        `Selenium Manager returned unexpected output (expected JSON).\nRaw output: ${output}\nCause: ${e}`,
      );
    }
    process.env.SE_GECKODRIVER_BINARY = parsed.result.driver_path;
  }
}
