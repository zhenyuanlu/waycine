import { useEffect, useRef, useState } from 'preact/hooks';
import { type Aspect, fpsRational, outputSize } from 'waycine';
import { UiIcon } from '../app/icons';
import { copy } from '../copy/en';
import { Seg } from '../editor/controls';
import { exporting } from '../export/exporter';
import { project, setValue } from '../state/project';
import { previewCollapsed, safeZones } from '../state/ui';
import { frame, loop, pause, playing, seek, stepSeconds, timeline, togglePlay } from './player';
import { activeChipIndex, type SegmentChip, segmentChips } from './segments';
import { formatClock } from './time';

/** Formats offered in the transport (4:5 and custom sizes are in the Video section). */
const FORMATS = ['16:9', '9:16', '1:1'] as const;

/** Jumps to the start of the previous or next part of the video. */
export function jumpSegment(direction: -1 | 1): void {
  const chips = segmentChips.peek();
  if (chips.length === 0) return;
  const f = frame.peek();
  const current = chips.findIndex((c) => f >= c.start && f < c.end);
  let target = current + direction;
  // "Previous" from inside a part goes to that part's start first.
  if (direction === -1 && current >= 0 && f > (chips[current]?.start ?? 0)) target = current;
  const chip = chips[Math.max(0, Math.min(chips.length - 1, target))];
  if (chip !== undefined) {
    pause();
    seek(chip.start);
  }
}

/** Toggles fullscreen for the stage (the preview and its transport). */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  const stage = document.querySelector<HTMLElement>('.stage');
  void stage?.requestFullscreen?.().catch(() => undefined);
}

function useFullscreen(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const update = (): void => setOn(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return on;
}

/** "Stop 1 · Boston", "Intro", "Finale". */
function whereLabel(chip: SegmentChip | undefined): string {
  if (chip === undefined) return '';
  return chip.stop === null ? chip.label : copy.segments.current(chip.stop.n, chip.stop.city);
}

function valueText(f: number, total: number, fps: number, chip: SegmentChip | undefined): string {
  const where =
    chip === undefined
      ? ''
      : chip.stop === null
        ? chip.label
        : copy.segments.where(chip.stop.n, chip.stop.city);
  return copy.player.valueText(formatClock(f / fps), formatClock(total / fps), where);
}

/**
 * The range input that is the timeline's control: it covers the lanes and
 * takes clicks, drags and keys (arrows one frame, Shift one second, Page Up
 * / Page Down the previous or next part, Home / End).
 */
function ScrubInput({ label }: { label: string }) {
  const t = timeline.value;
  const total = t?.total ?? 1;
  const fps = t?.fps ?? 30;
  const f = frame.value;
  const chips = segmentChips.value;
  const chip = chips[activeChipIndex.value];
  const [hover, setHover] = useState<{ x: number; text: string } | null>(null);
  return (
    <>
      <input
        type="range"
        class="tl-input"
        min={0}
        max={Math.max(0, total - 1)}
        step={1}
        value={f}
        disabled={t === null}
        aria-label={label}
        aria-valuetext={valueText(f, total, fps, chip)}
        onInput={(event) => seek(Number(event.currentTarget.value))}
        onKeyDown={(event) => {
          if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            stepSeconds(event.key === 'ArrowLeft' ? -1 : 1);
          } else if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault();
            jumpSegment(event.key === 'PageUp' ? -1 : 1);
          }
        }}
        onPointerMove={(event) => {
          const r = event.currentTarget.getBoundingClientRect();
          const k = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
          setHover({ x: k, text: formatClock((k * (total - 1)) / fps) });
        }}
        onPointerLeave={() => setHover(null)}
      />
      {hover !== null && (
        // Moved by a transform (never by left), so hovering shifts no layout.
        <span
          class="tl-tipw"
          aria-hidden="true"
          style={{ transform: `translateX(${hover.x * 100}%)` }}
        >
          <span class="tl-tip">{hover.text}</span>
        </span>
      )}
    </>
  );
}

