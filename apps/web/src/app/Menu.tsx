import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { UiIcon, type UiIconName } from './icons';

/**
 * Menus and popovers: fixed overlays with a 1 px ink border and square
 * corners. A menu is rendered into its trigger's landmark (header, aside or
 * nav, never main: the stage's size containment would become the fixed
 * menu's containing block), else into the body; a popover into the body. No
 * ancestor clips them. Arrow keys move through menu items; Escape closes and
 * returns focus to the trigger; a press outside closes.
 */

interface Position {
  left: number;
  top: number;
  maxHeight: number;
}

const GAP = 4;
const MARGIN = 8;
/** Scrolls this soon after an overlay opens come from the press that opened it. */
const OPEN_SCROLL_GRACE_MS = 400;

/** Where an overlay of `size` goes next to `anchor`: below it (or above when there is no room). */
function place(
  anchor: DOMRect,
  size: { width: number; height: number },
  align: 'start' | 'end',
): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = align === 'end' ? anchor.right - size.width : anchor.left;
  left = Math.max(MARGIN, Math.min(left, vw - size.width - MARGIN));
  const below = vh - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  if (size.height <= below || below >= above) {
    return { left, top: anchor.bottom + GAP, maxHeight: below };
  }
  const height = Math.min(size.height, above);
  return { left, top: anchor.top - GAP - height, maxHeight: above };
}

function useOverlay(
  anchor: HTMLElement | null,
  open: boolean,
  onClose: () => void,
  align: 'start' | 'end',
) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor || !box.current) {
      setPos(null);
      return;
    }
    const r = box.current.getBoundingClientRect();
    setPos(place(anchor.getBoundingClientRect(), { width: r.width, height: r.height }, align));
  }, [open, anchor]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (box.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    const openedAt = performance.now();
    const onScroll = (event: Event): void => {
      const target = event.target;
      if (box.current?.contains(target as Node)) return;
      // The press that opened it may scroll the field or pane to bring a caret into view (a chip
      // field taking focus): follow the anchor once more. A later scroll closes the overlay.
      if (performance.now() - openedAt < OPEN_SCROLL_GRACE_MS) {
        const r = box.current?.getBoundingClientRect();
        if (anchor && r) {
          setPos(
            place(anchor.getBoundingClientRect(), { width: r.width, height: r.height }, align),
          );
        }
        return;
      }
      if (target instanceof Element && target.closest('.field') !== null) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchor]);
  return { box, pos };
}

/** An anchored popover (a chip editor, the save-state note). */
export function Popover({
  anchor,
  label,
  onClose,
  children,
  align = 'start',
}: {
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  children: ComponentChildren;
  align?: 'start' | 'end';
}) {
  const { box, pos } = useOverlay(anchor, true, onClose, align);
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>(
      'input, select, button, [tabindex="0"], a[href]',
    );
    first?.focus();
  }, [pos === null]);
  return createPortal(
    <div
      ref={box}
      class="pop"
      role="dialog"
      aria-label={label}
      style={
        pos === null
          ? { visibility: 'hidden', left: '0px', top: '0px' }
          : { left: `${pos.left}px`, top: `${pos.top}px`, maxHeight: `${pos.maxHeight}px` }
      }
    >
      {children}
    </div>,
    document.body,
  );
}

export type MenuEntry =
  | {
      kind: 'item';
      label: string;
      onSelect: () => void;
      hint?: string;
      icon?: UiIconName;
      disabled?: boolean;
      /** Accessible name when it differs from the label. */
      name?: string;
    }
  | { kind: 'radio'; label: string; checked: boolean; onSelect: () => void; icon?: UiIconName }
  | { kind: 'check'; label: string; checked: boolean; onSelect: () => void }
  /** A link that opens in a new tab. */
  | { kind: 'link'; label: string; href: string; hint?: string }
  | { kind: 'sep' }
  | { kind: 'cap'; label: string };

/** A button that opens a menu of `items`. */
export function MenuButton({
  items,
  label,
  title,
  icon,
  text,
  class: className = 'icon-btn',
  align = 'end',
  menuLabel,
  keepFocus = false,
}: {
  items: readonly MenuEntry[];
  /** Accessible name of the button. */
  label: string;
  title?: string;
  icon?: UiIconName;
  text?: string;
  class?: string;
  align?: 'start' | 'end';
  menuLabel?: string;
  /** A press on the trigger leaves focus (and the caret) where it is, as INSERT chips do. */
  keepFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = (): void => setOpen(false);
  const { box, pos } = useOverlay(button.current, open, close, align);

  useEffect(() => {
    if (!open || pos === null) return;
    const first = box.current?.querySelector<HTMLElement>(
      '[role^="menuitem"]:not([aria-disabled="true"])',
    );
    first?.focus();
  }, [open, pos === null]);

  const onKeyDown = (event: KeyboardEvent): void => {
    const list = [
      ...(box.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? list[0] : list[list.length - 1])?.focus();
    } else if (event.key === 'Tab') {
      close();
    }
  };

  const choose = (run: () => void) => (): void => {
    close();
    button.current?.focus();
    run();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        class={className}
        aria-label={text === undefined ? label : undefined}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
        onClick={() => setOpen(!open)}
      >
        {icon !== undefined && <UiIcon name={icon} />}
        {text !== undefined && <span>{text}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={box}
            id={menuId}
            class="menu"
            role="menu"
            aria-label={menuLabel ?? label}
            onKeyDown={onKeyDown}
            style={
              pos === null
                ? { visibility: 'hidden', left: '0px', top: '0px' }
                : { left: `${pos.left}px`, top: `${pos.top}px`, maxHeight: `${pos.maxHeight}px` }
            }
          >
            {items.map((item, i) => {
              switch (item.kind) {
                case 'sep':
                  return <hr key={`sep-${i}`} />;
                case 'cap':
                  return (
                    <span key={`cap-${item.label}`} class="cap menu-cap" aria-hidden="true">
                      {item.label}
                    </span>
                  );
                case 'radio':
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.checked}
                      tabIndex={-1}
                      onClick={choose(item.onSelect)}
                    >
                      <span class="menu-mark" aria-hidden="true">
                        {item.checked && <UiIcon name="check" size={14} />}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                case 'check':
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={item.checked}
                      tabIndex={-1}
                      onClick={choose(item.onSelect)}
                    >
                      <span class="menu-mark" aria-hidden="true">
                        {item.checked && <UiIcon name="check" size={14} />}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                case 'link':
                  return (
                    <a
                      key={item.label}
                      role="menuitem"
                      tabIndex={-1}
                      href={item.href}
                      target="_blank"
                      rel="noopener"
                      title={item.hint}
                      onClick={close}
                    >
                      <span class="menu-mark" aria-hidden="true" />
                      <span>{item.label}</span>
                    </a>
                  );
                default:
                  return (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      aria-disabled={item.disabled || undefined}
                      aria-label={item.name}
                      onClick={item.disabled ? undefined : choose(item.onSelect)}
                    >
                      <span class="menu-mark" aria-hidden="true">
                        {item.icon !== undefined && <UiIcon name={item.icon} size={14} />}
                      </span>
                      <span>{item.label}</span>
                      {item.hint !== undefined && <span class="menu-hint">{item.hint}</span>}
                    </button>
                  );
              }
            })}
          </div>,
          button.current?.closest<HTMLElement>('header, aside, nav') ?? document.body,
        )}
    </>
  );
}
