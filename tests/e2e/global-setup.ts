import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup(): Promise<void> {
  // Build Firefox extension if the output is missing.
  const manifest = path.join(REPO_ROOT, '.output/firefox-mv3/manifest.json');
  if (!existsSync(manifest)) {
    execSync('npm run build:firefox', { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  // Pre-provision geckodriver via Selenium Manager before any timed test hook
  // runs. On a cold cache this downloads the driver; on a warm cache it is a
  // fast no-op. Running this here (outside the beforeAll timeout window) keeps
  // beforeAll reliably within its timeout budget.
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
    execFileSync(smBin, ['--browser', 'firefox', '--output', 'json'], { stdio: 'ignore' });
  }
}
