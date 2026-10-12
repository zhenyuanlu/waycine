import { signal } from '@preact/signals';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { MenuButton, Popover } from '../app/Menu';
import { copy } from '../copy/en';
import { project } from '../state/project';
import { Seg, Select, TextField } from './controls';
import {
  buildToken,
  COUNT_KEYS,
  editableToken,
  INSERT_VISIBLE,
  insertTokens,
  parseToken,
  splitTemplate,
  type TokenParts,
  tokenValues,
} from './templates';

/**
 * Text templates edited as chips: `{stops|RACE|RACES}` shows as a
 * [stops RACES] chip, `{n:02}` as [number]. Raw `{…}` syntax never shows
 * outside the project JSON. The field is a one-line contenteditable whose
 * chips are atomic (Backspace removes a whole chip, arrows step over it);
 * clicking a count or number chip, or Enter / Alt+Down right after it, opens
 * a small editor for it.
 */

/**
 * A zero-width space next to a chip that no text touches (before a chip that
 * starts the field, between two chips, after a chip that ends it): a text
 * position the caret can hold, so Home, Ctrl+A, a click or End next to a
 * chip, or typing after an inserted chip, lands beside the chip (Chromium
 * otherwise moves a caret next to a non-editable chip to its other side).
 * Never part of the template.
 */
const ANCHOR = '\u200b';

function isChip(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.token !== undefined;
}

/**
 * Backspace right after a chip's anchor: removes the chip (and the anchor)
 * and returns true, so one key press removes the chip as a whole instead of
 * the invisible anchor. A lone anchor elsewhere is dropped and the browser
 * deletes the character before it. Returns false when the browser's own
 * Backspace should run.
 */
function backspaceAtAnchor(): boolean {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!selection?.isCollapsed || !(node instanceof Text)) return false;
  const at = selection.anchorOffset;
  if (at === 0 || node.data[at - 1] !== ANCHOR) return false;
  node.deleteData(at - 1, 1);
  if (at - 1 > 0) {
    selection.collapse(node, at - 1);
    return false;
  }
  const chip = node.previousSibling;
  if (!isChip(chip)) {
    selection.collapse(node, 0);
    return false;
  }
  const before = chip.previousSibling;
  chip.remove();
  if (before instanceof Text) selection.collapse(before, before.length);
  else selection.collapse(node, 0);
  return true;
}

/**
 * Gives every chip a text node on both sides (an anchor where there is no
 * text), so the caret can reach both sides of every chip. Only inserts new
 * text nodes, so a selection in the existing ones is kept.
 */
function ensureAnchors(el: HTMLElement): void {
  for (const node of [...el.childNodes]) {
    if (!isChip(node)) continue;
    if (!(node.previousSibling instanceof Text)) node.before(document.createTextNode(ANCHOR));
    if (!(node.nextSibling instanceof Text)) node.after(document.createTextNode(ANCHOR));
  }
}

/** Puts the caret at the very end of the field, after a trailing chip. */
function caretToEnd(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  ensureAnchors(el);
  const last = el.lastChild;
  if (last instanceof Text) selection.collapse(last, last.length);
  else selection.collapse(el, el.childNodes.length);
}

/** Puts the caret at the very start of the field, before a leading chip. */
function caretToStart(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  ensureAnchors(el);
  const first = el.firstChild;
  if (first instanceof Text) selection.collapse(first, 0);
  else selection.collapse(el, 0);
}

/** Selects the whole field, chips included (Chromium's own Ctrl+A leaves out a leading chip). */
function selectAll(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  ensureAnchors(el);
  const first = el.firstChild;
  const last = el.lastChild;
  if (first === null || last === null) return;
  const range = document.createRange();
  if (first instanceof Text) range.setStart(first, 0);
  else range.setStartBefore(first);
  if (last instanceof Text) range.setEnd(last, last.length);
  else range.setEndAfter(last);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The chip right before a collapsed caret in `el` (the caret may sit after its anchor), or null. */
function chipBeforeCaret(el: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!selection?.isCollapsed || !node || !el.contains(node)) return null;
  const at = selection.anchorOffset;
  let before: Node | null = null;
  if (node === el) before = el.childNodes[at - 1] ?? null;
  else if (node instanceof Text && visible(node.data.slice(0, at)) === '') {
    before = node.previousSibling;
  }
  return isChip(before) ? before : null;
}

/** Text without the caret anchors. */
function visible(text: string): string {
  return text.split(ANCHOR).join('');
}

/**
 * The visible character right before position (`container`, `offset`) in
 * `el`: '' at the start of the field, '#' for a chip (not a space).
 */
