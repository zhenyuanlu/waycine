import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { validateProject } from 'waycine/node';
import { partialPath, segmentFileName } from '../src/commands/render.js';
import { encoderArgs, findFfmpeg, searchPath, VIDEO_FILTER } from '../src/ffmpeg.js';
import {
  downsample2x,
  effectiveSupersample,
  FrameRenderer,
  releaseFrameMemory,
} from '../src/render.js';
import { pngSize, run, SEASON, SINGLE_STOP, scratchDir } from './helpers.js';

const scratch = scratchDir('render');
afterAll(() => scratch.cleanup());

/** ffmpeg on this machine (WAYCINE_FFMPEG or PATH), or undefined: encode tests are skipped. */
function localFfmpeg(): string | undefined {
  try {
    return findFfmpeg({ env: process.env, cwd: process.cwd() });
  } catch {
    return undefined;
  }
}

/** ffprobe next to ffmpeg, else on PATH. */
function localFfprobe(ffmpeg: string): string | undefined {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const sibling = join(dirname(ffmpeg), `ffprobe${ext}`);
  return existsSync(sibling) ? sibling : searchPath('ffprobe', process.env);
}

const ffmpeg = localFfmpeg();
const ffprobe = ffmpeg === undefined ? undefined : localFfprobe(ffmpeg);

