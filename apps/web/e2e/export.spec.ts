import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { openApp, showFrame } from './editor/helpers';

// The 1080p MP4 goes to this test's output directory (test-results/, ignored)
// unless WAYCINE_E2E_EXPORT_OUT names a file (resolved against the working
// directory), for example to inspect it with ffprobe.
const EXPORT_TIMEOUT_MS = 180_000;
const SLUG = 'waycine-race-season-demo';
const TOTAL_FRAMES = 440;
const FPS = 30000 / 1001;
const DURATION_SEC = (TOTAL_FRAMES * 1001) / 30000;

// The exports run one at a time, after the smoke specs (the `export` project in
// playwright.config.ts depends on `smoke`), so the recorded export time means something.
test.describe.configure({ mode: 'serial' });

// Reduced motion turns off autoplay, so the preview does not compete with the export.
test.use({ reducedMotion: 'reduce' });

/** Collects console errors and page errors; also the readback-performance warnings. */
function watchConsole(page: Page): { errors: string[]; readbackWarnings: string[] } {
  const errors: string[] = [];
  const readbackWarnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
    if (msg.text().includes('willReadFrequently')) {
      readbackWarnings.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });
  return { errors, readbackWarnings };
}

/** Opens the export dialog and waits until it knows what the browser can encode. */
async function openDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Export video' }).first().click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Export video' })).toBeVisible();
  await expect(dialog.getByText('Checking what this browser can encode…')).toHaveCount(0, {
    timeout: 30_000,
  });
  return dialog;
}

function sizeRadio(dialog: Locator, shortSide: number): Locator {
  const label = shortSide === 2160 ? '4K' : `${shortSide}p`;
  return dialog.getByRole('radio', { name: new RegExp(`^${label}\\b`) });
}

/** The dialog's main button (the header's "Export video" is behind the modal). */
function exportButton(dialog: Locator): Locator {
  return dialog.getByRole('button', { name: 'Export video', exact: true });
}

async function readVideo(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (track === null) {
    throw new Error('No video track in the exported file.');
  }
  return {
    format: (await input.getFormat()).name,
    codec: await track.getCodec(),
    codecString: (await track.getCodecParameterString()) ?? '',
    width: await track.getDisplayWidth(),
    height: await track.getDisplayHeight(),
    timeResolution: await track.getTimeResolution(),
    stats: await track.computePacketStats(),
    duration: await track.computeDuration(),
    colorSpace: await track.getColorSpace(),
  };
}

