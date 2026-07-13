import { readFile } from 'node:fs/promises';
import process from 'node:process';

const MANIFEST_PATHS = ['.output/chrome-mv3/manifest.json', '.output/firefox-mv3/manifest.json'];

const ALLOWED_ASCII_WHITESPACE = new Set([9, 10, 12, 13, 32]);
// Serialized CSP here is limited to ASCII whitespace separators plus directive/source
// tokens built from RFC 7230 tchar-style bytes and URL punctuation used by CSP source
// expressions, with `;` as the directive delimiter.
const ALLOWED_CSP_GRAMMAR_CHARACTERS = new Set(
  [...";ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&'*+-.^_`|~:/?[]=@"].map(
    (character) => character.charCodeAt(0),
  ),
);

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
  const directives = new Map();
  let tokens = [];
  let currentToken = '';

  const flushToken = () => {
    if (currentToken.length === 0) {
      return;
    }

    tokens.push(currentToken);
    currentToken = '';
  };

  const flushDirective = () => {
    flushToken();
    if (tokens.length === 0) {
      return;
    }

    const [name, ...sources] = tokens;
    if (directives.has(name)) {
      throw new Error(`CSP contains duplicate directive ${name}`);
    }

    directives.set(name, sources);
    tokens = [];
  };

  for (const character of policy) {
    const codePoint = character.codePointAt(0);
    if (character === ';') {
      flushDirective();
      continue;
    }

    if (ALLOWED_ASCII_WHITESPACE.has(codePoint)) {
      flushToken();
      continue;
    }

    const isAsciiControl = codePoint < 32 || codePoint === 127;

    if (isAsciiControl && !ALLOWED_ASCII_WHITESPACE.has(codePoint)) {
      throw new Error('CSP contains a disallowed ASCII control character');
    }

    if (!ALLOWED_CSP_GRAMMAR_CHARACTERS.has(codePoint)) {
      throw new Error('CSP contains a disallowed character outside the ASCII token allowlist');
    }

    currentToken += character;
  }

  flushDirective();
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

  for (const field of [
    'host_permissions',
    'optional_host_permissions',
    'optional_permissions',
    'content_scripts',
  ]) {
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

  const contentSecurityPolicy = manifest.content_security_policy;
  if (
    typeof contentSecurityPolicy !== 'object' ||
    contentSecurityPolicy === null ||
    Array.isArray(contentSecurityPolicy)
  ) {
    throw new Error(`${manifestPath}: content_security_policy must be an object`);
  }
  assertExactArray(
    Object.keys(contentSecurityPolicy),
    ['extension_pages'],
    `${manifestPath}: content_security_policy keys`,
  );

  const policy = contentSecurityPolicy.extension_pages;
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
