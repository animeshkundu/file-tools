# Publishing File Tools

File Tools is prepared for a listed Firefox Add-ons submission and an optional Chrome Web Store submission. This repository is local-git only today. The workflows begin running after the repository is pushed to GitHub and the credentials are added under **Settings > Secrets and variables > Actions**.

## Release overview

A tag matching `v*` starts `.github/workflows/release.yml`. The workflow installs from the committed `package-lock.json` on Node 22, runs the compile, lint, and test checks, packages both browser builds, submits Firefox to AMO, optionally submits Chrome, and attaches every ZIP under `.output/` to a GitHub Release.

Use matching semantic versions in `package.json` and Git tags:

1. Set a new, increasing `N.N.N` version. AMO treats every upload as a new version and does not accept reuse of an existing version.
2. Commit and test the release.
3. Tag that commit as `vN.N.N`.
4. Push the commit and tag to GitHub.

For example:

```sh
git tag v0.2.0
git push origin main v0.2.0
```

## Firefox Add-ons account and credentials

1. Create or sign in to an AMO developer account at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
2. Open the API credentials page and generate a JWT issuer and JWT secret.
3. Create the add-on in AMO as a listed add-on, then retain its AMO extension ID.
4. Add these repository Actions secrets:

| GitHub secret | Value |
| --- | --- |
| `FIREFOX_EXTENSION_ID` | The extension ID assigned or recognized by AMO |
| `FIREFOX_JWT_ISSUER` | The AMO API JWT issuer |
| `FIREFOX_JWT_SECRET` | The AMO API JWT secret |

The release workflow uses the current WXT submission interface:

```sh
npx wxt submit \
  --firefox-zip ".output/<extension>-<version>-firefox.zip" \
  --firefox-sources-zip ".output/<extension>-<version>-sources.zip" \
  --firefox-channel listed
```

Run `npx wxt submit --dry-run` with the same archive flags when testing credentials manually. Never commit API credentials or place them in release artifacts.

## Listed versus self-distributed

A **listed** add-on is published on addons.mozilla.org so people can discover and install it there. A **self-distributed** add-on is submitted to Mozilla for signing, then hosted and distributed by its publisher.

This project uses the listed path. The workflow submits the package to AMO, but the AMO listing metadata and reviewer communication remain in the developer dashboard.

## Source-code submission

AMO reviewers require human-readable source when shipped code has been bundled, minified, or otherwise transformed. They use the source and build instructions to reproduce the submitted extension and compare the result. Obfuscated code is not permitted.

`npm run zip:firefox` runs `wxt zip -b firefox`. WXT produces both the Firefox extension ZIP and a matching `*-sources.zip` under `.output/`. The workflow passes both to `wxt submit`, using `--firefox-zip` and `--firefox-sources-zip`.

Keep the build reproducible:

- Keep `package-lock.json` committed and use `npm ci`.
- Build with Node 22, matching the release workflow.
- Pin build tooling through the lockfile.
- Keep all source, configuration, and build instructions needed to reproduce the package in the repository.
- Check the generated sources ZIP before submission. It must contain the human-readable source and the files a reviewer needs to run the build.

If AMO requests extra build notes, provide the operating system, Node and npm versions, dependency installation command, and exact package command. A concise reproduction sequence is `npm ci` followed by `npm run zip:firefox`.

## Review and listing preparation

AMO runs automated validation when a package is submitted. Listed extensions can also receive human review. Review may take from hours to a few days, but timing varies with queue length and the questions raised by a submission. Watch the AMO developer dashboard and account email for requests.

The manifest already declares:

- Manifest V3.
- Zero optional or required extension permissions.
- `browser_specific_settings.gecko.id` as `unzip@animesh.kundus.in`.
- `browser_specific_settings.gecko.data_collection_permissions.required` as `['none']`, which declares that the extension does not collect data.

The Gecko ID is the owned, email-style identifier `unzip@animesh.kundus.in`. Keep it stable after release because Firefox uses it as the extension identity.

Prepare these listing assets and fields before submission:

- Icons at 16, 32, 48, 96, and 128 pixels. The current icons are under `public/icon/`.
- Screenshots made from the real UI or approved mocks.
- The name **File Tools**.
- A concise summary and a fuller description of the offline ZIP workflow.
- Appropriate categories.
- Privacy policy copy stating: **No data is collected. Nothing leaves your device.**
- A working support URL.

## Chrome Web Store

Chrome publishing is optional. The `Publish to Chrome Web Store` step runs only when the repository Actions variable `PUBLISH_CHROME` is exactly `true`.

A Chrome Web Store developer account requires a one-time registration fee. Enable the Chrome Web Store API in a Google Cloud project, create OAuth credentials, and obtain a refresh token for the publisher account. Add these repository Actions secrets:

| GitHub secret | Value |
| --- | --- |
| `CHROME_EXTENSION_ID` | The Chrome Web Store item ID |
| `CHROME_CLIENT_ID` | The Google OAuth client ID |
| `CHROME_CLIENT_SECRET` | The Google OAuth client secret |
| `CHROME_REFRESH_TOKEN` | The publisher OAuth refresh token |

Chrome review expects a clear single purpose and compliance with the prohibition on remotely hosted executable code. Complete the store listing and privacy disclosures before enabling the job. The opt-in step submits the Chrome archive with:

```sh
npx wxt submit --chrome-zip ".output/<extension>-<version>-chrome.zip"
```

## Verified references

The WXT commands, archive flags, ZIP behavior, and credential environment variable names above were verified against the live [WXT publishing guide](https://wxt.dev/guide/essentials/publishing). The guide documents `wxt zip -b firefox`, the generated Firefox sources archive, `--firefox-zip`, `--firefox-sources-zip`, `--chrome-zip`, and the Firefox and Chrome environment variables used by the workflow.

Additional primary references:

- [Mozilla, Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Mozilla, Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Chrome Web Store API setup](https://developer.chrome.com/docs/webstore/using-api)