function charBefore(el: HTMLElement, container: Node, offset: number): string {
  let node: Node | null;
  if (container instanceof Text) {
    const head = visible(container.data.slice(0, offset));
    if (head !== '') return head.slice(-1);
    node = container.previousSibling;
  } else {
    node = container === el ? (el.childNodes[offset - 1] ?? null) : null;
  }
  for (; node !== null; node = node.previousSibling) {
    if (isChip(node)) return '#';
    if (node instanceof Text && visible(node.data) !== '') return visible(node.data).slice(-1);
  }
  return '';
}

/** Puts the caret right after chip number `index` of `el`. */
function caretAfterChip(el: HTMLElement, index: number): void {
  const selection = window.getSelection();
  const chip = el.querySelectorAll('.tok')[index];
  if (!selection || !chip) return;
  ensureAnchors(el);
  const next = chip.nextSibling;
  if (next instanceof Text) {
    selection.collapse(next, next.data.startsWith(ANCHOR) ? 1 : 0);
  }
}

function chipNode(raw: string): HTMLElement {
  const parts = parseToken(raw);
  const chip = document.createElement('span');
  chip.className = 'tok';
  chip.contentEditable = 'false';
  chip.dataset.token = raw;
  const key = document.createElement('span');
  key.className = 'tok-k';
  key.textContent = copy.text.chipLabel[parts?.key ?? ''] ?? parts?.key ?? raw;
  chip.append(key);
  if (parts?.many !== undefined) {
    const words = document.createElement('span');
    words.className = 'tok-w';
    words.textContent = parts.many;
    chip.append(words);
  }
  if (parts !== null && editableToken(parts)) chip.title = copy.text.chipHint;
  return chip;
}

function render(el: HTMLElement, template: string): void {
  el.replaceChildren();
  for (const seg of splitTemplate(template)) {
    el.append(seg.kind === 'text' ? document.createTextNode(seg.text) : chipNode(seg.raw));
  }
  // A chip that no text touches gets anchors, so the caret can sit on both sides of it.
  ensureAnchors(el);
}

function serialize(el: HTMLElement): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? '';
    else if (node instanceof HTMLElement && node.dataset.token !== undefined)
      out += node.dataset.token;
    else if (node instanceof HTMLElement && node.tagName !== 'BR') out += serialize(node);
  }
  return out
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/[\r\n]+/g, ' ');
}

/** A token field's insert handle (the All settings help strip inserts through it). */
export interface TokenHandle {
  insert: (token: string) => void;
  stopLabel: boolean;
}

/** The token field that has focus, if any. */
export const activeTokenField = signal<TokenHandle | null>(null);

/**
 * One-line chip editor for a text template. `set` receives the template
 * text; changes from outside (undo, reset) re-render the chips.
 */
