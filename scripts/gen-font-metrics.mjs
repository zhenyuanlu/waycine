#!/usr/bin/env node
// Reads the vendored TTFs in packages/waycine/fonts and writes
// packages/waycine/fonts/metrics.json with the vertical metrics the engine
// needs to emulate PIL's "la" (left, ascender) text anchor:
//   head.unitsPerEm; hhea ascender/descender/lineGap;
//   OS/2 sTypoAscender/Descender/LineGap, usWinAscent/Descent, fsSelection
//   USE_TYPO_METRICS, sxHeight, sCapHeight; name table family/subfamily.
// `ascentEm` is hhea.ascender / unitsPerEm: FreeType (and therefore PIL) uses
// the hhea ascender for the ascender anchor.
//
// Usage: node scripts/gen-font-metrics.mjs [--check]
//   --check  exit 1 if metrics.json is missing or stale instead of writing it.
// No dependencies.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = path.join(ROOT, 'packages', 'waycine', 'fonts');
const OUT = path.join(FONT_DIR, 'metrics.json');

/**
 * @param {Buffer} buf
 * @returns {Map<string, { offset: number, length: number }>}
 */
function tableDirectory(buf) {
  const version = buf.readUInt32BE(0);
  if (version !== 0x00010000) {
    throw new Error(`not a TrueType font (sfnt version 0x${version.toString(16)})`);
  }
  const numTables = buf.readUInt16BE(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    tables.set(tag, { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) });
  }
  return tables;
}

/**
 * @param {Map<string, { offset: number, length: number }>} tables
 * @param {string} tag
 */
function table(tables, tag) {
  const t = tables.get(tag);
  if (!t) {
    throw new Error(`missing table "${tag}"`);
  }
  return t;
}

/**
 * Windows (3, 1, 0x409) or Mac Roman (1, 0, 0) name record, else undefined.
 * @param {Buffer} buf
 * @param {{ offset: number }} name
 * @param {number} nameId
 * @returns {string | undefined}
 */
function nameString(buf, name, nameId) {
  const count = buf.readUInt16BE(name.offset + 2);
  const storage = name.offset + buf.readUInt16BE(name.offset + 4);
  /** @type {string | undefined} */
  let mac;
  for (let i = 0; i < count; i++) {
    const rec = name.offset + 6 + i * 12;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const language = buf.readUInt16BE(rec + 4);
    const id = buf.readUInt16BE(rec + 6);
    const length = buf.readUInt16BE(rec + 8);
    const start = storage + buf.readUInt16BE(rec + 10);
    if (id !== nameId) {
      continue;
    }
    if (platform === 3 && encoding === 1 && language === 0x409) {
      let s = '';
      for (let j = 0; j < length; j += 2) {
        s += String.fromCharCode(buf.readUInt16BE(start + j));
      }
      return s;
    }
    if (platform === 1 && encoding === 0 && language === 0) {
      mac = buf.toString('latin1', start, start + length);
    }
  }
  return mac;
}

/**
 * @param {number} value
 * @returns {number}
 */
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

/** @param {string} file */
function fontMetrics(file) {
  const buf = readFileSync(path.join(FONT_DIR, file));
  const tables = tableDirectory(buf);
  const head = table(tables, 'head');
  const hhea = table(tables, 'hhea');
  const os2 = table(tables, 'OS/2');
  const name = table(tables, 'name');

  const unitsPerEm = buf.readUInt16BE(head.offset + 18);
  const ascender = buf.readInt16BE(hhea.offset + 4);
  const descender = buf.readInt16BE(hhea.offset + 6);
  const lineGap = buf.readInt16BE(hhea.offset + 8);
  const os2Version = buf.readUInt16BE(os2.offset);
  const fsSelection = buf.readUInt16BE(os2.offset + 62);
  const typoAscender = buf.readInt16BE(os2.offset + 68);
  const typoDescender = buf.readInt16BE(os2.offset + 70);
  const typoLineGap = buf.readInt16BE(os2.offset + 72);
  const winAscent = buf.readUInt16BE(os2.offset + 74);
  const winDescent = buf.readUInt16BE(os2.offset + 76);
  const xHeight = os2Version >= 2 ? buf.readInt16BE(os2.offset + 86) : null;
  const capHeight = os2Version >= 2 ? buf.readInt16BE(os2.offset + 88) : null;

  return {
    family: nameString(buf, name, 1) ?? null,
    subfamily: nameString(buf, name, 2) ?? null,
    fullName: nameString(buf, name, 4) ?? null,
    version: nameString(buf, name, 5) ?? null,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    unitsPerEm,
    hhea: { ascender, descender, lineGap },
    os2: {
      version: os2Version,
      typoAscender,
      typoDescender,
      typoLineGap,
      winAscent,
      winDescent,
      useTypoMetrics: (fsSelection & 0x80) !== 0,
      xHeight,
      capHeight,
    },
    ascentEm: round6(ascender / unitsPerEm),
    descentEm: round6(-descender / unitsPerEm),
    capHeightEm: capHeight === null ? null : round6(capHeight / unitsPerEm),
  };
}

function main() {
  const files = readdirSync(FONT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.ttf'))
    .sort();
  if (files.length === 0) {
    throw new Error(`no .ttf files in ${FONT_DIR}`);
  }
  /** @type {Record<string, ReturnType<typeof fontMetrics>>} */
  const out = {};
  for (const file of files) {
    out[file] = fontMetrics(file);
  }
  const json = `${JSON.stringify(out, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (current !== json) {
      console.error(
        'gen-font-metrics: metrics.json is stale; run "node scripts/gen-font-metrics.mjs"',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`gen-font-metrics: OK (${files.length} fonts)`);
    return;
  }
  writeFileSync(OUT, json);
  console.log(`gen-font-metrics: wrote metrics for ${files.length} fonts`);
}

main();
