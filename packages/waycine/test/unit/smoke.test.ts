import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as browser from '../../src/browser/index.js';
import { SCHEMA_VERSION, VERSION } from '../../src/core/index.js';
import * as node from '../../src/node/index.js';

interface PackageJson {
  version: string;
}

describe('waycine smoke', () => {
  it('exports a semver VERSION', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps VERSION in sync with package.json', () => {
    const pkgUrl = new URL('../../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as PackageJson;
    expect(VERSION).toBe(pkg.version);
  });

  it('re-exports the core from the browser and node entries', () => {
    expect(browser.VERSION).toBe(VERSION);
    expect(node.VERSION).toBe(VERSION);
    expect(SCHEMA_VERSION).toBe(1);
  });
});
