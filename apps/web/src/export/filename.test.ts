import { describe, expect, it } from 'vitest';
import { createDefaultProject, type WaycineProject } from 'waycine';
import { clipFileName, exportFileName, fileBaseName, slugify, stillFileName } from './filename';

function project(name: string, output: Partial<WaycineProject['output']>): WaycineProject {
  const p = createDefaultProject();
  p.meta.name = name;
  p.output = { ...p.output, ...output };
  return p;
}

describe('export file names', () => {
  it('slugifies project names to lower-case ASCII', () => {
    expect(slugify('2026 Dragon Boat Season')).toBe('2026-dragon-boat-season');
    expect(slugify(`Caf${String.fromCharCode(0xe9)} Tour!`)).toBe('cafe-tour');
    expect(slugify('  --  ')).toBe('journey');
    expect(slugify('')).toBe('journey');
    expect(slugify('x'.repeat(80))).toHaveLength(60);
  });

  it('names preset sizes by aspect and short side', () => {
    expect(exportFileName(project('2026 Dragon Boat Season', {}))).toBe(
      'waycine-2026-dragon-boat-season-16x9-1080p.mp4',
    );
    expect(exportFileName(project('Trip', { aspect: '9:16', shortSide: 720 }))).toBe(
      'waycine-trip-9x16-720p.mp4',
    );
  });

  it('names each format chip: 16x9, 9x16 and 1x1', () => {
    expect(exportFileName(project('Europe trip demo', { aspect: '9:16' }))).toBe(
      'waycine-europe-trip-demo-9x16-1080p.mp4',
    );
    expect(exportFileName(project('Trip', { aspect: '1:1', shortSide: 720 }))).toBe(
      'waycine-trip-1x1-720p.mp4',
    );
    expect(exportFileName(project('Trip', { aspect: '4:5' }))).toBe('waycine-trip-4x5-1080p.mp4');
  });

  it('names custom sizes by their aspect when it is a named one, else by width and height', () => {
    expect(exportFileName(project('Trip', { aspect: 'custom', width: 540, height: 960 }))).toBe(
      'waycine-trip-9x16-540p.mp4',
    );
    expect(exportFileName(project('Trip', { aspect: 'custom', width: 640, height: 360 }))).toBe(
      'waycine-trip-16x9-360p.mp4',
    );
    expect(exportFileName(project('Trip', { aspect: 'custom', width: 1000, height: 600 }))).toBe(
      'waycine-trip-1000x600.mp4',
    );
  });

  it('names the size the dialog chose and the container', () => {
    const season = project('2026 Dragon Boat Season', {});
    expect(exportFileName(season, { width: 1280, height: 720 })).toBe(
      'waycine-2026-dragon-boat-season-16x9-720p.mp4',
    );
    expect(exportFileName(season, { width: 3840, height: 2160, ext: 'zip' })).toBe(
      'waycine-2026-dragon-boat-season-16x9-2160p.zip',
    );
    expect(exportFileName(project('Trip', { aspect: '9:16' }), { ext: 'webm' })).toBe(
      'waycine-trip-9x16-1080p.webm',
    );
  });

  it('names a project that still has the default name after its title', () => {
    const own = project('My journey', { aspect: '9:16' });
    own.text.title = 'IBERIA TO PARIS {year}';
    expect(fileBaseName(own)).toBe('IBERIA TO PARIS');
    expect(exportFileName(own)).toBe('waycine-iberia-to-paris-9x16-1080p.mp4');
    own.text.title = '{stops|STOP|STOPS}';
    expect(exportFileName(own)).toBe('waycine-my-journey-9x16-1080p.mp4');
    const named = project('Summer', {});
    named.text.title = 'IBERIA';
    expect(exportFileName(named)).toBe('waycine-summer-16x9-1080p.mp4');
  });

  it('names PNG stills with the frame number', () => {
    const season = project('2026 Dragon Boat Season', {});
    expect(stillFileName(season, { width: 1920, height: 1080 }, 220)).toBe(
      'waycine-2026-dragon-boat-season-16x9-1080p-frame-0220.png',
    );
    expect(stillFileName(season, { width: 1280, height: 720 }, 0)).toBe(
      'waycine-2026-dragon-boat-season-16x9-720p-frame-0000.png',
    );
  });

  it('names clips like the CLI names segment files', () => {
    expect(clipFileName({ kind: 'overview', index: 0, city: '' }, 0, 9, 'mp4')).toBe(
      '01-overview.mp4',
    );
    expect(clipFileName({ kind: 'stop', index: 0, city: 'BOSTON' }, 1, 9, 'mp4')).toBe(
      '02-stop-01-boston.mp4',
    );
    expect(clipFileName({ kind: 'stop', index: 6, city: 'MERCER COUNTY' }, 7, 9, 'webm')).toBe(
      '08-stop-07-mercer-county.webm',
    );
    expect(clipFileName({ kind: 'finale', index: 0, city: '' }, 8, 9, 'mp4')).toBe('09-finale.mp4');
    expect(clipFileName({ kind: 'stop', index: 11, city: '' }, 99, 120, 'mp4')).toBe(
      '100-stop-12.mp4',
    );
  });
});
