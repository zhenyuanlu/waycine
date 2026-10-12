import { describe, expect, it } from 'vitest';
import { FIELDS } from 'waycine';
import { CUSTOM_UI_PATHS, GROUPS, groupFields, groupRows, settingsCount } from './catalog';

describe('every FIELDS entry has a control in the editor', () => {
  it('All settings groups plus the stop and stat editors cover the catalog exactly once', () => {
    const listed = GROUPS.flatMap((g) => groupFields(g)).map((f) => f.path);
    const custom = Object.keys(CUSTOM_UI_PATHS);
    expect(listed.filter((path) => custom.includes(path))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed, ...custom].sort()).toEqual(FIELDS.map((f) => f.path).sort());
  });

  it('lists each concrete path once per profile, the active profile only', () => {
    for (const profile of ['landscape', 'portrait', 'square'] as const) {
      const paths = GROUPS.flatMap((g) => groupRows(g, profile)).map((r) => r.path);
      expect(new Set(paths).size).toBe(paths.length);
      expect(
        paths
          .filter((p) => p.startsWith('layouts.'))
          .every((p) => p.startsWith(`layouts.${profile}.`)),
      ).toBe(true);
      expect(paths).toContain('fonts.display.family');
      expect(paths).toContain('fonts.body.family');
      expect(settingsCount(profile)).toBe(paths.length);
    }
  });

  it('puts the rows shown in Basics first in each group', () => {
    for (const g of GROUPS) {
      const rows = groupRows(g, 'landscape');
      const firstMore = rows.findIndex((r) => !r.basic);
      if (firstMore >= 0) expect(rows.slice(firstMore).some((r) => r.basic)).toBe(false);
    }
  });
});
