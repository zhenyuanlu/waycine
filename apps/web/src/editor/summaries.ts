import { computed } from '@preact/signals';
import {
  fpsRational,
  outputSize,
  replaceTokens,
  transitionStyle,
  type WaycineProject,
} from 'waycine';
import { copy } from '../copy/en';
import { formatClock } from '../player/time';
import { engineState } from '../state/engine';
import { closestTheme, isBuiltInTheme, project } from '../state/project';
import { shortDate } from './controls';
import { optionLabel } from './FieldControl';
import { tokenValues } from './templates';

/** A template as the video prints it (tokens filled, missing ones left out, capitals applied). */
export function showsAs(p: WaycineProject, template: string, stopLabel = false): string {
  const values = tokenValues(p);
  const visible = p.stops.filter((s) => s.hidden !== true).length;
  const filled = replaceTokens(
    template,
    stopLabel ? { ...values, n: 1, total: Math.max(1, visible) } : values,
    { dropMissing: true },
  );
  return p.text.uppercase ? filled.toUpperCase() : filled;
}

/** "Jun 13 – Sep 19": the first and last stop dates, or ''. */
function dateRange(p: WaycineProject): string {
  const dates = p.stops
    .flatMap((s) => [s.date, s.endDate])
    .filter((d): d is string => typeof d === 'string' && d !== '')
    .sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined) return '';
  return first === last ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
}

/** The video length as `0:14.7`, from the compiled preview (null while there is none). */
export const videoLength = computed<{ clock: string; seconds: number; frames: number } | null>(
  () => {
    const state = engineState.value;
    if (state.kind !== 'ready') return null;
    const { compiled } = state;
    const fps = compiled.fps.num / compiled.fps.den;
    const frames = compiled.timeline.totalFrames;
    return { clock: formatClock(frames / fps), seconds: frames / fps, frames };
  },
);

/** The theme's display name: "Ember", or "Ember (edited)" after a colour change. */
const themeName = computed(() => {
  const theme = project.value.theme;
  const base = optionLabel(closestTheme(theme).id);
  return isBuiltInTheme(theme) ? base : copy.look.edited(base);
});

/** Live summaries of the Basics sections. */
export const sectionSummaries = computed(() => {
  const p = project.value;
  const length = videoLength.value;
  const size = outputSize(p.output);
  const transition = copy.timing.transitions[transitionStyle(p)].title;
  const title = showsAs(p, p.text.title).trim();
  return {
    stops: copy.summaries.stops(p.stops.length, dateRange(p)),
    text: title === '' ? copy.summaries.noTitle : title,
    look: themeName.value,
    timing: copy.summaries.timing(length?.clock ?? '0:00.0', transition),
    stats: p.stats.show ? copy.summaries.stats(p.stats.items.length) : copy.summaries.statsOff,
    video: copy.summaries.video(
      p.output.aspect === 'custom' ? `${size.width} × ${size.height}` : p.output.aspect,
      copy.editor.videoSize(p.output.shortSide),
      String(Math.round(fpsRationalValue(p) * 1000) / 1000),
    ),
  };
});

function fpsRationalValue(p: WaycineProject): number {
  const r = fpsRational(p.output.fps);
  return r.num / r.den;
}

/** Rail meta for the Basics rows: "7", "14.7 s", "3", "1080p". */
export const railMeta = computed<Record<string, string>>(() => {
  const p = project.value;
  const length = videoLength.value;
  return {
    stops: String(p.stops.length),
    timing: length === null ? '' : `${length.seconds.toFixed(1)} s`,
    stats: p.stats.show ? String(p.stats.items.length) : '',
    video: copy.editor.videoSize(p.output.shortSide),
  };
});
