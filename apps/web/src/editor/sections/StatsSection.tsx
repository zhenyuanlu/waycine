import { useId, useState } from 'preact/hooks';
import { STAT_SOURCES, type StatSource } from 'waycine';
import { UiIcon } from '../../app/icons';
import { copy } from '../../copy/en';
import { project, setValue } from '../../state/project';
import { addStat, moveStat, removeStat, updateStat } from '../../state/stops';
import { type SegOption, Select, Switch, TextField } from '../controls';
import { optionLabel, useFieldValue } from '../FieldControl';
import { FormRow, MoreLink, Section } from '../Section';
import { sectionSummaries } from '../summaries';
import { tokenValues } from '../templates';

// ---------------------------------------------------------------------------
// 05 Finale stats

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function StatsTable() {
  const p = project.value;
  const items = p.stats.items;
  const off = !p.stats.show;
  const values = tokenValues(p) as Record<string, number | undefined>;
  const [more, setMore] = useState<number | null>(null);
  const uid = useId();
  const sourceOptions: SegOption<StatSource>[] = STAT_SOURCES.map((s) => ({
    value: s,
    label: optionLabel(s),
  }));
  return (
    <div class={`stats-t${off ? ' is-off' : ''}`}>
      <div class="stats-r head" aria-hidden="true">
        <span />
        <span class="cap">{copy.stats.label}</span>
        <span class="cap">{copy.stats.source}</span>
        <span />
      </div>
      {items.map((item, i) => {
        const own = item.value !== undefined && item.value !== '' ? item.value : null;
        const computed = item.source === 'custom' ? undefined : values[item.source];
        const shown = own ?? (computed === undefined ? '–' : NUMBER_FORMAT.format(computed));
        const open = more === i;
        return (
          <div key={i} class="stats-item">
            <div class="stats-r" data-stat={i}>
              <span class="v">{shown}</span>
              <span data-field="stats.items[].label">
                <TextField
                  value={item.label}
                  set={(label) => updateStat(i, { label }, `stat:${i}:label`)}
                  label={`${copy.stats.label} ${i + 1}`}
                  disabled={off}
                />
              </span>
              <span data-field="stats.items[].source">
                <Select
                  options={sourceOptions}
                  value={item.source}
                  set={(source) => updateStat(i, { source })}
                  label={`${copy.stats.source} ${i + 1}`}
                  disabled={off}
                />
              </span>
              <span class="stats-x">
                <button
                  type="button"
                  class="icon-btn sm"
                  aria-expanded={open}
                  aria-label={copy.stats.more(i + 1)}
                  title={copy.stats.more(i + 1)}
                  disabled={off}
                  onClick={() => setMore(open ? null : i)}
                >
                  <UiIcon name="more" size={14} />
                </button>
                <button
                  type="button"
                  class="icon-btn sm danger"
                  aria-label={copy.stats.remove(i + 1)}
                  title={copy.stats.remove(i + 1)}
                  disabled={off}
                  onClick={() => {
                    setMore(null);
                    removeStat(i);
                  }}
                >
                  <UiIcon name="close" size={14} />
                </button>
              </span>
            </div>
            {open && (
              <div class="stats-more">
                <span class="fgrid">
                  <FormRow label={copy.stats.labelOne} labelId={`${uid}-one-${i}`}>
                    <span data-field="stats.items[].labelOne">
                      <TextField
                        value={item.labelOne ?? ''}
                        set={(labelOne) => updateStat(i, { labelOne }, `stat:${i}:one`)}
                        labelledBy={`${uid}-one-${i}`}
                      />
                    </span>
                  </FormRow>
                  <FormRow
                    label={copy.stats.value}
                    labelId={`${uid}-val-${i}`}
                    note={copy.stats.valueHelp}
                  >
                    <span data-field="stats.items[].value">
                      <TextField
                        value={item.value ?? ''}
                        set={(value) => updateStat(i, { value }, `stat:${i}:value`)}
                        labelledBy={`${uid}-val-${i}`}
                        placeholder={copy.stats.valueHint}
                      />
                    </span>
                  </FormRow>
                  <FormRow label="" labelId={`${uid}-mv-${i}`}>
                    <span class="frow">
                      <button
                        type="button"
                        class="btn sm"
                        disabled={i === 0}
                        onClick={() => {
                          moveStat(i, -1);
                          setMore(i - 1);
                        }}
                      >
                        <UiIcon name="up" size={14} />
                        {copy.stops.moveUp}
                      </button>
                      <button
                        type="button"
                        class="btn sm"
                        disabled={i === items.length - 1}
                        onClick={() => {
                          moveStat(i, 1);
                          setMore(i + 1);
                        }}
                      >
                        <UiIcon name="down" size={14} />
                        {copy.stops.moveDown}
                      </button>
                    </span>
                  </FormRow>
                </span>
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && <p class="fnote">{copy.stats.empty}</p>}
    </div>
  );
}

export function StatsSection() {
  const show = useFieldValue('stats.show');
  const off = show.value !== true;
  return (
    <Section id="stats" summary={sectionSummaries.value.stats}>
      <div class="frow-wrap" data-path="stats.show">
        <Switch
          checked={!off}
          set={(on) => setValue('stats.show', on)}
          text={copy.stats.show}
          class="lead-switch"
        />
      </div>
      <StatsTable />
      <div class="sec-actions">
        <button type="button" class="btn-line" disabled={off} onClick={addStat}>
          <UiIcon name="plus" />
          {copy.stats.add}
        </button>
      </div>
      <MoreLink section="stats" />
    </Section>
  );
}
