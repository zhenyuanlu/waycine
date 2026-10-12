import { describe, expect, it } from 'vitest';
import * as browser from '../../src/browser/index.js';
import * as core from '../../src/core/index.js';
import * as node from '../../src/node/index.js';

/**
 * The browser and node entries re-export the core by name (no wildcard
 * re-exports), so a name added to the core must be added to both lists.
 * Types are checked by the compiler; this covers the runtime values.
 */
describe('package entries', () => {
  const coreNames = Object.keys(core).sort();

  it('waycine/browser re-exports every core value', () => {
    expect(coreNames.filter((name) => !(name in browser))).toEqual([]);
  });

  it('waycine/node re-exports every core value plus font registration', () => {
    expect(coreNames.filter((name) => !(name in node))).toEqual([]);
    expect(typeof node.registerBundledFonts).toBe('function');
    expect(node.bundledFontPath('OFL.txt')).toMatch(/fonts[\\/]OFL\.txt$/);
  });
});
