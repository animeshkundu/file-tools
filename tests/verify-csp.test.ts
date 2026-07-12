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

type Manifest = Record<string, unknown>;

function validManifest(overrides: Manifest = {}): Manifest {
  return {
    manifest_version: 3,
    permissions: [],
    content_security_policy: { extension_pages: validPolicy },
    ...overrides,
  };
}

async function runVerifier({
  chromeManifest = validManifest(),
  firefoxManifest = chromeManifest,
}: {
  chromeManifest?: Manifest | null;
  firefoxManifest?: Manifest | null;
} = {}) {
  const cwd = await mkdtemp(resolve(tmpdir(), 'verify-csp-'));
  temporaryDirectories.push(cwd);

  for (const [target, manifest] of [
    ['chrome-mv3', chromeManifest],
    ['firefox-mv3', firefoxManifest],
  ] as const) {
    if (manifest === null) continue;
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
    const result = await runVerifier();
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ["connect-src\u00A0'none'", 'U+00A0'],
    ["connect-src\uFEFF 'none'", 'U+FEFF'],
    ["connect-src\u2000'none'", 'U+2000'],
    ["connect-src\u3000'none'", 'U+3000'],
    ["connect-src\u200B 'none'", 'U+200B'],
  ])('rejects non-ASCII policy text %s (%s)', async (replacement) => {
    const policy = validPolicy.replace("connect-src 'none'", replacement);
    const result = await runVerifier({
      chromeManifest: validManifest({
        content_security_policy: { extension_pages: policy },
      }),
    });
    expect(result.status, result.stderr).toBe(1);
  });

  it.each([
    ['sandbox policy', { sandbox: "sandbox allow-scripts; connect-src *" }],
    ['content scripts', { content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }] }],
    ['optional permissions', { optional_permissions: ['proxy'] }],
    ['externally connectable', { externally_connectable: { matches: ['https://example.com/*'] } }],
    [
      'web-accessible resources',
      {
        web_accessible_resources: [
          { resources: ['app.html'], matches: ['https://example.com/*'] },
        ],
      },
    ],
  ])('rejects %s', async (_label, addition) => {
    const manifest =
      'sandbox' in addition
        ? validManifest({
            content_security_policy: { extension_pages: validPolicy, ...addition },
          })
        : validManifest(addition);
    const result = await runVerifier({ chromeManifest: manifest });
    expect(result.status, result.stderr).toBe(1);
  });

  it.each([
    ['duplicate directive', `${validPolicy}; connect-src 'none'`],
    ['extra directive', `${validPolicy}; frame-src 'none'`],
    ['missing directive', validPolicy.replace("connect-src 'none'; ", '')],
    ['tampered default-src', validPolicy.replace("default-src 'none'", "default-src 'self'")],
    ['tampered form-action', validPolicy.replace("form-action 'none'", "form-action 'self'")],
    ['tampered base-uri', validPolicy.replace("base-uri 'none'", "base-uri 'self'")],
  ])('rejects a policy with a %s', async (_label, policy) => {
    const result = await runVerifier({
      chromeManifest: validManifest({
        content_security_policy: { extension_pages: policy },
      }),
    });
    expect(result.status, result.stderr).toBe(1);
  });

  it.each(['chrome', 'firefox'] as const)('rejects a missing %s manifest', async (target) => {
    const result = await runVerifier(
      target === 'chrome' ? { chromeManifest: null } : { firefoxManifest: null },
    );
    expect(result.status, result.stderr).toBe(1);
  });

  it('rejects divergent targets when only Firefox is unsafe', async () => {
    const firefoxPolicy = validPolicy.replace("connect-src 'none'", "connect-src *");
    const result = await runVerifier({
      firefoxManifest: validManifest({
        content_security_policy: { extension_pages: firefoxPolicy },
      }),
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('.output/firefox-mv3/manifest.json');
  });
});