export function TokenField({
  value,
  set,
  label,
  labelledBy,
  id,
  describedBy,
  placeholder,
  stopLabel = false,
  class: className = '',
  handleRef,
}: {
  value: string;
  set: (template: string) => void;
  label?: string;
  labelledBy?: string;
  id?: string;
  describedBy?: string;
  placeholder?: string;
  stopLabel?: boolean;
  class?: string;
  handleRef?: { current: TokenHandle | null };
}) {
  const ce = useRef<HTMLDivElement>(null);
  const last = useRef<string>(value);
  /** The latest selection inside the field: INSERT and the chip editor work at it after focus left. */
  const lastRange = useRef<Range | null>(null);
  const [chip, setChip] = useState<{ index: number; anchor: HTMLElement } | null>(null);
  const popId = useId();

  useEffect(() => {
    const onSelection = (): void => {
      const el = ce.current;
      const selection = window.getSelection();
      if (!el || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (el.contains(range.startContainer) && el.contains(range.endContainer)) {
        lastRange.current = range.cloneRange();
      }
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  // Layout effects, not effects: a deferred effect can run after the next
  // keystroke with the value of an earlier render and would then re-render
  // the field with stale text and move the caret to the start (fast typing
  // came out partly reversed). A layout effect runs right after the
  // render, before the next input event, so `value` is still the latest.
  useLayoutEffect(() => {
    if (ce.current) render(ce.current, value);
    last.current = value;
  }, []);

  useLayoutEffect(() => {
    const el = ce.current;
    if (!el || value === last.current) return;
    last.current = value;
    // Only rebuild when the field holds other text (undo, reset, a JSON edit).
    if (serialize(el) !== value) render(el, value);
  }, [value]);

  const commit = (): void => {
    const el = ce.current;
    if (!el) return;
    const next = serialize(el);
    if (next === last.current) return;
    last.current = next;
    set(next);
  };

  /** The caret's range in the field now, else the last one it had (focus moved to INSERT). */
  const caretRange = (el: HTMLElement): Range | null => {
    const selection = window.getSelection();
    const now = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (now && el.contains(now.startContainer) && el.contains(now.endContainer)) return now;
    const saved = lastRange.current;
    return saved && el.contains(saved.startContainer) && el.contains(saved.endContainer)
      ? saved
      : null;
  };

  const insert = (token: string): void => {
    const el = ce.current;
    if (!el) return;
    const node = chipNode(token);
    const selection = window.getSelection();
    const range = caretRange(el);
    if (range) {
      range.deleteContents();
      // A chip right after a word or another chip gets a space before it ("TEAM 1,190 KM").
      const before = charBefore(el, range.startContainer, range.startOffset);
      range.insertNode(node);
      if (before !== '' && !/\s/.test(before)) node.before(document.createTextNode(' '));
    } else {
      const text = serialize(el);
      if (text !== '' && !/\s$/.test(text)) el.append(document.createTextNode(' '));
      el.append(node);
    }
    // The caret goes after an anchor character, so it stays outside the chip.
    const anchor = document.createTextNode(ANCHOR);
    node.after(anchor);
    ensureAnchors(el);
    const after = document.createRange();
    after.setStart(anchor, 1);
    after.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(after);
    el.focus();
    commit();
  };

  const handle: TokenHandle = { insert, stopLabel };
  if (handleRef) handleRef.current = handle;

  const tokenAt = (index: number): TokenParts | null => {
    const tokens = splitTemplate(value).filter((s) => s.kind === 'token');
    const seg = tokens[index];
    return seg === undefined || seg.kind !== 'token' ? null : parseToken(seg.raw);
  };

  const replaceToken = (index: number, next: TokenParts): void => {
    let k = -1;
    const template = splitTemplate(value)
      .map((s) => {
        if (s.kind === 'text') return s.text;
        k += 1;
        return k === index ? buildToken(next) : s.raw;
      })
      .join('');
    last.current = template;
    if (ce.current) render(ce.current, template);
    set(template);
  };

  const parts = chip === null ? null : tokenAt(chip.index);
  return (
    <span class={`field tokens${className ? ` ${className}` : ''}`}>
      {/* biome-ignore lint/a11y/useSemanticElements: a one-line field that holds chips cannot be an input. */}
      <div
        ref={ce}
        id={id}
        class="ce"
        role="textbox"
        tabIndex={0}
        contentEditable
        aria-multiline="false"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        spellcheck={false}
        onInput={() => {
          if (ce.current) ensureAnchors(ce.current);
          commit();
        }}
        onFocus={() => {
          activeTokenField.value = handle;
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          // INSERT, its "More…" menu and the chip editor work on this field: it stays active and
          // keeps its caret. Leaving for anything else re-renders typed tokens as chips.
          const staying =
            next instanceof HTMLElement &&
            next.closest('[data-token-insert], .pop, .menu') !== null;
          if (staying) return;
          if (activeTokenField.peek() === handle) activeTokenField.value = null;
          if (ce.current) render(ce.current, last.current);
        }}
        onKeyDown={(event) => {
          const el = ce.current;
          if (!el) return;
          const mod = event.ctrlKey || event.metaKey;
          // Enter or Alt+Down right after a chip opens its editor; Enter never adds a line.
          if (event.key === 'Enter' || (event.altKey && event.key === 'ArrowDown')) {
            event.preventDefault();
            const before = chipBeforeCaret(el);
            const index = before === null ? -1 : [...el.querySelectorAll('.tok')].indexOf(before);
            const p = index < 0 ? null : tokenAt(index);
            if (before !== null && p !== null && editableToken(p)) {
              setChip({ index, anchor: before });
            }
            return;
          }
          // Chromium's Ctrl+A, Home and End stop at a chip that starts or ends the field.
          if (mod && !event.altKey && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            selectAll(el);
          } else if (event.key === 'Home' && !event.shiftKey && !mod) {
            event.preventDefault();
            caretToStart(el);
          } else if (event.key === 'End' && !event.shiftKey && !mod) {
            event.preventDefault();
            caretToEnd(el);
          } else if (event.key === 'Backspace' && backspaceAtAnchor()) {
            event.preventDefault();
            commit();
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/[\r\n]+/g, ' ');
          document.execCommand('insertText', false, text);
        }}
        onClick={(event) => {
          // A click right of the text (after a trailing chip) puts the caret at the end.
          if (ce.current && event.target === ce.current) {
            const content = document.createRange();
            content.selectNodeContents(ce.current);
            if (event.clientX >= content.getBoundingClientRect().right) caretToEnd(ce.current);
          }
          const target = event.target instanceof HTMLElement ? event.target.closest('.tok') : null;
          if (!(target instanceof HTMLElement) || !ce.current) return;
          const index = [...ce.current.querySelectorAll('.tok')].indexOf(target);
          const p = tokenAt(index);
          if (p !== null && editableToken(p)) {
            setChip({ index, anchor: target });
          }
        }}
      />
      {chip !== null && parts !== null && (
        <Popover
          anchor={chip.anchor}
          label={copy.text.chipEdit(copy.text.chipLabel[parts.key] ?? parts.key)}
          onClose={() => {
            const index = chip.index;
            setChip(null);
            // Back to the field, with the caret right after the chip that was edited.
            const el = ce.current;
            if (!el) return;
            el.focus();
            caretAfterChip(el, index);
          }}
        >
          <div class="chip-pop" id={popId}>
            {parts.many !== undefined ? (
              <>
                <div class="pop-row">
                  <span>{copy.text.count}</span>
                  <Select
                    options={COUNT_KEYS.map((k) => ({
                      value: k,
                      label: copy.enumLabels[k] ?? k,
                    }))}
                    value={parts.key as (typeof COUNT_KEYS)[number]}
                    set={(key) => replaceToken(chip.index, { ...parts, key })}
                    label={copy.text.count}
                  />
                </div>
                <div class="pop-row">
                  <span>{copy.text.one}</span>
                  <TextField
                    value={parts.one ?? ''}
                    set={(one) =>
                      replaceToken(chip.index, { ...parts, one: one.replace(/[{}|]/g, '') })
                    }
                    label={copy.text.one}
                  />
                </div>
                <div class="pop-row">
                  <span>{copy.text.many}</span>
                  <TextField
                    value={parts.many}
                    set={(many) =>
                      replaceToken(chip.index, { ...parts, many: many.replace(/[{}|]/g, '') })
                    }
                    label={copy.text.many}
                  />
                </div>
              </>
            ) : (
              <div class="pop-row">
                <span>{copy.text.digits}</span>
                <Seg
                  label={copy.text.digits}
                  options={[
                    { value: 1, label: '1' },
                    { value: 2, label: '01' },
                    { value: 3, label: '001' },
                  ]}
                  value={parts.width ?? 1}
                  set={(width) => replaceToken(chip.index, { key: parts.key, width })}
                />
              </div>
            )}
          </div>
        </Popover>
      )}
    </span>
  );
}

/** A token's value now, as the video prints it ("7", "1,190"), or '' when the stops have none. */
function liveValue(key: string, values: Record<string, number | undefined>, stops: number): string {
  if (key === 'n') return '1';
  if (key === 'total') return String(stops);
  const v = values[key];
  if (v === undefined) return '';
  return key === 'year' ? String(v) : v.toLocaleString('en-US');
}

/**
 * The INSERT row of a template field, on one line: the four most used tokens
 * as dashed chips, the rest under "More…" with their values. Each inserts at
 * the caret, with its noun ("7 STOPS"). `insert` works on the field that last
 * had the caret, which keeps it while focus is on these buttons.
 */
export function InsertRow({
  insert,
  stopLabel,
  class: className = '',
}: {
  insert: (token: string) => void;
  stopLabel: boolean;
  class?: string;
}) {
  const p = project.value;
  const tokens = insertTokens(p, stopLabel);
  const values = tokenValues(p) as Record<string, number | undefined>;
  const stops = p.stops.filter((s) => s.hidden !== true).length;
  const name = (key: string): string => copy.text.chipLabel[key] ?? key;
  const visible = tokens.slice(0, INSERT_VISIBLE);
  const more = tokens.slice(INSERT_VISIBLE);
  return (
    <div class={`tok-row${className ? ` ${className}` : ''}`} data-token-insert="">
      <span class="cap" aria-hidden="true">
        {copy.text.insert}
      </span>
      {visible.map(({ token, key }) => {
        const value = liveValue(key, values, stops);
        return (
          <button
            key={token}
            type="button"
            class="tok-btn"
            aria-label={copy.text.insertToken(name(key))}
            title={copy.text.insertHint(name(key), value)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(token)}
          >
            {name(key)}
          </button>
        );
      })}
      {more.length > 0 && (
        <span class="tok-more">
          <MenuButton
            keepFocus
            class="tok-btn"
            text={copy.text.more}
            label={copy.text.moreTokens}
            title={copy.text.moreTokens}
            align="start"
            items={more.map(({ token, key }) => {
              const value = liveValue(key, values, stops);
              return {
                kind: 'item' as const,
                label: name(key),
                hint: value === '' ? copy.text.noValue : value,
                name: copy.text.insertToken(name(key)),
                onSelect: () => insert(token),
              };
            })}
          />
        </span>
      )}
    </div>
  );
}
