import { useId, useRef } from 'preact/hooks';
import { copy } from '../../copy/en';
import { project, setValue } from '../../state/project';
import { Switch } from '../controls';
import { resetPath, useFieldValue } from '../FieldControl';
import { BasicField, FormRow, MoreLink, Section } from '../Section';
import { sectionSummaries, showsAs } from '../summaries';
import { InsertRow, type TokenHandle } from '../TokenField';

// ---------------------------------------------------------------------------
// 02 Titles & text

/** "Shows as 7 RACES / 5 STATES": the line as the video prints it (always one line, never empty). */
function ShowsAs({ path }: { path: 'text.subtitle' | 'text.kicker' | 'text.description' }) {
  const p = project.value;
  const template =
    path === 'text.subtitle'
      ? p.text.subtitle
      : path === 'text.kicker'
        ? p.text.kicker
        : p.text.description;
  const text = showsAs(p, template, path === 'text.kicker').trim();
  const lead = path === 'text.kicker' ? copy.editor.showsAsStop : copy.editor.showsAs;
  const shown = text === '' ? copy.editor.showsNothing : text;
  return (
    <p class="reads shows-as" title={`${lead} ${shown}`}>
      <span class="lead">{lead}</span> <span class={text === '' ? 'none' : 'vid'}>{shown}</span>
    </p>
  );
}

function TemplateRow({
  path,
  insert = false,
  shows = false,
}: {
  path: 'text.title' | 'text.subtitle' | 'text.kicker' | 'text.description';
  insert?: boolean;
  shows?: boolean;
}) {
  const handle = useRef<TokenHandle | null>(null);
  return (
    <BasicField
      path={path}
      tokenHandle={handle}
      after={shows && path !== 'text.title' ? <ShowsAs path={path} /> : undefined}
      below={
        insert ? (
          <InsertRow
            class="span-2"
            insert={(token) => handle.current?.insert(token)}
            stopLabel={path === 'text.kicker'}
          />
        ) : undefined
      }
    />
  );
}

export function TextSection() {
  const uppercase = useFieldValue('text.uppercase');
  return (
    <Section id="text" summary={sectionSummaries.value.text}>
      <div class="fgrid">
        <TemplateRow path="text.title" />
        <TemplateRow path="text.subtitle" insert shows />
        <TemplateRow path="text.description" insert shows />
        <BasicField path="text.descriptionAt" />
        <TemplateRow path="text.kicker" insert shows />
        <div class="frow-wrap" data-path="text.uppercase">
          <FormRow
            label=""
            labelId={`${useId()}-caps`}
            changed={uppercase.changed}
            onReset={() => resetPath('text.uppercase')}
          >
            <Switch
              checked={uppercase.value === true}
              set={(on) => setValue('text.uppercase', on)}
              text={copy.text.allCaps}
            />
          </FormRow>
        </div>
      </div>
      <MoreLink section="text" />
    </Section>
  );
}
