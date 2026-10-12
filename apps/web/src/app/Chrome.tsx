import type { ComponentChildren } from 'preact';
import { copy } from '../copy/en';
import { discardSharedProject, keepSharedProject } from '../state/actions';
import { issueLine } from '../state/issues';
import { missingFontRoles } from '../state/local-fonts';
import {
  dismissToast,
  holdToast,
  keyboardOpen,
  linkIsDemo,
  newerVersion,
  PHONE_SECTIONS,
  type PhoneSection,
  phoneSection,
  restoreIssues,
  sharePending,
  shareReplacedOwn,
  showAllSettings,
  showSection,
  toasts,
} from '../state/ui';
import { UiIcon, type UiIconName } from './icons';

function Notice({
  tone,
  children,
  actions,
}: {
  tone: 'info' | 'warn';
  children: ComponentChildren;
  actions?: ComponentChildren;
}) {
  return (
    <div class={`notice ${tone}`} role={tone === 'warn' ? 'alert' : 'status'}>
      <p>{children}</p>
      {actions !== undefined && <div class="notice-actions">{actions}</div>}
    </div>
  );
}

/**
 * Persistent notices (a shared link or a demo link waiting for Keep, a repaired autosave, a
 * newer file, a missing uploaded font). They float over the bottom of the
 * editor like toasts, so they never push content.
 */
function Notices() {
  const missing = missingFontRoles.value;
  const roles =
    missing.size === 2
      ? copy.notices.fontRoles.both
      : missing.has('display')
        ? copy.notices.fontRoles.display
        : copy.notices.fontRoles.body;
  const any =
    sharePending.value || restoreIssues.value.length > 0 || newerVersion.value || missing.size > 0;
  if (!any) return null;
  return (
    <section class="notices" aria-label={copy.notices.label}>
      {sharePending.value &&
        (shareReplacedOwn.value ? (
          <Notice
            tone="info"
            actions={
              <>
                <button type="button" class="t-act" onClick={keepSharedProject}>
                  {copy.notices.keepThis}
                </button>
                <button type="button" class="t-act" onClick={discardSharedProject}>
                  {copy.notices.backToOwn}
                </button>
              </>
            }
          >
            {linkIsDemo.value ? copy.notices.demo : copy.notices.shared}
          </Notice>
        ) : (
          // A first-time recipient has no project of their own to go back to.
          <Notice
            tone="info"
            actions={
              <button type="button" class="t-act" onClick={keepSharedProject}>
                {copy.notices.keep}
              </button>
            }
          >
            {copy.notices.sharedFresh}
          </Notice>
        ))}
      {restoreIssues.value.length > 0 && (
        <Notice
          tone="warn"
          actions={
            <button type="button" class="t-act" onClick={() => (restoreIssues.value = [])}>
              {copy.notices.dismiss}
            </button>
          }
        >
          {copy.notices.restored(restoreIssues.value.length)}{' '}
          {restoreIssues.value
            .slice(0, 3)
            .map((issue) => issueLine(issue))
            .join(' ')}
        </Notice>
      )}
      {newerVersion.value && (
        <Notice
          tone="warn"
          actions={
            <button type="button" class="t-act" onClick={() => (newerVersion.value = false)}>
              {copy.notices.dismiss}
            </button>
          }
        >
          {copy.notices.newer}
        </Notice>
      )}
      {missing.size > 0 && <Notice tone="warn">{copy.notices.fontMissing(roles)}</Notice>}
    </section>
  );
}

/** The toast (one at a time, inverted colours) and the persistent notices above it. */
export function Toasts() {
  const toast = toasts.value[0];
  return (
    <div class="toasts">
      <Notices />
      <div class="toast-slot" role="status" aria-live="polite" aria-label={copy.toast.region}>
        {toast !== undefined && (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only pause the toast's timer.
          <div
            key={toast.id}
            class="toast"
            onMouseEnter={() => holdToast(true)}
            onMouseLeave={() => holdToast(false)}
            onFocusIn={() => holdToast(true)}
            onFocusOut={() => holdToast(false)}
          >
            <span class="t-msg">{toast.message}</span>
            {toast.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                class="t-act"
                onClick={() => {
                  action.run();
                  holdToast(false);
                  dismissToast(toast.id);
                }}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              class="t-x"
              aria-label={copy.toast.dismiss}
              onClick={() => {
                holdToast(false);
                dismissToast(toast.id);
              }}
            >
              <UiIcon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const PHONE_ICONS: Record<PhoneSection, UiIconName> = {
  stops: 'pin',
  text: 'type',
  look: 'palette',
  timing: 'clock',
  stats: 'stats',
  video: 'film',
  all: 'sliders',
};

/** The phone's bottom section bar: seven sections, one at a time. */
export function PhoneBar() {
  const current = phoneSection.value;
  if (keyboardOpen.value) return null;
  return (
    <nav class="phone-bar" aria-label={copy.editor.phoneBar}>
      <div role="tablist" aria-label={copy.editor.phoneBar}>
        {PHONE_SECTIONS.map((id, i) => {
          const selected = id === current;
          return (
            <button
              key={id}
              id={`ptab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="editor-pane"
              tabIndex={selected ? 0 : -1}
              class="ptab"
              onClick={() => {
                if (id === 'all') showAllSettings();
                else showSection(id);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const step = event.key === 'ArrowRight' ? 1 : -1;
                const next =
                  PHONE_SECTIONS[(i + step + PHONE_SECTIONS.length) % PHONE_SECTIONS.length];
                if (next === undefined) return;
                if (next === 'all') showAllSettings();
                else showSection(next);
                document.getElementById(`ptab-${next}`)?.focus();
              }}
            >
              <UiIcon name={PHONE_ICONS[id]} size={20} />
              <span>{copy.editor.phoneTabs[id]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
