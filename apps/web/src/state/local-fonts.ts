import { signal } from '@preact/signals';
import { BUNDLED_FONTS, type FontRef, type WaycineProject } from 'waycine';
import { fontsVersion } from './fonts-version';
import type { FontRole } from './paths';
import { project, setValue } from './project';

/**
 * Fonts uploaded on this device. The file stays in this browser's IndexedDB
 * (nothing is uploaded anywhere) and is registered as a FontFace under a
 * private alias family per upload (`WaycineLocal_<id>`); the project records
 * `source: 'local'` and the id. A project opened on another device (a share
 * link or a file) lacks the font: the app then draws that role with the
 * bundled font and says so.
 */

const DB_NAME = 'waycine';
const STORE = 'fonts';

/** A stored font file. */
export interface StoredFont {
  id: string;
  /** File name as uploaded. */
  name: string;
  bytes: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB is not available.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    });
  } finally {
    db.close();
  }
}

async function getStoredFont(id: string): Promise<StoredFont | undefined> {
  return (await withStore('readonly', (store) => store.get(id))) as StoredFont | undefined;
}

async function putStoredFont(font: StoredFont): Promise<void> {
  await withStore('readwrite', (store) => store.put(font));
}

/** Alias family of an uploaded font. */
export function localFamily(id: string): string {
  return `WaycineLocal_${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/** File names of fonts registered in this session, by id. */
export const localFontNames = signal<ReadonlyMap<string, string>>(new Map());
/** Roles whose uploaded font is not on this device (drawn with the bundled font instead). */
export const missingFontRoles = signal<ReadonlySet<FontRole>>(new Set());

const registered = new Set<string>();

async function register(id: string, name: string, bytes: ArrayBuffer): Promise<void> {
  const face = new FontFace(localFamily(id), bytes);
  await face.load();
  document.fonts.add(face);
  registered.add(id);
  const names = new Map(localFontNames.peek());
  names.set(id, name);
  localFontNames.value = names;
  fontsVersion.value += 1;
}

function newId(): string {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}${Array.from(random, (n) => n.toString(36)).join('')}`;
}

/** Why an upload failed. */
export class FontUploadError extends Error {}

/**
 * Stores and registers an uploaded TTF/OTF and makes it the font of `role`.
 * Its width scale resets to 1 (the calibration of the previous font does not
 * apply to another one), as the CLI's `--font` does.
 */
export async function uploadFont(role: FontRole, file: File): Promise<void> {
  const bytes = await file.arrayBuffer();
  const id = newId();
  try {
    await register(id, file.name, bytes);
  } catch {
    throw new FontUploadError(file.name);
  }
  try {
    await putStoredFont({ id, name: file.name, bytes });
  } catch {
    // Not stored (private window): the font works until the page closes.
  }
  const current = project.peek().fonts[role];
  const next: FontRef = {
    family: localFamily(id),
    weight: current.weight,
    source: 'local',
    sizeAdjust: current.sizeAdjust,
    widthAdjust: 1,
    localId: id,
  };
  setValue(`fonts.${role}`, next);
  refreshMissing(project.peek());
}

/** Goes back to the bundled font for `role` (width scale 1). */
export function resetToBundledFont(role: FontRole): void {
  const bundled = BUNDLED_FONTS[role];
  const current = project.peek().fonts[role];
  setValue(`fonts.${role}`, {
    family: bundled.family,
    weight: bundled.weight,
    source: 'bundled',
    sizeAdjust: current.sizeAdjust,
    widthAdjust: 1,
  } satisfies FontRef);
}

function refreshMissing(p: WaycineProject): void {
  const missing = new Set<FontRole>();
  for (const role of ['display', 'body'] as const) {
    const ref = p.fonts[role];
    if (ref.source === 'local' && !registered.has(ref.localId ?? '')) missing.add(role);
  }
  const before = missingFontRoles.peek();
  if (missing.size !== before.size || [...missing].some((r) => !before.has(r))) {
    missingFontRoles.value = missing;
  }
}

const loading = new Set<string>();

/**
 * Makes sure the uploaded fonts `p` names are registered: loads them from
 * IndexedDB when stored here, else marks their roles missing.
 */
export function ensureLocalFonts(p: WaycineProject): void {
  refreshMissing(p);
  for (const role of ['display', 'body'] as const) {
    const ref = p.fonts[role];
    const id = ref.localId;
    if (ref.source !== 'local' || id === undefined || registered.has(id) || loading.has(id))
      continue;
    loading.add(id);
    getStoredFont(id)
      .then(async (font) => {
        if (font !== undefined) await register(font.id, font.name, font.bytes);
      })
      .catch(() => undefined)
      .finally(() => {
        loading.delete(id);
        refreshMissing(project.peek());
      });
  }
}

/**
 * The project the preview and export draw: roles whose uploaded font is
 * missing on this device use the bundled font instead (the project itself
 * keeps naming the uploaded one).
 */
export function withFallbackFonts(
  p: WaycineProject,
  missing: ReadonlySet<FontRole>,
): WaycineProject {
  if (missing.size === 0) return p;
  const fonts = { ...p.fonts };
  for (const role of missing) {
    const bundled = BUNDLED_FONTS[role];
    fonts[role] = {
      family: bundled.family,
      weight: bundled.weight,
      source: 'bundled',
      sizeAdjust: p.fonts[role].sizeAdjust,
      widthAdjust: p.fonts[role].widthAdjust,
    };
  }
  return { ...p, fonts };
}
