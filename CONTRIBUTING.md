# Contributing to Unzip

Thank you for helping improve Unzip. Keep contributions focused, testable, and consistent with the product's privacy and safety contract.

## Prerequisites

- Node.js 22
- npm

Install dependencies from the repository root:

```sh
npm install
```

## Development

Run the development build for the browser you are testing:

```sh
npm run dev
npm run dev:firefox
```

Load the generated target directory under `.output/` as an unpacked extension in the corresponding browser.

Create production builds for both supported browser targets with:

```sh
npm run build
npm run build:firefox
```

## Required checks

Before opening a pull request, run:

```sh
npm run check
npm run test:e2e
```

`npm run check` runs TypeScript compilation, linting, and the Vitest suite. `npm run test:e2e` exercises the production extension in real Firefox. Both must pass.

Changes that affect browser behavior should also be exercised manually in the relevant production builds.

## Non-negotiable guardrails

Contributions must preserve:

- Offline, local processing with no upload of user files.
- A strict no-egress extension-page Content Security Policy.
- Zero install-time permissions for the core extension.
- Bounded-memory archive extraction, with limits enforced before allocation or emission exceeds them.
- Full path safety for every extracted entry, including rejection of traversal, absolute, drive-letter, UNC, backslash, control-character, symlink, and special-file paths.
- Use of `fflate` only within its standard-ZIP boundary.

Read the repository instructions in `CLAUDE.md` and the documents under [`docs/`](docs/) for the complete engineering, product, testing, and release contract before changing behavior.

## Commits and pull requests

- Keep each pull request small and focused on one concern.
- Add or update tests with behavior changes and regressions.
- Explain the user-visible effect, safety implications, and verification performed.
- Avoid unrelated formatting, refactors, dependency updates, or generated-file churn.
- Use concise commit messages that describe the change.
