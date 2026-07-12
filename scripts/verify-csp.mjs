import { readFile } from 'node:fs/promises';
import process from 'node:process';

const MANIFEST_PATHS = ['.output/chrome-mv3/manifest.json', '.output/firefox-mv3/manifest.json'];

const ASCII_WHITESPACE = /[ \t\r\n\f]+/u;
const ALLOWED_ASCII_WHITESPACE = new Set([9, 10, 12, 13, 32]);
const NON_ASCII_WHITESPACE = new Set([
  0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);

const REQUIRED_DIRECTIVES = new Map([
  ['default-src', ["'none'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'"]],
  ['img-src', ["'self'", 'data:', 'blob:']],
  ['connect-src', ["'none'"]],
  ['form-action', ["'none'"]],
  ['base-uri', ["'none'"]],
  ['object-src', ["'none'"]],
]);

function parsePolicy(policy) {
  for (const character of policy) {
    const codePoint = character.codePointAt(0);
    const isControl = codePoint < 32 || (codePoint >= 127 && codePoint <= 159);
    const isNonAsciiWhitespace =
      NON_ASCII_WHITESPACE.has(codePoint) || (codePoint >= 0x2000 && codePoint <= 0x200a);

    if ((isControl && !ALLOWED_ASCII_WHITESPACE.has(codePoint)) || isNonAsciiWhitespace) {
      throw new Error('CSP contains a disallowed control or non-ASCII whitespace character');
    }
  }

  const directives = new Map();
  for (const segment of policy.split(';')) {
    const tokens = segment.split(ASCII_WHITESPACE).filter(Boolean);
    if (tokens.length === 0) continue;

    const [name, ...sources] = tokens;
    if (directives.has(name)) {
      throw new Error(`CSP contains duplicate directive ${name}`);
    }
    directives.set(name, sources);
  }

  return directives;
}

function assertExactArray(actual, expected, field) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new Error(`${field} must be ${JSON.stringify(expected)}`);
  }

  for (const [index, value] of expected.entries()) {
    if (actual[index] !== value) {
      throw new Error(`${field} must be ${JSON.stringify(expected)}`);
    }
  }
}

function verifyManifest(manifest, manifestPath) {
  if (manifest.manifest_version !== 3) {
    throw new Error(`${manifestPath}: manifest_version must be 3`);
  }

  assertExactArray(manifest.permissions, [], `${manifestPath}: permissions`);

  for (const field of ['host_permissions', 'optional_host_permissions']) {
    if (field in manifest) {
      assertExactArray(manifest[field], [], `${manifestPath}: ${field}`);
    }
  }

  if ('externally_connectable' in manifest) {
    throw new Error(`${manifestPath}: externally_connectable must be absent`);
  }

  if ('web_accessible_resources' in manifest) {
    assertExactArray(
      manifest.web_accessible_resources,
      [],
      `${manifestPath}: web_accessible_resources`,
    );
  }

  const policy = manifest.content_security_policy?.extension_pages;
  if (typeof policy !== 'string') {
    throw new Error(`${manifestPath}: content_security_policy.extension_pages must be a string`);
  }

  const directives = parsePolicy(policy);
  if (directives.size !== REQUIRED_DIRECTIVES.size) {
    throw new Error(`${manifestPath}: CSP must contain only the required directives`);
  }

  for (const [name, expectedSources] of REQUIRED_DIRECTIVES) {
    const actualSources = directives.get(name);
    if (actualSources === undefined) {
      throw new Error(`${manifestPath}: CSP is missing ${name}`);
    }
    assertExactArray(actualSources, expectedSources, `${manifestPath}: CSP ${name}`);
  }
}

let failed = false;

for (const manifestPath of MANIFEST_PATHS) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    verifyManifest(manifest, manifestPath);
    process.stdout.write(`Verified ${manifestPath}\n`);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`CSP verification failed: ${message}\n`);
  }
}

if (failed) process.exitCode = 1;
