import { useId } from 'preact/hooks';
import { FIELD_BY_PATH, fpsRational, outputSize } from 'waycine';
import { copy } from '../../copy/en';
import { bitrateFor, estimateBytes, formatEstimate } from '../../export/plan';
import { project, setValue } from '../../state/project';
import { Seg, type SegOption } from '../controls';
import { fieldOptionLabel, resetPath, useFieldValue } from '../FieldControl';
import { FormRow, MoreLink, Section } from '../Section';
import { sectionSummaries, videoLength } from '../summaries';

// ---------------------------------------------------------------------------
// 06 Video

const COMMON_FPS = [24, 25, 29.97, 30, 60] as const;

function VideoResult() {
  const p = project.value;
  const size = outputSize(p.output);
  const fps = fpsRational(p.output.fps);
  const length = videoLength.value;
  const bytes = estimateBytes(
    bitrateFor(p.output, size, fps, p.output.quality),
    length?.frames ?? 0,
    fps,
  );
  return (
    <p class="estimate">
      <b>
        {size.width} × {size.height}
      </b>
      {copy.video.resultLine(formatEstimate(bytes))}
    </p>
  );
}

function VideoSeg<T extends string | number>({
  path,
  label,
  options,
}: {
  path: string;
  label: string;
  options: readonly SegOption<T>[];
}) {
  const uid = useId();
  const { value, changed } = useFieldValue(path);
  return (
    <div class="frow-wrap" data-path={path}>
      <FormRow label={label} labelId={`${uid}-l`} changed={changed} onReset={() => resetPath(path)}>
        <Seg
          class="fill"
          options={options}
          value={value as T}
          set={(v) => setValue(path, v)}
          labelledBy={`${uid}-l`}
        />
      </FormRow>
    </div>
  );
}

export function VideoSection() {
  const p = project.value;
  const aspectField = FIELD_BY_PATH.get('output.aspect');
  const sizeField = FIELD_BY_PATH.get('output.shortSide');
  const qualityField = FIELD_BY_PATH.get('output.quality');
  const fps: (string | number)[] = [...COMMON_FPS];
  if (!fps.includes(p.output.fps)) fps.push(p.output.fps);
  const opts = <T extends string | number>(field: typeof aspectField, values: readonly T[]) =>
    values.map((v) => ({
      value: v,
      label: field === undefined ? String(v) : fieldOptionLabel(field, v),
    }));
  return (
    <Section id="video" summary={sectionSummaries.value.video}>
      <div class="fgrid">
        <VideoSeg
          path="output.aspect"
          label={copy.video.format}
          options={opts(
            aspectField,
            (aspectField?.options ?? []).filter((o) => o !== 'custom'),
          )}
        />
        <VideoSeg
          path="output.shortSide"
          label={copy.video.resolution}
          options={opts(sizeField, sizeField?.options ?? [])}
        />
        <VideoSeg
          path="output.fps"
          label={copy.video.fps}
          options={fps.map((v) => ({ value: v, label: String(v) }))}
        />
        <VideoSeg
          path="output.quality"
          label={copy.video.quality}
          options={opts(qualityField, qualityField?.options ?? [])}
        />
        <FormRow label={copy.video.result} labelId={`${useId()}-r`} note={copy.video.exportNote}>
          <VideoResult />
        </FormRow>
      </div>
      <MoreLink section="video" />
    </Section>
  );
}
