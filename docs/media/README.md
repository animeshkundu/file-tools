# Real Firefox media capture

Regenerate the committed Unzip screenshots and demo video with:

```sh
npm run capture
```

The capture script builds the `firefox-mv3` target, installs that unpacked build into a real Firefox session through geckodriver and Marionette, resolves its runtime `moz-extension://` UUID, and captures the rendered extension page at 1280×800. The WebM is assembled with `ffmpeg` from a timed sequence of screenshots taken from that same Firefox session.

Requirements are the repository's installed dependencies plus `ffmpeg` and `ffprobe` on `PATH`. Selenium Manager provisions the pinned geckodriver and resolves Firefox. The script logs the exact binaries, Firefox version, UUID, frame count, and generated file sizes for each run.

Generated artifacts:

- `screenshots/unzip-idle.png`: initial dropzone.
- `screenshots/unzip-ready.png`: extracted fixture with its file tree and summary.
- `screenshots/unzip-error.png`: corrupt-archive error state.
- `unzip-demo.webm`: empty-to-ready core flow.

The tiny two-entry fixture does not expose the extracting state long enough for deterministic WebDriver capture, so the pipeline does not claim or fabricate an extracting-state still. The video uses only genuine Firefox screenshots and may hold adjacent observable states for readability.
