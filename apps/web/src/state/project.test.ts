import { describe, expect, it } from 'vitest';
import { THEMES, validateProject } from 'waycine';
import { compactProject } from './compact';
import { PRESETS, startPresetId } from './presets';
import {
  activeProfile,
  applyTheme,
  baseProject,
  blankProject,
  canRedo,
  canUndo,
  closestTheme,
  commit,
  dirty,
  isBuiltInTheme,
  loadProject,
  presetProject,
  project,
  redo,
  setValue,
  undo,
} from './project';
import {
  addStop,
  deleteStop,
  duplicateStop,
  moveStopTo,
  restoreStop,
  sortByDate,
  stopRoom,
  stopsFull,
} from './stops';

/** Starts every test from the race season demo (16:9, the default theme). */
function reset(): void {
  const season = presetProject('race-season');
  loadProject(season, { origin: { kind: 'preset', id: 'race-season' } });
}

describe('project state', () => {
  it('starts on the Europe trip demo when nothing is autosaved', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'europe-trip',
      'race-season',
      'road-trip',
      'world-tour',
      'day-trip',
    ]);
    expect(project.value.meta.name).toBe('Europe trip demo');
    expect(baseProject.value).toBe(project.value);
    expect(canUndo.value).toBe(false);
  });

  it('lists every demo under its project name with a line on what it shows', () => {
    for (const preset of PRESETS) {
      expect(validateProject(preset.source).issues).toEqual([]);
      expect(presetProject(preset.id).meta.name).toBe(preset.label);
      expect(preset.hint.length).toBeGreaterThan(10);
    }
  });

  it('lets a link name the demo a first visit starts on, and ignores unknown names', () => {
    expect(startPresetId('')).toBe('europe-trip');
    expect(startPresetId('?demo=road-trip')).toBe('road-trip');
    expect(startPresetId('?x=1&demo=day-trip')).toBe('day-trip');
    expect(startPresetId('?demo=season-2026')).toBe('europe-trip');
    expect(startPresetId('?demo=')).toBe('europe-trip');
  });

  it('undoes and redoes edits; loading a project clears the history', () => {
    reset();
    setValue('text.title', 'A');
    setValue('output.aspect', '9:16');
    expect(activeProfile.value).toBe('portrait');
    expect(dirty.value).toBe(true);
    undo();
    expect(project.value.output.aspect).toBe('16:9');
    expect(project.value.text.title).toBe('A');
    undo();
    expect(project.value.text.title).toBe('2026 SEASON ROUTE');
    expect(canUndo.value).toBe(false);
    redo();
    redo();
    expect(project.value.output.aspect).toBe('9:16');
    expect(canRedo.value).toBe(false);
    reset();
    expect(canUndo.value).toBe(false);
    expect(dirty.value).toBe(false);
  });

  it('coalesces typing into one undo step', () => {
    reset();
    for (const text of ['M', 'My', 'My ', 'My T', 'My Trip']) setValue('text.title', text);
    expect(project.value.text.title).toBe('My Trip');
    undo();
    expect(project.value.text.title).toBe('2026 SEASON ROUTE');
  });

  it('shares unchanged parts between snapshots', () => {
    reset();
    const before = project.value;
    setValue('theme.route', '#123456');
    expect(project.value.stops).toBe(before.stops);
    expect(project.value.layouts).toBe(before.layouts);
    expect(before.theme.route).toBe('#C77DDB');
  });
});

describe('themes', () => {
  it('swatches replace colours only; a colour edit makes the theme custom', () => {
    reset();
    applyTheme('ember');
    const ember = THEMES.find((t) => t.id === 'ember');
    expect(project.value.theme).toEqual(ember?.theme);
    expect(project.value.text.title).toBe('2026 SEASON ROUTE');
    expect(isBuiltInTheme(project.value.theme)).toBe(true);
    setValue('theme.accent', '#00FF00');
    expect(project.value.theme.id).toBe('custom');
    expect(closestTheme(project.value.theme).id).toBe('ember');
    // Putting the colour back makes it the built-in theme again.
    setValue('theme.accent', ember?.theme.accent);
    expect(project.value.theme.id).toBe('ember');
  });
});

describe('stops', () => {
  it('adds a hidden stop until it is placed, moves, deletes and restores', () => {
    reset();
    const count = project.value.stops.length;
    const id = addStop();
    if (id === null) throw new Error('addStop refused a stop below the limit');
    expect(project.value.stops).toHaveLength(count + 1);
    expect(project.value.stops.at(-1)).toMatchObject({ id, city: '', hidden: true });
    moveStopTo(id, 0);
    expect(project.value.stops[0]?.id).toBe(id);
    const removed = deleteStop(id);
    expect(project.value.stops).toHaveLength(count);
    if (removed) restoreStop(removed.stop, removed.index);
    expect(project.value.stops[0]?.id).toBe(id);
  });

  it('never holds more than 99 stops: add and duplicate stop at the limit', () => {
    const p = blankProject();
    p.stops = Array.from({ length: 98 }, (_, i) => ({ id: `s${i}`, city: 'X', lat: 0, lon: 0 }));
    loadProject(p, { origin: { kind: 'blank' } });
    expect(stopRoom(98)).toBe(1);
    expect(stopsFull.value).toBe(false);
    expect(addStop()).not.toBeNull();
    expect(project.value.stops).toHaveLength(99);
    expect(stopsFull.value).toBe(true);
    expect(addStop()).toBeNull();
    expect(duplicateStop('s0')).toBeNull();
    expect(project.value.stops).toHaveLength(99);
    expect(stopRoom(120)).toBe(0);
  });

  it('starts a blank project without a title', () => {
    expect(blankProject().text.title).toBe('');
    expect(blankProject().meta.name).toBe('My journey');
  });

  it('sorts by date, undated stops last', () => {
    const p = blankProject();
    p.stops = [
      { id: 'c', city: 'C', lat: 0, lon: 0, date: '2026-03-01' },
      { id: 'x', city: 'X', lat: 0, lon: 0 },
      { id: 'a', city: 'A', lat: 0, lon: 0, date: '2026-01-01' },
      { id: 'b', city: 'B', lat: 0, lon: 0, date: '2026-02-01' },
    ];
    loadProject(p, { origin: { kind: 'blank' } });
    commit(project.value);
    sortByDate();
    expect(project.value.stops.map((s) => s.id)).toEqual(['a', 'b', 'c', 'x']);
  });
});

describe('compactProject', () => {
  it('keeps only non-default settings and round-trips through validation', () => {
    const demo = presetProject('day-trip');
    const compact = compactProject(demo);
    expect(Object.keys(compact).slice(0, 3)).toEqual(['version', 'meta', 'stops']);
    expect(compact).not.toHaveProperty('camera');
    expect(compact).toMatchObject({
      text: { uppercase: false },
      layouts: { portrait: { fit: { marginY: 560 } } },
    });
    const { $schema: _schema, ...rest } = demo;
    expect(validateProject(compact).project).toEqual(rest);
    const blank = blankProject();
    expect(validateProject(compactProject(blank)).project).toEqual(blank);
  });
});