/** Second ticks of the ruler lane: minor every second, major (labelled) every two. */
function Ruler({ seconds }: { seconds: number }) {
  if (seconds <= 0) return <div class="tl-ruler" />;
  const step = seconds > 120 ? 10 : seconds > 60 ? 5 : seconds > 30 ? 2 : 1;
  const ticks: { s: number; major: boolean }[] = [];
  for (let s = 0; s <= seconds + 1e-9; s += step)
    ticks.push({ s, major: Math.round(s / step) % 2 === 0 });
  return (
    <div class="tl-ruler" aria-hidden="true">
      {ticks.map(({ s, major }) => (
        <span key={s} class={`tk${major ? ' mj' : ''}`} style={{ left: `${(s / seconds) * 100}%` }}>
          {major && s > 0 && s < seconds - step * 0.6 && (
            <span class="tk-l">{formatClock(s).slice(0, -2)}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * The timeline: a ruler lane with the playhead's head, a thin
 * track of one block per part (the played part in ink, the current part
 * marked), and a label lane the playhead never enters.
 */
function Timeline() {
  const t = timeline.value;
  const chips = segmentChips.value;
  const active = activeChipIndex.value;
  const f = frame.value;
  const total = t?.total ?? 1;
  const fps = t?.fps ?? 30;
  const p = total > 1 ? f / (total - 1) : 0;
  const labels = useRef<HTMLDivElement>(null);
  // Which labels show only their number. Kept in state (not toggled on the DOM), so the
  // class survives the re-render that marks the current part during playback.
  const [short, setShort] = useState<readonly boolean[]>([]);

  // A label that does not fit its part shows only the number (no mid-word ellipsis).
  useEffect(() => {
    const el = labels.current;
    if (!el) return;
    const fit = (): void => {
      const next = [...el.querySelectorAll<HTMLElement>('.tl-lab')].map((cell) => {
        const full = cell.querySelector<HTMLElement>('.full');
        return full !== null && full.scrollWidth > cell.clientWidth + 0.5;
      });
      setShort((prev) =>
        prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next,
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [chips]);

  return (
    <div class="tl" style={{ '--p': String(p) }}>
      <Ruler seconds={(total - 1) / fps} />
      <div class="tl-track" aria-hidden="true">
        {chips.map((chip, i) => {
          const fill = Math.min(
            1,
            Math.max(0, (f - chip.start + 1) / Math.max(1, chip.end - chip.start)),
          );
          return (
            <span
              key={chip.key}
              class={`tl-seg${i === active ? ' is-current' : ''}`}
              style={{ flexGrow: chip.end - chip.start }}
            >
              <i style={{ transform: `scaleX(${fill})` }} />
            </span>
          );
        })}
      </div>
      <div class="tl-labels" ref={labels} aria-hidden="true">
        {chips.map((chip, i) => (
          <span
            key={chip.key}
            class={`tl-lab${i === active ? ' is-current' : ''}${short[i] === true ? ' short' : ''}`}
            style={{ flexGrow: chip.end - chip.start }}
            title={copy.segments.tooltip(chip.label, formatClock(chip.start / fps))}
          >
            <span class="full">{chip.label}</span>
            <span class="num-only">
              {chip.stop === null ? chip.label.slice(0, 1) : String(chip.stop.n)}
            </span>
          </span>
        ))}
      </div>
      <span class="tl-head" aria-hidden="true" />
      <ScrubInput label={copy.player.scrub} />
    </div>
  );
}

/** The phone's segment strip: one slider of numbered cells. */
function Strip() {
  const chips = segmentChips.value;
  const active = activeChipIndex.value;
  const t = timeline.value;
  const total = t?.total ?? 1;
  const p = total > 1 ? frame.value / (total - 1) : 0;
  return (
    <div class="strip" style={{ '--p': String(p) }}>
      <div class="strip-cells" aria-hidden="true">
        {chips.map((chip, i) => (
          <span key={chip.key} class={`strip-cell${i === active ? ' is-current' : ''}`}>
            <span>{chip.stop === null ? chip.label : String(chip.stop.n)}</span>
          </span>
        ))}
      </div>
      <span class="strip-head" aria-hidden="true" />
      <ScrubInput label={copy.player.scrub} />
    </div>
  );
}

function FormatSwitch({ compact = false }: { compact?: boolean }) {
  const output = project.value.output;
  const size = outputSize(output);
  const fps = fpsRational(output.fps);
  return (
    <Seg
      class={`fmt${compact ? ' compact' : ''}`}
      label={copy.formats.legend}
      title={copy.player.formatHint(
        output.aspect,
        `${size.width} × ${size.height}`,
        String(Math.round((fps.num / fps.den) * 1000) / 1000),
      )}
      options={FORMATS.map((value) => ({ value, label: value, title: copy.formats.hint[value] }))}
      value={output.aspect as (typeof FORMATS)[number]}
      set={(value) => setValue('output.aspect', value satisfies Aspect)}
    />
  );
}

function PlayButton({ phone }: { phone: boolean }) {
  const t = timeline.value;
  const on = playing.value;
  return (
    <button
      type="button"
      class="play"
      onClick={togglePlay}
      disabled={t === null || exporting.value}
      aria-label={on ? copy.player.pause : copy.player.play}
      title={copy.player.playHint}
    >
      <span class={`pp${on ? ' on' : ''}`} aria-hidden="true">
        <UiIcon name="play" size={phone ? 20 : 16} />
        <UiIcon name="pause" size={phone ? 20 : 16} />
      </span>
    </button>
  );
}

/** Loop on or off (L): a toggle in a fixed slot next to the format switch. */
function LoopButton({ phone }: { phone: boolean }) {
  const on = loop.value;
  return (
    <button
      type="button"
      class="icon-btn loop-btn"
      aria-pressed={on}
      aria-label={copy.player.loop}
      title={copy.player.loopHint}
      onClick={() => (loop.value = !loop.peek())}
    >
      <UiIcon name="loop" size={phone ? 20 : 16} />
    </button>
  );
}

function TimeReadout() {
  const t = timeline.value;
  const fps = t?.fps ?? 30;
  const total = t?.total ?? 0;
  const time = formatClock(frame.value / fps);
  return (
    <span class="time">
      <b>{time}</b> / <span class="tot">{formatClock(total / fps)}</span>
    </span>
  );
}

/** The transport under the preview: timeline, then play, stops, time, format, safe zone, fullscreen. */
export function Transport({ phone }: { phone: boolean }) {
  const t = timeline.value;
  const chips = segmentChips.value;
  const chip = chips[activeChipIndex.value];
  const fullscreen = useFullscreen();
  const collapsed = previewCollapsed.value;
  if (phone) {
    return (
      <fieldset class="transport phone" aria-label={copy.player.controlsLabel}>
        <div class="tc">
          <PlayButton phone />
          <TimeReadout />
          <span class="grow" />
          <LoopButton phone />
          <FormatSwitch compact />
          <button
            type="button"
            class="icon-btn"
            aria-pressed={collapsed}
            aria-label={copy.player.shrink}
            title={collapsed ? copy.player.grow : copy.player.shrink}
            onClick={() => (previewCollapsed.value = !collapsed)}
          >
            <UiIcon name={collapsed ? 'grow' : 'shrink'} size={20} />
          </button>
        </div>
        <Strip />
      </fieldset>
    );
  }
  const total = t?.total ?? 0;
  const pad = String(Math.max(0, total)).length;
  return (
    <fieldset class="transport" aria-label={copy.player.controlsLabel}>
      <Timeline />
      <div class="tc">
        <PlayButton phone={false} />
        <button
          type="button"
          class="icon-btn"
          aria-label={copy.player.previousStop}
          title={copy.player.previousStopHint}
          disabled={t === null}
          onClick={() => jumpSegment(-1)}
        >
          <UiIcon name="prev" />
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label={copy.player.nextStop}
          title={copy.player.nextStopHint}
          disabled={t === null}
          onClick={() => jumpSegment(1)}
        >
          <UiIcon name="next" />
        </button>
        <TimeReadout />
        <span class="now">{whereLabel(chip)}</span>
        <span class="grow" />
        <LoopButton phone={false} />
        <FormatSwitch />
        <button
          type="button"
          class="btn safe-btn"
          aria-pressed={safeZones.value}
          title={copy.player.safeZoneHint}
          onClick={() => (safeZones.value = !safeZones.peek())}
        >
          <UiIcon name="safe" />
          <span>{copy.player.safeZone}</span>
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label={fullscreen ? copy.player.exitFullscreen : copy.player.fullscreen}
          title={copy.player.fullscreenHint}
          onClick={toggleFullscreen}
        >
          <UiIcon name={fullscreen ? 'exitFullscreen' : 'fullscreen'} />
        </button>
        <span class="frame-no">
          {copy.player.frame(String(frame.value).padStart(pad, '0'), String(total))}
        </span>
      </div>
    </fieldset>
  );
}
