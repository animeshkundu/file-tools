import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const verifierPath = fileURLToPath(new URL('../scripts/verify-csp.mjs', import.meta.url));
const temporaryDirectories: string[] = [];
const validPolicy =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";

async function runVerifier(policy: string) {
  const cwd = await mkdtemp(resolve(tmpdir(), 'verify-csp-'));
  temporaryDirectories.push(cwd);

  const manifest = {
    manifest_version: 3,
    permissions: [],
    content_security_policy: { extension_pages: policy },
  };

  for (const target of ['chrome-mv3', 'firefox-mv3']) {
    const outputDirectory = resolve(cwd, '.output', target);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(resolve(outputDirectory, 'manifest.json'), JSON.stringify(manifest));
  }

  return spawnSync(process.execPath, [verifierPath], {
    cwd,
    encoding: 'utf8',
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('verify-csp', () => {
  it('accepts the exact no-egress policy in both built manifests', async () => {
    const result = await runVerifier(validPolicy);
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ["connect-src\u00A0'none'", 'U+00A0'],
    ["connect-src\uFEFF 'none'", 'U+FEFF'],
    ["connect-src 'self'", 'missing connect-src deny'],
  ])('rejects %s (%s)', async (replacement) => {
    const result = await runVerifier(validPolicy.replace("connect-src 'none'", replacement));
    expect(result.status, result.stderr).toBe(1);
  });
});