describe('waycine still', () => {
  it('writes a 1920x1080 PNG of the season at its output size', async () => {
    const out = join(scratch.dir, 'f220.png');
    const r = await run(['still', SEASON, '--frame', '220', '-o', out, '--quiet']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
    expect(pngSize(out)).toEqual({ width: 1920, height: 1080 });
  });

  it('follows --size, --aspect and --short', async () => {
    const a = join(scratch.dir, 'small.png');
    expect((await run(['still', SEASON, '--frame', '0', '-o', a, '--size', '640x360'])).code).toBe(
      0,
    );
    expect(pngSize(a)).toEqual({ width: 640, height: 360 });
    const b = join(scratch.dir, 'square.png');
    const r = await run([
      'still',
      SEASON,
      '--frame',
      '5',
      '-o',
      b,
      '--aspect',
      '1:1',
      '--short',
      '720',
    ]);
    expect(r.code, r.stderr).toBe(0);
    expect(pngSize(b)).toEqual({ width: 720, height: 720 });
  });

  it('rejects a frame past the end', async () => {
    const r = await run(['still', SEASON, '--frame', '440', '-o', join(scratch.dir, 'x.png')]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('between 0 and 439');
  });
});

describe('waycine render --frames-dir', () => {
  it('writes one PNG per frame of --from..--to (inclusive), without ffmpeg', async () => {
    const dir = join(scratch.dir, 'frames');
    const r = await run(
      ['render', SEASON, '--frames-dir', dir, '--from', '230', '--to', '239', '--short', '720'],
      { env: { PATH: '' } },
    );
    expect(r.code, r.stderr).toBe(0);
    const files = readdirSync(dir).sort();
    expect(files).toEqual(
      Array.from({ length: 10 }, (_, i) => `frame-${String(230 + i).padStart(5, '0')}.png`),
    );
    expect(pngSize(join(dir, files[0] ?? ''))).toEqual({ width: 1280, height: 720 });
  });

  it('supersamples with --ss 2 at the output size', async () => {
    const dir = join(scratch.dir, 'ss2');
    const r = await run([
      'render',
      SEASON,
      '--frames-dir',
      dir,
      '--from',
      '40',
      '--to',
      '40',
      '--size',
      '640x360',
      '--ss',
      '2',
    ]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toContain('supersampled 2x');
    expect(pngSize(join(dir, 'frame-00040.png'))).toEqual({ width: 640, height: 360 });
  });

  it('rejects --to before --from', async () => {
    const r = await run([
      'render',
      SEASON,
      '--frames-dir',
      scratch.dir,
      '--from',
      '9',
      '--to',
      '3',
    ]);
    expect(r.code).toBe(2);
  });
});

describe('ffmpeg lookup and arguments', () => {
  it('reports a missing ffmpeg clearly (exit 1, before rendering)', async () => {
    const r = await run(['render', SEASON, '-o', join(scratch.dir, 'none.mp4')], {
      env: { PATH: '' },
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ffmpeg was not found on PATH');
    expect(r.stderr).toContain('--frames-dir');
    const bad = await run(['render', SEASON, '-o', join(scratch.dir, 'none.mp4')], {
      env: { PATH: '', WAYCINE_FFMPEG: join(scratch.dir, 'no-ffmpeg-here') },
    });
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('from WAYCINE_FFMPEG');
  });

  it('reports an encoder that fails, keeps an existing output and leaves no partial file', async () => {
    const dir = join(scratch.dir, 'failed');
    mkdirSync(dir, { recursive: true });
    const out = join(dir, 'failed.mp4');
    const before = Buffer.from('an earlier video that must survive');
    writeFileSync(out, before);
    // Node stands in for a broken ffmpeg: it rejects the ffmpeg options and exits.
    const r = await run(['render', SEASON, '-o', out, '--ffmpeg', process.execPath, '--quiet']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ffmpeg stopped unexpectedly');
    expect(readFileSync(out)).toEqual(before);
    expect(readdirSync(dir)).toEqual(['failed.mp4']);
  });

  it('encodes to a hidden sibling before renaming over the output', () => {
    expect(partialPath(join('clips', 'trip.mp4'), 42)).toBe(join('clips', '.trip.partial-42.mp4'));
    expect(partialPath(join('out', 'trip.mov'), 7)).toBe(join('out', '.trip.partial-7.mov'));
    expect(partialPath('trip', 7)).toBe('.trip.partial-7.mp4');
  });

  it('on Windows prefers ffmpeg.exe over an extensionless shim and never picks .cmd', () => {
    const bin = join(scratch.dir, 'bin');
    const here = join(scratch.dir, 'project');
    mkdirSync(bin, { recursive: true });
    mkdirSync(here, { recursive: true });
    for (const name of ['ffmpeg', 'ffmpeg.exe', 'ffmpeg.cmd']) writeFileSync(join(bin, name), '');
    writeFileSync(join(here, 'ffmpeg.exe'), '');
    const env = { PATH: bin };
    expect(findFfmpeg({ env, cwd: here, platform: 'win32' })).toBe(join(bin, 'ffmpeg.exe'));
    // A bare name is looked up on PATH only, never in the working directory.
    expect(findFfmpeg({ flag: 'ffmpeg', env, cwd: here, platform: 'win32' })).toBe(
      join(bin, 'ffmpeg.exe'),
    );
    expect(() =>
      findFfmpeg({ flag: 'ffmpeg', env: { PATH: '' }, cwd: here, platform: 'win32' }),
    ).toThrow(/ffmpeg not found at ffmpeg/);
    // A value with a slash is a path, relative to the working directory.
    expect(findFfmpeg({ flag: './ffmpeg', env: { PATH: '' }, cwd: here, platform: 'win32' })).toBe(
      join(here, 'ffmpeg.exe'),
    );
    // Only .cmd there: not runnable without a shell, so not found.
    const cmdOnly = join(scratch.dir, 'cmd-only');
    mkdirSync(cmdOnly, { recursive: true });
    writeFileSync(join(cmdOnly, 'ffmpeg.cmd'), '');
    expect(searchPath('ffmpeg', { PATH: cmdOnly }, 'win32')).toBeUndefined();
    // Elsewhere the name is used as given.
    expect(searchPath('ffmpeg', { PATH: bin }, 'linux')).toBe(join(bin, 'ffmpeg'));
  });

  it('prefers --ffmpeg over WAYCINE_FFMPEG over PATH', () => {
    const self = process.execPath;
    const env = { PATH: dirname(self), WAYCINE_FFMPEG: self };
    expect(findFfmpeg({ flag: self, env: { PATH: '' }, cwd: '.' })).toBe(self);
    expect(findFfmpeg({ env, cwd: '.' })).toBe(self);
  });

  it('builds the documented encode arguments', () => {
    const args = encoderArgs({
      width: 1920,
      height: 1080,
      fps: { num: 30000, den: 1001 },
      crf: 16,
      out: 'out.mp4',
    });
    const joined = args.join(' ');
    expect(joined).toContain('-f rawvideo -pix_fmt rgba -s 1920x1080 -r 30000/1001 -i -');
    expect(joined).toContain(
      `-vf ${VIDEO_FILTER} -c:v libx264 -preset slow -crf 16 -profile:v high`,
    );
    expect(joined).toContain('-g 60 -bf 3');
    expect(joined).toContain(
      '-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart -an out.mp4',
    );
    expect(VIDEO_FILTER).toMatch(/^scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,/);
  });
});

describe('supersampling helpers', () => {
  it('applies 2x only while 2W x 2H fits in 4096 x 4096', () => {
    expect(effectiveSupersample(2, 1920, 1080)).toBe(2);
    expect(effectiveSupersample(2, 3840, 2160)).toBe(1);
    expect(effectiveSupersample(1, 640, 360)).toBe(1);
  });

  it('averages 2x2 blocks with rounding and opaque alpha', () => {
    const src = new Uint8ClampedArray([
      0, 10, 255, 0, 2, 11, 255, 0, 100, 0, 0, 0, 101, 0, 0, 0, 1, 12, 255, 0, 3, 13, 254, 0, 102,
      0, 0, 0, 104, 0, 0, 0,
    ]);
    expect(Array.from(downsample2x(src, 2, 1))).toEqual([2, 12, 255, 255, 102, 0, 0, 255]);
  });

  it('names segment clips', () => {
    const seg = { kind: 'stop', index: 6 } as Parameters<typeof segmentFileName>[0];
    expect(segmentFileName(seg, 7, 9, 'MERCER COUNTY')).toBe('08-stop-07-mercer-county.mp4');
    const fin = { kind: 'finale', index: 0 } as Parameters<typeof segmentFileName>[0];
    expect(segmentFileName(fin, 8, 9, '')).toBe('09-finale.mp4');
  });
});

describe('frame memory (@napi-rs/canvas)', () => {
  // napi frees readback pixels only in finalizers run from the event loop, and a
  // canvas's recorded drawing only on a full clear at save depth 0. A loop that
  // never yields grows by about 8 MB per 1080p frame (over 500 MB here).
  it('stays bounded over 60 frames at 1080p with one event-loop turn per frame', {
    timeout: 60_000,
  }, async () => {
    const { project } = validateProject(JSON.parse(readFileSync(SEASON, 'utf8')) as unknown);
    const renderer = new FrameRenderer(project);
    expect([renderer.width, renderer.height]).toEqual([1920, 1080]);
    for (let f = 100; f < 110; f++) {
      renderer.rgba(f);
      await releaseFrameMemory();
    }
    const mb = (bytes: number): number => bytes / 1048576;
    const start = process.memoryUsage().rss;
    let peak = start;
    // Frames 112-119 and 152-159 are zoom-through frames, which also read the frame back.
    for (let f = 110; f < 170; f++) {
      renderer.rgba(f);
      await releaseFrameMemory();
      peak = Math.max(peak, process.memoryUsage().rss);
    }
    expect(mb(peak - start)).toBeLessThan(200);
  });
});

describe.skipIf(ffmpeg === undefined || ffprobe === undefined)('waycine render (ffmpeg)', () => {
  it('encodes 2 s of the season to H.264 at 30000/1001', { timeout: 120_000 }, async () => {
    const out = join(scratch.dir, 'two-seconds.mp4');
    const r = await run([
      'render',
      SEASON,
      '-o',
      out,
      '--from',
      '0',
      '--to',
      '59',
      '--short',
      '720',
      '--quiet',
    ]);
    expect(r.code, r.stderr).toBe(0);
    const probe = execFileSync(
      ffprobe ?? 'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-count_frames',
        '-show_entries',
        'stream=codec_name,profile,width,height,avg_frame_rate,nb_read_frames,color_primaries,color_transfer,color_space,color_range',
        '-of',
        'json',
        out,
      ],
      { encoding: 'utf8' },
    );
    const stream = (JSON.parse(probe) as { streams: Record<string, string | number>[] }).streams[0];
    expect(stream).toMatchObject({
      codec_name: 'h264',
      profile: 'High',
      width: 1280,
      height: 720,
      avg_frame_rate: '30000/1001',
      nb_read_frames: '60',
      color_range: 'tv',
      color_space: 'bt709',
      color_transfer: 'bt709',
      color_primaries: 'bt709',
    });
  });
});

/** `nb_read_frames` of the first video stream. */
function frameCount(file: string): number {
  const out = execFileSync(
    ffprobe ?? 'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-count_frames',
      '-show_entries',
      'stream=nb_read_frames',
      '-of',
      'csv=p=0',
      file,
    ],
    { encoding: 'utf8' },
  );
  return Number(out.trim());
}

describe.skipIf(ffmpeg === undefined || ffprobe === undefined)(
  'waycine render --segments and --frames-dir (ffmpeg)',
  () => {
    it('writes one clip per segment with the frame counts info reports', {
      timeout: 120_000,
    }, async () => {
      const dir = join(scratch.dir, 'clips');
      const r = await run([
        'render',
        SINGLE_STOP,
        '--segments',
        '--size',
        '320x320',
        '-o',
        dir,
        '--quiet',
      ]);
      expect(r.code, r.stderr).toBe(0);
      const files = readdirSync(dir).sort();
      expect(files).toHaveLength(3);
      expect(files[0]).toBe('01-overview.mp4');
      expect(files[1]).toBe('02-stop-01-reykjavik.mp4');
      expect(files[2]).toBe('03-finale.mp4');
      const info = await run(['info', SINGLE_STOP, '--segments', '--size', '320x320']);
      const counts = info.stdout
        .split('\n')
        .filter((line) => /^\d+\s+(overview|stop|finale)/.test(line))
        .map((line) => Number(line.split(/\s{2,}/)[3]));
      expect(counts).toHaveLength(3);
      expect(files.map((f) => frameCount(join(dir, f)))).toEqual(counts);
    });

    it('writes the MP4 and the PNG frames of the same range together', {
      timeout: 120_000,
    }, async () => {
      const out = join(scratch.dir, 'both', 'part.mp4');
      const frames = join(scratch.dir, 'both', 'frames');
      const r = await run([
        'render',
        SEASON,
        '-o',
        out,
        '--frames-dir',
        frames,
        '--from',
        '100',
        '--to',
        '109',
        '--size',
        '640x360',
        '--quiet',
      ]);
      expect(r.code, r.stderr).toBe(0);
      expect(frameCount(out)).toBe(10);
      expect(readdirSync(frames).sort()).toEqual(
        Array.from({ length: 10 }, (_, i) => `frame-${String(100 + i).padStart(5, '0')}.png`),
      );
      expect(readdirSync(join(scratch.dir, 'both')).sort()).toEqual(['frames', 'part.mp4']);
    });

    it('stops on Ctrl+C with exit code 130 and leaves the old output alone', {
      timeout: 120_000,
    }, async () => {
      const dir = join(scratch.dir, 'interrupted');
      mkdirSync(dir, { recursive: true });
      const out = join(dir, 'season.mp4');
      const before = Buffer.from('keep me');
      writeFileSync(out, before);
      let unregistered = false;
      const r = await run(['render', SEASON, '-o', out, '--size', '640x360', '--quiet'], {
        onInterrupt: (listener) => {
          const timer = setTimeout(listener, 300);
          return () => {
            clearTimeout(timer);
            unregistered = true;
          };
        },
      });
      expect(r.code).toBe(130);
      expect(r.stderr).toContain('Interrupted.');
      expect(unregistered).toBe(true);
      expect(readFileSync(out)).toEqual(before);
      expect(readdirSync(dir)).toEqual(['season.mp4']);
    });
  },
);
