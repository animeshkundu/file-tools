import { Buffer } from 'node:buffer';
import { execFile, execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Builder, By, until } from 'selenium-webdriver';
import { Context, Options as FirefoxOptions, ServiceBuilder } from 'selenium-webdriver/firefox.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXTENSION_DIR = path.join(REPO_ROOT, '.output/firefox-mv3');
const FIXTURE_ZIP = path.join(REPO_ROOT, 'tests/e2e/fixtures/sample.zip');
const MEDIA_DIR = path.join(REPO_ROOT, 'docs/media');
const SCREENSHOT_DIR = path.join(MEDIA_DIR, 'screenshots');
const STAGING_DIR = path.join(MEDIA_DIR, '.capture-staging');
const FRAME_DIR = path.join(STAGING_DIR, 'frames');
const INVALID_ZIP = path.join(STAGING_DIR, 'invalid.zip');
const GECKODRIVER_VERSION = '0.37.0';
const EXTENSION_ID = 'unzip@animesh.kundus.in';
const WIDTH = 1280;
const HEIGHT = 800;
const FRAME_RATE = 4;
const FRAME_HOLD_MS = 250;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function seleniumManagerPath() {
  const platform =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
  const executable = platform === 'windows' ? 'selenium-manager.exe' : 'selenium-manager';
  return path.join(REPO_ROOT, 'node_modules/selenium-webdriver/bin', platform, executable);
}