/** Width and height from a PNG's IHDR chunk, after checking the signature. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(Buffer.from(bytes.subarray(12, 16)).toString('latin1')).toBe('IHDR');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('exports the season at 1080p from the dialog, in a worker', async ({ page }) => {
  test.setTimeout(EXPORT_TIMEOUT_MS + 60_000);
  const { errors, readbackWarnings } = watchConsole(page);
  await openApp(page);
  const dialog = await openDialog(page);

  await expect(sizeRadio(dialog, 1080)).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /^High/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /^One video/ })).toBeChecked();
  // The summary names the file format in plain words; "Technical details" holds the real
  // codec string of a test encode at this size.
  const summary = dialog.locator('.export-summary');
  await expect(summary).toHaveText(
    /^Landscape 16:9 · 1920 × 1080 · 29\.97 fps · 0:14\.7 · about 23 MB · MP4 \(H\.264\)$/,
  );
  const tech = dialog.locator('.export-codec');
  await expect(tech).toHaveText(/^Codec avc1\.[0-9a-f]{6}, from a test encode at this size\.$/);
  const plannedCodec = /avc1\.[0-9a-f]{6}/.exec((await tech.textContent()) ?? '')?.[0] ?? '';

  const downloadEvent = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  const started = performance.now();
  await exportButton(dialog).click();
  await expect(dialog.getByText(/^Frame \d+ of 440/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog.getByText('Keep this tab open.', { exact: false })).toBeVisible();
  // The live thumbnail and the cancel button are there while it renders.
  await expect(dialog.getByRole('img', { name: 'The frame being exported' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  // Escape does not close the dialog during an export.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  const download = await downloadEvent;
  const exportSec = (performance.now() - started) / 1000;
  const factor = DURATION_SEC / exportSec;
  test.info().annotations.push({ type: 'export-seconds', description: exportSec.toFixed(2) });
  test.info().annotations.push({ type: 'realtime-factor', description: factor.toFixed(2) });
  console.log(
    `worker export 1080p: ${exportSec.toFixed(2)} s for ${TOTAL_FRAMES} frames (click to download), ${factor.toFixed(2)}x real time`,
  );
  expect(download.suggestedFilename()).toBe(`${SLUG}-16x9-1080p.mp4`);

  const outFile = process.env.WAYCINE_E2E_EXPORT_OUT
    ? path.resolve(process.env.WAYCINE_E2E_EXPORT_OUT)
    : test.info().outputPath('season-1080p.mp4');
  await mkdir(path.dirname(outFile), { recursive: true });
  await download.saveAs(outFile);
  const bytes = await readFile(outFile);
  expect(bytes.length).toBeGreaterThan(100_000);
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');

  const video = await readVideo(bytes);
  expect(video.codec).toBe('avc');
  // Any H.264 profile: Linux Chrome's software encoder may report another one than Edge on Windows.
  expect(video.codecString.startsWith('avc1.')).toBe(true);
  expect(video.codecString).toBe(plannedCodec);
  expect(video.width).toBe(1920);
  expect(video.height).toBe(1080);
  expect(video.timeResolution).toBe(30000);
  expect(video.stats.packetCount).toBe(TOTAL_FRAMES);
  expect(video.stats.averagePacketRate).toBeCloseTo(FPS, 9);
  expect(video.duration).toBeCloseTo(DURATION_SEC, 6);
  expect(video.colorSpace).toMatchObject({
    primaries: 'bt709',
    transfer: 'bt709',
    matrix: 'bt709',
    fullRange: false,
  });

  // Done: rendered in the worker; size, codec, speed; download again; play it.
  const done = dialog.locator('.export-done');
  await expect(done).toHaveAttribute('data-thread', 'worker');
  await expect(done.locator('.x-done-file')).toContainText(`${SLUG}-16x9-1080p.mp4 · `);
  await expect(done.getByText('MP4 (H.264) · 1920 × 1080', { exact: true })).toBeVisible();
  // The codec string and the speed sit under "Technical details".
  const doneTech = done.locator('.export-codec');
  await expect(doneTech).toHaveText(
    /^Codec avc1\.[0-9a-f]{6} · made in [0-9.]+ s \([0-9.]+× real time\)$/,
  );
  expect(await doneTech.textContent()).toContain(`Codec ${video.codecString} · `);
  const madeIn = (await doneTech.textContent()) ?? '';
  console.log(`dialog: ${madeIn}`);
  await expect(dialog.getByRole('link', { name: 'Download again' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Play it' }).click();
  const player = dialog.getByLabel('Your exported video');
  await expect
    .poll(() => player.evaluate((el) => (el as HTMLVideoElement).videoWidth), { timeout: 10_000 })
    .toBe(1920);

  // Closing returns to the page; opening again starts from the settings.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const again = await openDialog(page);
  await expect(exportButton(again)).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  expect(errors).toEqual([]);
  // Post-processing never reads the frame canvas back with getImageData.
  expect(readbackWarnings).toEqual([]);
});

test('exports separate clips as a zip of 9 MP4s', async ({ page }) => {
  test.setTimeout(EXPORT_TIMEOUT_MS);
  const { errors } = watchConsole(page);
  await openApp(page);
  const dialog = await openDialog(page);
  await sizeRadio(dialog, 720).check();
  await dialog.getByRole('radio', { name: /^Separate clips/ }).check();
  await expect(dialog.getByText('A ZIP with 9 MP4 files, one per segment')).toBeVisible();

  const downloadEvent = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  await exportButton(dialog).click();
  await expect(dialog.getByText(/^Clip \d of 9$/)).toBeVisible({ timeout: 60_000 });
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${SLUG}-16x9-720p.zip`);
  const zipFile = test.info().outputPath('clips-720p.zip');
  await download.saveAs(zipFile);
  const files = unzipSync(new Uint8Array(await readFile(zipFile)));
  const names = Object.keys(files);
  expect(names).toEqual([
    '01-overview.mp4',
    '02-stop-01-chicago.mp4',
    '03-stop-02-milwaukee.mp4',
    '04-stop-03-grand-rapids.mp4',
    '05-stop-04-detroit.mp4',
    '06-stop-05-toledo.mp4',
    '07-stop-06-cleveland.mp4',
    '08-stop-07-buffalo.mp4',
    '09-finale.mp4',
  ]);
  const counts: number[] = [];
  for (const name of names) {
    const data = files[name];
    if (!data) {
      throw new Error(`missing ${name}`);
    }
    expect(Buffer.from(data.subarray(4, 8)).toString('latin1')).toBe('ftyp');
    const clip = await readVideo(data);
    expect(clip.codec).toBe('avc');
    expect(clip.width).toBe(1280);
    expect(clip.height).toBe(720);
    counts.push(clip.stats.packetCount);
  }
  // Segments mode: the overview, seven stops and the finale, 440 frames in all.
  expect(counts).toEqual([80, 40, 40, 40, 40, 40, 40, 40, 80]);
  await expect(dialog.getByText('Your clips are ready')).toBeVisible();
  expect(errors).toEqual([]);
});

test('cancels an export and can export again', async ({ page }) => {
  test.setTimeout(EXPORT_TIMEOUT_MS + 60_000);
  const { errors } = watchConsole(page);
  await openApp(page);
  const dialog = await openDialog(page);
  await sizeRadio(dialog, 720).check();

  await exportButton(dialog).click();
  await expect(dialog.getByText(/^Frame \d+ of 440/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel export' }).click();
  await expect(dialog.getByText(/^Stopped at \d+ %\. Nothing was saved\.$/)).toBeVisible({
    timeout: 5_000,
  });
  // The spec table keeps the choices, read-only.
  await expect(dialog.locator('.x-spec')).toContainText('1280 × 720');

  const downloadEvent = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  await dialog.getByRole('button', { name: 'Start again' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${SLUG}-16x9-720p.mp4`);
  const outFile = test.info().outputPath('after-cancel-720p.mp4');
  await download.saveAs(outFile);
  const video = await readVideo(await readFile(outFile));
  expect(video.width).toBe(1280);
  expect(video.height).toBe(720);
  expect(video.stats.packetCount).toBe(TOTAL_FRAMES);
  await expect(dialog.getByRole('link', { name: 'Download again' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('saves the current frame as a PNG at the chosen size', async ({ page }) => {
  test.setTimeout(60_000);
  const { errors } = watchConsole(page);
  await openApp(page);
  // End moves the player to the last frame (439).
  await page.locator('body').press('End');
  const dialog = await openDialog(page);

  const downloadEvent = page.waitForEvent('download', { timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Save frame as PNG' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${SLUG}-16x9-1080p-frame-0439.png`);
  const file = test.info().outputPath('still.png');
  await download.saveAs(file);
  expect(pngSize(new Uint8Array(await readFile(file)))).toEqual({ width: 1920, height: 1080 });
  await expect(
    dialog.getByText(`Saved frame 439 as ${SLUG}-16x9-1080p-frame-0439.png.`),
  ).toBeVisible();

  // At another size the still follows the chosen size.
  await sizeRadio(dialog, 720).check();
  const smallEvent = page.waitForEvent('download', { timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Save frame as PNG' }).click();
  const small = await smallEvent;
  expect(small.suggestedFilename()).toBe(`${SLUG}-16x9-720p-frame-0439.png`);
  const smallFile = test.info().outputPath('still-720p.png');
  await small.saveAs(smallFile);
  expect(pngSize(new Uint8Array(await readFile(smallFile)))).toEqual({
    width: 1280,
    height: 720,
  });
  expect(errors).toEqual([]);
});

test('disables sizes the encoder refuses and suggests the largest that works', async ({ page }) => {
  test.setTimeout(60_000);
  // H.264 only up to 1280 px wide: 1080p and larger fail the probe.
  await page.addInitScript(() => {
    const original = VideoEncoder.isConfigSupported.bind(VideoEncoder);
    VideoEncoder.isConfigSupported = async (config: VideoEncoderConfig) =>
      config.codec.startsWith('avc1') && config.width > 1280
        ? { supported: false, config }
        : original(config);
  });
  await openApp(page);
  const dialog = await openDialog(page);
  await expect(
    dialog.getByText(
      'This browser cannot make a 1080p H.264 video. 720p is the largest size it can encode, so it is selected.',
    ),
  ).toBeVisible();
  await expect(sizeRadio(dialog, 720)).toBeChecked();
  for (const short of [1080, 1440, 2160]) {
    await expect(sizeRadio(dialog, short)).toBeDisabled();
  }
  await expect(dialog.getByText('This browser cannot encode H.264 at this size.')).toHaveCount(3);
  await expect(dialog.locator('.export-summary')).toHaveText(
    /^Landscape 16:9 · 1280 × 720 · 29\.97 fps · 0:14\.7 · about 10 MB · MP4 \(H\.264\)$/,
  );
  await expect(dialog.locator('.export-codec')).toHaveText(/^Codec avc1\./);
  await expect(dialog.getByRole('switch', { name: /^Extra smooth/ })).toBeEnabled();
});

test('falls back to VP9 in WebM when H.264 is unavailable', async ({ page }) => {
  test.setTimeout(EXPORT_TIMEOUT_MS);
  const { errors } = watchConsole(page);
  await page.addInitScript(() => {
    const original = VideoEncoder.isConfigSupported.bind(VideoEncoder);
    VideoEncoder.isConfigSupported = async (config: VideoEncoderConfig) =>
      config.codec.startsWith('avc1') ? { supported: false, config } : original(config);
  });
  await openApp(page);
  const dialog = await openDialog(page);
  await expect(dialog.getByText(/so your video will be a WebM file \(VP9\)/)).toBeVisible();
  await sizeRadio(dialog, 720).check();
  await expect(dialog.locator('.export-summary')).toHaveText(/ · WebM \(VP9\)$/);
  await expect(dialog.locator('.export-codec')).toHaveText(/^Codec vp09\.[0-9.]+, /);

  const downloadEvent = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  await exportButton(dialog).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${SLUG}-16x9-720p.webm`);
  const outFile = test.info().outputPath('season-720p.webm');
  await download.saveAs(outFile);
  const video = await readVideo(await readFile(outFile));
  expect(video.format).toBe('WebM');
  expect(video.codec).toBe('vp9');
  expect(video.width).toBe(1280);
  expect(video.height).toBe(720);
  expect(video.stats.packetCount).toBe(TOTAL_FRAMES);
  expect(video.duration).toBeCloseTo(DURATION_SEC, 2);
  expect(errors).toEqual([]);
});

test('records in real time when the browser has no WebCodecs encoder', async ({ page }) => {
  test.setTimeout(EXPORT_TIMEOUT_MS);
  const { errors } = watchConsole(page);
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'VideoEncoder');
  });
  await openApp(page);
  const dialog = await openDialog(page);
  await expect(
    dialog.getByText(/recorded while it plays in real time\. It may drop frames/),
  ).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /^Separate clips/ })).toBeDisabled();
  await expect(dialog.getByRole('switch', { name: /^Extra smooth/ })).toBeDisabled();
  await sizeRadio(dialog, 720).check();

  const downloadEvent = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  const started = performance.now();
  await exportButton(dialog).click();
  await expect(dialog.getByText('Recording in real time')).toBeVisible();
  const download = await downloadEvent;
  const seconds = (performance.now() - started) / 1000;
  // Real time: at least the video's own length.
  expect(seconds).toBeGreaterThan(DURATION_SEC - 0.5);
  const name = download.suggestedFilename();
  expect(name).toMatch(new RegExp(`^${SLUG}-16x9-720p\\.(mp4|webm)$`));
  const outFile = test.info().outputPath(name);
  await download.saveAs(outFile);
  const video = await readVideo(await readFile(outFile));
  expect(video.width).toBe(1280);
  expect(video.height).toBe(720);
  // MediaRecorder follows the wall clock: about the right length; frames may be dropped.
  expect(video.duration).toBeGreaterThan(DURATION_SEC - 1.5);
  expect(video.duration).toBeLessThan(DURATION_SEC + 1.5);
  expect(video.stats.packetCount).toBeGreaterThan(TOTAL_FRAMES / 2);
  expect(errors).toEqual([]);
});

test('reports an encoder failure with the frame and retries at 720p', async ({ page }) => {
  test.setTimeout(EXPORT_TIMEOUT_MS);
  // A main-thread export (no OffscreenCanvas, so no worker) whose encoder
  // fails once, on its 100th frame; the retry then works.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'OffscreenCanvas');
    const encode = VideoEncoder.prototype.encode;
    let calls = 0;
    VideoEncoder.prototype.encode = function (
      this: VideoEncoder,
      ...args: Parameters<VideoEncoder['encode']>
    ) {
      calls += 1;
      if (calls === 100) {
        throw new Error('Simulated encoder failure');
      }
      return encode.apply(this, args);
    };
  });
  await openApp(page);
  const dialog = await openDialog(page);
  await exportButton(dialog).click();
  await expect(dialog.getByText(/^Encoder failed at frame \d+\.$/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog.getByRole('heading', { name: 'Export failed' })).toBeVisible();
  await dialog.getByText('Technical details').click();
  await expect(dialog.getByText(/Simulated encoder failure/)).toBeVisible();

  const downloadEvent = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  await dialog.getByRole('button', { name: 'Retry at 720p' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${SLUG}-16x9-720p.mp4`);
  await expect(dialog.locator('.export-done')).toHaveAttribute('data-thread', 'main');
});

test('Dip to dark: the exported frame at the cut is the background colour', async ({ page }) => {
  test.setTimeout(60_000);
  const { errors } = watchConsole(page);
  await openApp(page);
  await page
    .getByRole('radiogroup', { name: 'Transition between stops' })
    .getByRole('radio', { name: /^Dip to dark/ })
    .click();
  // Frame 119 is the last frame before the first cut between two stops: the dip at its deepest.
  await showFrame(page, 119);
  const dialog = await openDialog(page);
  await sizeRadio(dialog, 720).check();
  const downloadEvent = page.waitForEvent('download', { timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Save frame as PNG' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${SLUG}-16x9-720p-frame-0119.png`);
  const file = test.info().outputPath('dip-119.png');
  await download.saveAs(file);
  const base64 = (await readFile(file)).toString('base64');
  const centre = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(image, 0, 0);
    const [r, g, b] = ctx.getImageData(image.width >> 1, image.height >> 1, 1, 1).data;
    return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }, base64);
  expect(centre).toBe('#07070B');
  expect(errors).toEqual([]);
});
