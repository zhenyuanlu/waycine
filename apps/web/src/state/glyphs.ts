import type { WaycineProject } from 'waycine';

const LETTER = /\p{L}/u;
const LATIN = /\p{Script=Latin}/u;
const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * Characters the bundled Barlow fonts do not draw: letters of scripts other
 * than Latin (Greek, Cyrillic, Arabic, CJK and so on) and emoji. The browser
 * draws them with a fallback font, which looks different and may differ
 * between devices. A heuristic by script: Barlow covers Latin, including
 * the accented letters and Vietnamese.
 */
export function unsupportedCharacters(text: string): string[] {
  const out: string[] = [];
  for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)) {
    const bad = EMOJI.test(segment) || (LETTER.test(segment) && !LATIN.test(segment));
    if (bad && !out.includes(segment)) out.push(segment);
  }
  return out;
}

/** Every text of the project that the video draws. */
export function drawnTexts(project: WaycineProject): string[] {
  const texts = [project.text.title, project.text.subtitle, project.text.kicker];
  for (const stop of project.stops) {
    if (stop.hidden === true) continue;
    texts.push(stop.city, stop.event ?? '', stop.partner ?? '', stop.dateText ?? '');
    for (const result of stop.results ?? []) texts.push(result.text);
  }
  for (const item of project.stats.items) {
    texts.push(item.label, item.labelOne ?? '', item.value ?? '');
  }
  return texts;
}

/**
 * Up to `limit` characters of the project's drawn texts that the bundled
 * fonts lack. Only checked when both roles use the bundled fonts: an
 * uploaded font may well have them.
 */
export function missingGlyphs(project: WaycineProject, limit = 6): string[] {
  if (project.fonts.display.source !== 'bundled' || project.fonts.body.source !== 'bundled') {
    return [];
  }
  const out: string[] = [];
  for (const text of drawnTexts(project)) {
    for (const ch of unsupportedCharacters(text)) {
      if (!out.includes(ch)) out.push(ch);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
