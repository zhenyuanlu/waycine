import { type ValidationIssue, validateProject, type WaycineProject } from 'waycine';
import { compactProject } from './compact';
import { readJson, STORAGE_KEYS } from './storage';

/** Where the current project came from. */
export type Origin =
  | { kind: 'preset'; id: string }
  | { kind: 'blank' }
  | { kind: 'own-stops' }
  | { kind: 'file'; name: string }
  | { kind: 'share' }
  | { kind: 'recent' };

/** A project with the reference it is compared against (changed-value dots, resets). */
export interface Snapshot {
  project: WaycineProject;
  base: WaycineProject;
  origin: Origin;
}

/** Autosave record, as stored. */
interface StoredSnapshot {
  version: 1;
  project: unknown;
  base: unknown;
  origin: Origin;
  savedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOrigin(value: unknown): value is Origin {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'preset':
      return typeof value.id === 'string';
    case 'file':
      return typeof value.name === 'string';
    case 'blank':
    case 'own-stops':
    case 'share':
    case 'recent':
      return true;
    default:
      return false;
  }
}

/** The stored form of a snapshot (compact projects). */
export function serializeSnapshot(snapshot: Snapshot, savedAt: string): StoredSnapshot {
  return {
    version: 1,
    project: compactProject(snapshot.project),
    base: compactProject(snapshot.base),
    origin: snapshot.origin,
    savedAt,
  };
}

/** A stored snapshot as read back, with what validating its project reported. */
export interface ParsedSnapshot extends Snapshot {
  /** Issues of the project (not of its base): a value dropped or changed shows here. */
  issues: ValidationIssue[];
}

/** A snapshot from its stored form, or null when it is missing or unusable. */
export function parseSnapshot(raw: unknown): ParsedSnapshot | null {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.project)) return null;
  const { project, issues } = validateProject(raw.project);
  const base = isRecord(raw.base) ? validateProject(raw.base).project : project;
  const origin = isOrigin(raw.origin) ? raw.origin : { kind: 'recent' as const };
  return { project, base, origin, issues };
}

/** The autosaved snapshot of this browser, or null (first visit, or nothing usable). */
export function readAutosave(): ParsedSnapshot | null {
  return parseSnapshot(readJson(STORAGE_KEYS.autosave));
}
