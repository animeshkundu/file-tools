# Security Policy

Unzip processes untrusted archives locally in the browser. Reports that help protect users and their local files are welcome.

## Report a vulnerability

Please use GitHub's private security advisory form to [report a vulnerability](https://github.com/animeshkundu/file-tools/security/advisories/new). Do not disclose a suspected vulnerability in a public issue before a coordinated fix is available.

Include the affected version, reproduction steps or a proof of concept, the expected and observed behavior, and the potential impact when possible. Please avoid including real user data.

## Machine-readable policy

A [`security.txt`](.well-known/security.txt) (RFC 9116) accompanies this policy. It is served on the project site at <https://animesh.kundus.in/file-tools/.well-known/security.txt> and points back to the private advisory form above.

## Scope

Security reports may include:

- The ZIP parsing and extraction path in `lib/tools/unzip/` and `lib/core/safety.ts`, including memory-exhaustion or memory-safety failures, Zip Slip and other path-traversal flaws, decompression bombs, and parser-differential issues.
- Regressions in the strict no-egress Content Security Policy or zero install-time permissions posture.
- Any behavior that could exfiltrate a user's local file data or execute code.

The following are generally out of scope:

- Issues that require an already-compromised browser or operating system.
- Self-XSS.
- Missing best-practice headers on the static marketing site without a demonstrated security impact.

## Supported versions

The latest release and the current `main` branch are supported. Older versions may not receive fixes.

## What to expect

We aim to acknowledge reports within a few days, assess their impact, and keep reporters informed as a fix is developed. Please allow time for coordinated disclosure before publishing details. Credit is available on request, unless anonymity is preferred.