function provisionFirefox() {
  const manager = seleniumManagerPath();
  if (!existsSync(manager)) throw new Error(`Selenium Manager was not found at ${manager}`);

  const output = execFileSync(
    manager,
    ['--browser', 'firefox', '--driver-version', GECKODRIVER_VERSION, '--output', 'json'],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(output);
  const result = parsed?.result;
  if (!result?.driver_path || !result?.browser_path) {
    throw new Error(`Selenium Manager did not resolve both binaries: ${output}`);
  }
  if (!existsSync(result.driver_path) || !existsSync(result.browser_path)) {
    throw new Error('A Selenium Manager resolved binary does not exist on disk.');
  }
  return { geckodriver: result.driver_path, firefox: result.browser_path };
}

async function firefoxVersion(binary) {
  const { stdout, stderr } = await execFileAsync(binary, ['--version']);
  return `${stdout}${stderr}`.trim();
}

async function extensionUuid(driver) {
  await driver.setContext(Context.CHROME);
  try {
    const raw = await driver.executeScript(
      `return Services.prefs.getCharPref('extensions.webextensions.uuids');`,
    );
    const uuid = JSON.parse(raw)[EXTENSION_ID];
    if (!uuid) throw new Error(`No moz-extension UUID found for ${EXTENSION_ID}`);
    return uuid;
  } finally {
    await driver.setContext(Context.CONTENT);
  }
}

async function waitForText(driver, selector, expected, timeout = 30_000) {
  await driver.wait(until.elementLocated(By.css(selector)), timeout);
  await driver.wait(async () => {
    try {
      const elements = await driver.findElements(By.css(selector));
      for (const element of elements) {
        if ((await element.getText()).includes(expected)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }, timeout);
}

async function setViewport(driver) {
  await driver.manage().window().setRect({ width: WIDTH, height: HEIGHT, x: 0, y: 0 });
  const viewport = await driver.executeScript(
    'return { width: window.innerWidth, height: window.innerHeight };',
  );
  await driver
    .manage()
    .window()
    .setRect({
      width: WIDTH + (WIDTH - viewport.width),
      height: HEIGHT + (HEIGHT - viewport.height),
      x: 0,
      y: 0,
    });
  const adjusted = await driver.executeScript(
    'return { width: window.innerWidth, height: window.innerHeight };',
  );
  if (adjusted.width !== WIDTH || adjusted.height !== HEIGHT) {
    throw new Error(
      `Could not set Firefox viewport to ${WIDTH}x${HEIGHT}: ${JSON.stringify(adjusted)}`,
    );
  }
}

async function screenshot(driver, destination) {
  const png = Buffer.from(await driver.takeScreenshot(), 'base64');
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Firefox returned an invalid PNG for ${destination}`);
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(
      `Unexpected screenshot dimensions ${width}x${height}; expected ${WIDTH}x${HEIGHT}`,
    );
  }
  await writeFile(destination, png);
}

function framePath(number) {
  return path.join(FRAME_DIR, `frame-${String(number).padStart(4, '0')}.png`);
}

async function captureFrames(driver, start, count) {
  for (let index = 0; index < count; index += 1) {
    await screenshot(driver, framePath(start + index));
    await delay(FRAME_HOLD_MS);
  }
  return start + count;
}

async function encodeVideo(frameCount) {
  const output = path.join(STAGING_DIR, 'unzip-demo.webm');
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    String(FRAME_RATE),
    '-i',
    path.join(FRAME_DIR, 'frame-%04d.png'),
    '-frames:v',
    String(frameCount),
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '36',
    '-pix_fmt',
    'yuv420p',
    '-row-mt',
    '0',
    '-threads',
    '1',
    '-metadata',
    'title=File Tools real Firefox Unzip demo',
    output,
  ]);

  const probe = JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name,width,height,nb_frames:format=duration',
        '-of',
        'json',
        output,
      ],
      { encoding: 'utf8' },
    ),
  );
  const stream = probe.streams?.[0];
  if (stream?.codec_name !== 'vp9' || stream.width !== WIDTH || stream.height !== HEIGHT) {
    throw new Error(`Unexpected encoded video properties: ${JSON.stringify(probe)}`);
  }
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration < frameCount / FRAME_RATE - 0.1) {
    throw new Error(`Unexpected encoded video duration: ${JSON.stringify(probe)}`);
  }
  return output;
}

async function publish(staged, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.new`;
  await rm(temporary, { force: true });
  await rename(staged, temporary);
  await rename(temporary, destination);
}

async function main() {
  execSync('npm run build:firefox', { cwd: REPO_ROOT, stdio: 'inherit' });
  await rm(STAGING_DIR, { recursive: true, force: true });
  await mkdir(FRAME_DIR, { recursive: true });
  await writeFile(INVALID_ZIP, Buffer.from('This is deliberately not a ZIP archive.\n'));

  const binaries = provisionFirefox();
  const version = await firefoxVersion(binaries.firefox);
  process.stdout.write(`[capture] geckodriver ${GECKODRIVER_VERSION}: ${binaries.geckodriver}\n`);
  process.stdout.write(`[capture] Firefox: ${version}\n`);
  process.stdout.write(`[capture] Firefox binary: ${binaries.firefox}\n`);
  process.stdout.write(`[capture] Installing real extension: ${EXTENSION_DIR}\n`);

  const options = new FirefoxOptions()
    .addArguments('--headless')
    .addArguments('-remote-allow-system-access');
  options.setBinary(binaries.firefox);
  const driver = new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(new ServiceBuilder(binaries.geckodriver))
    .build();

  try {
    await driver.installAddon(EXTENSION_DIR, true);
    const uuid = await extensionUuid(driver);
    const appUrl = `moz-extension://${uuid}/app.html`;
    process.stdout.write(`[capture] moz-extension UUID: ${uuid}\n`);
    process.stdout.write(`[capture] Navigating: ${appUrl}\n`);

    await driver.get(appUrl);
    await setViewport(driver);
    await waitForText(driver, 'h1', 'Unzip, privately.');
    await waitForText(driver, '[role="button"]', 'Drop a ZIP file here');
    await screenshot(driver, path.join(STAGING_DIR, 'unzip-idle.png'));

    let nextFrame = 0;
    nextFrame = await captureFrames(driver, nextFrame, 8);
    const fileInput = await driver.findElement(By.css('input[type="file"]'));
    await fileInput.sendKeys(FIXTURE_ZIP);
    nextFrame = await captureFrames(driver, nextFrame, 8);

    await waitForText(driver, 'h2', 'Files ready to download');
    await waitForText(driver, '[aria-label="Extracted files"]', 'hello.txt');
    await waitForText(driver, '[aria-label="Extracted files"]', 'subdir/nested.txt');
    await screenshot(driver, path.join(STAGING_DIR, 'unzip-ready.png'));
    nextFrame = await captureFrames(driver, nextFrame, 12);

    const video = await encodeVideo(nextFrame);

    await driver.get(appUrl);
    await setViewport(driver);
    await waitForText(driver, 'h1', 'Unzip, privately.');
    const invalidInput = await driver.findElement(By.css('input[type="file"]'));
    await invalidInput.sendKeys(INVALID_ZIP);
    await waitForText(driver, 'h2', 'This archive could not be opened');
    const errorMessage = await driver.findElement(By.css('section p'));
    await driver.wait(async () => (await errorMessage.getText()).trim().length > 0, 15_000);
    await screenshot(driver, path.join(STAGING_DIR, 'unzip-error.png'));

    const artifacts = [
      [path.join(STAGING_DIR, 'unzip-idle.png'), path.join(SCREENSHOT_DIR, 'unzip-idle.png')],
      [path.join(STAGING_DIR, 'unzip-ready.png'), path.join(SCREENSHOT_DIR, 'unzip-ready.png')],
      [path.join(STAGING_DIR, 'unzip-error.png'), path.join(SCREENSHOT_DIR, 'unzip-error.png')],
      [video, path.join(MEDIA_DIR, 'unzip-demo.webm')],
    ];
    for (const [staged, destination] of artifacts) await publish(staged, destination);

    process.stdout.write(
      `[capture] Video frames: ${nextFrame} genuine Firefox screenshots at ${FRAME_RATE} fps\n`,
    );
    for (const [, destination] of artifacts) {
      const info = await stat(destination);
      process.stdout.write(
        `[capture] Wrote ${path.relative(REPO_ROOT, destination)} (${info.size} bytes)\n`,
      );
    }
  } finally {
    await driver.quit();
    await rm(STAGING_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
