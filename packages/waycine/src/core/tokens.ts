/**
 * Text templates: `{key}`, `{key:0W}` and `{key|ONE|MANY}` tokens (see
 * `TextSettings`). Tokens are replaced, never evaluated; unknown keys and
 * malformed tokens stay literal, keys without a value stay literal too unless
 * `dropMissing` asks to leave them out, and all other text (including
 * repeated spaces) is kept as is.
 */

/** Keys a template may use. */
export const TOKEN_KEYS = [
  'n',
  'total',
  'stops',
  'regions',
  'countries',
  'months',
  'days',
  'km',
  'mi',
  'year',
] as const;
/** A template key. */
export type TokenKey = (typeof TOKEN_KEYS)[number];
/** Values available to a template; a missing key leaves its tokens literal. */
export type TokenValues = Readonly<Partial<Record<TokenKey, number>>>;

const KEY_SET: ReadonlySet<string> = new Set<string>(TOKEN_KEYS);

/** `{key}`, `{key:0W}` or `{key|ONE|MANY}`; ONE and MANY may hold anything but braces and bars. */
const TOKEN = /\{([A-Za-z]+)(?::0(\d{1,2})|\|([^{}|]*)\|([^{}|]*))?\}/g;

const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const PLAIN = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3, useGrouping: false });

/** Formats a number for display with `Intl.NumberFormat('en-US')` ("2,340"). */
export function formatNumber(value: number): string {
  return GROUPED.format(value);
}

function formatValue(key: TokenKey, value: number): string {
  return key === 'year' ? PLAIN.format(value) : GROUPED.format(value);
}

function isTokenKey(key: string): key is TokenKey {
  return KEY_SET.has(key);
}

/** Options for `replaceTokens`. */
export interface ReplaceOptions {
  /**
   * Leave out tokens whose (known) key has no value, together with one
   * neighbouring separator ("/", "|", "," or a middle dot, with the spaces
   * around it): "8 CITIES  /  {countries} COUNTRIES  /  3,376 KM" keeps
   * "8 CITIES  /  3,376 KM" when no stop names a country. Default false: such
   * tokens stay literal.
   */
  dropMissing?: boolean;
}

/** Marks a dropped token until its separator is removed (a private-use character, never in real text). */
const DROPPED = '\ue000';
const DROPPED_WITH_SEPARATOR_BEFORE = /\s*[/|,\u00b7]\s*\ue000/;
const DROPPED_WITH_SEPARATOR_AFTER = /\ue000\s*[/|,\u00b7]\s*/;

/** Removes each dropped-token mark with one neighbouring separator (the one before it, else after it). */
function removeDropped(text: string): string {
  let out = text;
  while (out.includes(DROPPED)) {
    if (DROPPED_WITH_SEPARATOR_BEFORE.test(out)) {
      out = out.replace(DROPPED_WITH_SEPARATOR_BEFORE, '');
    } else if (DROPPED_WITH_SEPARATOR_AFTER.test(out)) {
      out = out.replace(DROPPED_WITH_SEPARATOR_AFTER, '');
    } else {
      out = out.replace(DROPPED, '');
    }
  }
  return out;
}

/** Known keys used by `template` that have no value in `values` (each once, in order). */
export function missingTokenKeys(template: string, values: TokenValues): TokenKey[] {
  const out: TokenKey[] = [];
  for (const m of template.matchAll(TOKEN)) {
    const key = m[1] ?? '';
    if (!isTokenKey(key) || out.includes(key)) {
      continue;
    }
    const value = values[key];
    if (value === undefined || !Number.isFinite(value)) {
      out.push(key);
    }
  }
  return out;
}

/** Replaces every token in `template` whose key has a value (see `ReplaceOptions` for the others). */
export function replaceTokens(
  template: string,
  values: TokenValues,
  opts: ReplaceOptions = {},
): string {
  let dropped = false;
  const replaced = template.replace(
    TOKEN,
    (match: string, key: string, width?: string, one?: string, many?: string): string => {
      if (!isTokenKey(key)) {
        return match;
      }
      const value = values[key];
      if (value === undefined || !Number.isFinite(value)) {
        if (opts.dropMissing === true) {
          dropped = true;
          return DROPPED;
        }
        return match;
      }
      if (width !== undefined) {
        const w = Number(width);
        const int = Math.round(Math.abs(value));
        return `${value < 0 ? '-' : ''}${String(int).padStart(w, '0')}`;
      }
      const text = formatValue(key, value);
      if (one !== undefined && many !== undefined) {
        return `${text} ${value === 1 ? one : many}`;
      }
      return text;
    },
  );
  return dropped ? removeDropped(replaced) : replaced;
}
