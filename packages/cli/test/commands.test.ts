import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FIELDS, validateProject } from 'waycine/node';
import { applyFontFiles } from '../src/fonts.js';
import { BUNDLED_DISPLAY, LONG_NAMES, run, SEASON, scratchDir } from './helpers.js';

const scratch = scratchDir('commands');
afterAll(() => scratch.cleanup());

describe('waycine (global)', () => {
  it('prints help and version', async () => {
    const help = await run(['--help']);
    expect(help.code).toBe(0);
    for (const cmd of ['render', 'still', 'info', 'validate', 'init', 'params']) {
      expect(help.stdout).toContain(`  ${cmd} `);
    }
    const version = await run(['--version']);
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/^waycine \d+\.\d+\.\d+ \(engine \d+\.\d+\.\d+\)\n$/);
  });

  it('rejects an unknown command with exit code 2', async () => {
    const r = await run(['bogus']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('unknown command "bogus"');
  });

  it('prints per-command help', async () => {
    const r = await run(['render', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('--frames-dir');
    expect((await run(['help', 'still'])).stdout).toContain('--frame <n>');
  });

  it('turns bad flags into usage errors (exit 2)', async () => {
    const cases = [
      ['still', SEASON, '--frame', '1', '-o', 'x.png', '--aspect', '3:2'],
      ['still', SEASON, '--frame', '1', '-o', 'x.png', '--size', '641x360'],
      ['still', SEASON, '--frame', '1', '-o', 'x.png', '--size', '640x360', '--short', '720'],
      ['still', SEASON, '--frame', 'ten', '-o', 'x.png'],
      ['still', SEASON, '--frame', '1', '-o', 'x.png', '--font', 'title=x.ttf'],
      ['render', SEASON, '--nope'],
      ['render', SEASON],
    ];
    for (const args of cases) {
      const r = await run(args, { cwd: scratch.dir });
      expect(r.code, args.join(' ')).toBe(2);
      expect(r.stderr, args.join(' ')).toMatch(/^waycine (still|render): /);
    }
  });
});

describe('waycine validate', () => {
  it('exits 0 on the reference season', async () => {
    const r = await run(['validate', SEASON]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OK, 0 warning(s). 7 stops, 440 frames at 1920x1080');
  });

  it('exits 1 on errors, bad JSON and missing files', async () => {
    const noStops = join(scratch.dir, 'no-stops.json');
    writeFileSync(noStops, JSON.stringify({ version: 1, stops: [] }));
    const r1 = await run(['validate', noStops]);
    expect(r1.code).toBe(1);
    expect(r1.stdout).toContain('[no-stops]');
    expect(r1.stdout).toMatch(/1 error\(s\)/);

    const bad = join(scratch.dir, 'bad.json');
    writeFileSync(bad, '{ "version": 1, ');
    const r2 = await run(['validate', bad]);
    expect(r2.code).toBe(1);
    expect(r2.stderr).toContain('is not valid JSON');

    const r3 = await run(['validate', join(scratch.dir, 'missing.json')]);
    expect(r3.code).toBe(1);
    expect(r3.stderr).toContain('Project file not found');
  });

  it('keeps warnings at exit 0', async () => {
    const extra = join(scratch.dir, 'extra.json');
    const data = JSON.parse(readFileSync(SEASON, 'utf8')) as Record<string, unknown>;
    data.somethingNew = true;
    writeFileSync(extra, JSON.stringify(data));
    const r = await run(['validate', extra]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[unknown-key]');
    expect(r.stdout).toContain('OK, 1 warning(s)');
  });
});

describe('waycine info', () => {
  it('prints the season timeline', async () => {
    const r = await run(['info', SEASON]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('1920x1080 (16:9), 29.97 fps (30000/1001), landscape profile');
    expect(r.stdout).toContain('Frames   440 (0:14.681)');
    const rows = r.stdout.split('\n').filter((line) => /^\d+\s+(overview|stop|finale)/.test(line));
    expect(rows).toHaveLength(9);
    expect(rows[1]).toMatch(/stop 1 BOSTON\s+80\s+40\s+119/);
  });

  it('follows the output flags', async () => {
    const r = await run(['info', SEASON, '--aspect', '9:16', '--short', '720', '--fps', '30']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('720x1280 (9:16), 30 fps (30/1), portrait profile');
  });
});

describe('waycine init', () => {
  it('writes a project that validates, and refuses to overwrite it', async () => {
    const out = join(scratch.dir, 'new', 'trip.waycine.json');
    const r = await run(['init', '-o', out]);
    expect(r.code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const { issues } = validateProject(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect((await run(['validate', out])).code).toBe(0);

    const again = await run(['init', '-o', out]);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('--force');
    expect((await run(['init', '-o', out, '--force'])).code).toBe(0);
  });

  it('writes the default file name into the working directory', async () => {
    const r = await run(['init', '--preset', 'race-season'], { cwd: scratch.dir });
    expect(r.code).toBe(0);
    expect(existsSync(join(scratch.dir, 'race-season.waycine.json'))).toBe(true);
  });

  it('starts from the Europe trip by default and lists every shipped preset', async () => {
    const r = await run(['init', '-o', '-']);
    expect(JSON.parse(r.stdout)).toMatchObject({ meta: { name: 'Europe trip demo' } });
    const help = await run(['init', '--help']);
    expect(help.stdout).toContain(
      'Presets: day-trip, europe-trip, race-season, road-trip, world-tour',
    );
  });

  it('prints to stdout with -o - and rejects unknown presets', async () => {
    const r = await run(['init', '-o', '-']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ version: 1 });
    const bad = await run(['init', '--preset', 'nowhere']);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('europe-trip');
  });
});

describe('waycine params', () => {
  it('lists every catalog field', async () => {
    const r = await run(['params']);
    expect(r.code).toBe(0);
    for (const f of FIELDS) expect(r.stdout).toContain(`  ${f.path}  `);
    expect(r.stdout).toContain(`${FIELDS.length} of ${FIELDS.length} settings.`);
  });

  it('filters with --search (every word must match)', async () => {
    const r = await run(['params', '--search', 'glow']);
    expect(r.code).toBe(0);
    const paths = r.stdout
      .split('\n')
      .filter((line) => /^ {2}\S/.test(line))
      .map((line) => line.trim().split(/\s+/)[0]);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain('theme.glow');
    for (const p of paths) {
      const f = FIELDS.find((x) => x.path === p);
      expect(f, p).toBeDefined();
    }
    const none = await run(['params', '--search', 'zzzz-no-such-setting']);
    expect(none.code).toBe(0);
    expect(none.stdout).toContain('No settings match');
  });

  it('shows defaults', async () => {
    const r = await run(['params', '--search', 'output.fps']);
    expect(r.stdout).toMatch(/output\.fps .*default 29\.97/);
  });
});

describe('error reporting and flag checks', () => {
  it('reports project errors from info as a clean failure, not an unexpected error', async () => {
    const empty = join(scratch.dir, 'empty-stops.json');
    writeFileSync(empty, JSON.stringify({ version: 1, stops: [] }));
    const r = await run(['info', empty]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('[no-stops]');
    expect(r.stderr).not.toContain('unexpected error');
    expect(r.stdout).toBe('');
  });

  it('does not repeat the command in usage errors', async () => {
    const r = await run(['render', SEASON]);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(
      'waycine render: needs -o <out.mp4> or --frames-dir <dir>. (see "waycine render --help")\n',
    );
    const s = await run(['still']);
    expect(s.stderr).toMatch(/^waycine still: needs a project file: waycine still <project\.json>/);
  });

  it('rejects --short on a custom-size project and --ss for info', async () => {
    const custom = join(scratch.dir, 'custom.json');
    const data = JSON.parse(readFileSync(SEASON, 'utf8')) as { output: Record<string, unknown> };
    data.output = { ...data.output, aspect: 'custom', width: 540, height: 960 };
    writeFileSync(custom, JSON.stringify(data));
    const r = await run(['info', custom, '--short', '1080']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--short needs a preset aspect');
    const ok = await run(['info', custom, '--short', '1080', '--aspect', '9:16']);
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('1080x1920 (9:16)');
    expect((await run(['info', SEASON, '--ss', '2'])).code).toBe(2);
  });

  it('prints file system errors as one line without a stack trace', async () => {
    // -o names an existing folder: writing the PNG fails with EISDIR (or EPERM).
    const r = await run(['still', SEASON, '--frame', '0', '--size', '640x360', '-o', scratch.dir]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^waycine still: E[A-Z]+: /);
    expect(r.stderr).not.toContain('    at ');
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
  });

  it('checks render outputs before compiling', async () => {
    const file = join(scratch.dir, 'not-a-folder.txt');
    writeFileSync(file, 'x');
    const frames = await run(['render', SEASON, '--frames-dir', file, '--to', '0']);
    expect(frames.code).toBe(1);
    expect(frames.stderr).toContain('exists and is not a folder');
    // Segments mode: -o is a folder, so a .mp4 name is a usage error...
    const mp4 = await run(['render', SEASON, '--segments', '-o', join(scratch.dir, 'clips.mp4')], {
      env: { PATH: '', WAYCINE_FFMPEG: process.execPath },
    });
    expect(mp4.code).toBe(2);
    expect(mp4.stderr).toContain('use --single for one video');
    expect(existsSync(join(scratch.dir, 'clips.mp4'))).toBe(false);
    // ...and an existing file there is a failure.
    const onFile = await run(['render', SEASON, '--segments', '-o', file], {
      env: { PATH: '', WAYCINE_FFMPEG: process.execPath },
    });
    expect(onFile.code).toBe(1);
    expect(onFile.stderr).toContain('exists and is not a folder');
    // Single mode: -o must not be a folder.
    const onDir = await run(['render', SEASON, '-o', scratch.dir], {
      env: { PATH: '', WAYCINE_FFMPEG: process.execPath },
    });
    expect(onDir.code).toBe(1);
    expect(onDir.stderr).toContain('is a folder');
  });

  it('lists layout warnings in validate', async () => {
    const r = await run(['validate', LONG_NAMES]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('stops[0].city  [text-overflow]');
    expect(r.stdout).toMatch(/OK, \d+ warning\(s\)/);
  });
});

describe('--font', () => {
  it('resets the role width calibration to 1 and says so', async () => {
    const project = validateProject(JSON.parse(readFileSync(SEASON, 'utf8')) as unknown).project;
    expect(project.fonts.display.widthAdjust).toBe(0.89);
    let stderr = '';
    const io = {
      stdout: () => {},
      stderr: (t: string) => {
        stderr += t;
      },
      stderrIsTTY: false,
      cwd: process.cwd(),
      env: {},
    };
    applyFontFiles(io, project, { display: BUNDLED_DISPLAY });
    expect(project.fonts.display.widthAdjust).toBe(1);
    expect(project.fonts.display.source).toBe('local');
    expect(project.fonts.body.widthAdjust).toBe(1.15);
    expect(stderr).toContain(
      'note: fonts.display.widthAdjust 0.89 is calibrated for the bundled font; reset to 1',
    );
    const quiet = validateProject(JSON.parse(readFileSync(SEASON, 'utf8')) as unknown).project;
    stderr = '';
    applyFontFiles(io, quiet, { body: BUNDLED_DISPLAY }, true);
    expect(quiet.fonts.body.widthAdjust).toBe(1);
    expect(stderr).toBe('');
  });
});
