import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default async function globalSetup(): Promise<void> {
  const manifest = path.join(REPO_ROOT, '.output/firefox-mv3/manifest.json');
  if (!existsSync(manifest)) {
    execSync('npm run build:firefox', { cwd: REPO_ROOT, stdio: 'inherit' });
  }
}
