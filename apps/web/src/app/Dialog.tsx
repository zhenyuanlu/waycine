import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { copy } from '../copy/en';
import { UiIcon } from './icons';

/**
 * A modal native `<dialog>` (square, 1 px ink frame, paper scrim):
 * `showModal()` makes the rest of the page inert (focus stays inside) and
 * Escape closes it. Focus returns to where it was when the dialog opened.
 */
export function Dialog({
  open,
  title,
  kicker,
  onClose,
  children,
  wide = false,
  class: className = '',
}: {
  open: boolean;
  title: string;
  /** Small caps line above the title. */
  kicker?: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
  class?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) {
        opener.current.focus();
      }
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      class={`dlg${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`}
      aria-labelledby={open ? titleId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        // The player's shortcuts stay off while a dialog is open.
        if (event.key !== 'Escape') event.stopPropagation();
      }}
    >
      {open && (
        <div class="dlg-body">
          <div class="dlg-top">
            <div>
              {kicker !== undefined && (
                <p class="cap kicker" aria-hidden="true">
                  {kicker}
                </p>
              )}
              <h2 id={titleId} class="dlg-title">
                {title}
              </h2>
            </div>
            <button
              type="button"
              class="icon-btn"
              aria-label={copy.dialog.close}
              title={copy.dialog.close}
              onClick={onClose}
            >
              <UiIcon name="close" />
            </button>
          </div>
          <div class="dlg-rule" aria-hidden="true" />
          <div class="dlg-content">{children}</div>
        </div>
      )}
    </dialog>
  );
}
