import type { PlainObject } from './json.js';
import { SCHEMA_VERSION, type ValidationIssue } from './types.js';

/** Result of `migrateProject`. */
export interface MigrationResult {
  /** The input upgraded to the current schema version (a shallow copy; `version` set). */
  data: PlainObject;
  /** Version notes (never errors). */
  issues: ValidationIssue[];
}

/**
 * Ordered upgrade steps: `STEPS[v - 1]` turns a version-v object into
 * version v + 1. Version 1 is current, so there are none yet.
 */
const STEPS: readonly ((data: PlainObject) => PlainObject)[] = [];

/**
 * Brings a parsed project object to schema version `SCHEMA_VERSION`. Never
 * throws. Files from a newer Waycine are read as the current version (unknown
 * keys are kept by `validateProject`) with a warning.
 */
export function migrateProject(input: PlainObject): MigrationResult {
  const issues: ValidationIssue[] = [];
  const raw = input.version;
  let version = SCHEMA_VERSION as number;
  if (raw === undefined) {
    issues.push({
      level: 'warning',
      path: 'version',
      code: 'bad-version',
      message: `No schema version; read as version ${SCHEMA_VERSION}.`,
    });
  } else if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    issues.push({
      level: 'warning',
      path: 'version',
      code: 'bad-version',
      message: `Unrecognized schema version ${JSON.stringify(raw)}; read as version ${SCHEMA_VERSION}.`,
    });
  } else if (raw > SCHEMA_VERSION) {
    issues.push({
      level: 'warning',
      path: 'version',
      code: 'newer-version',
      message: `Made with a newer Waycine (schema version ${raw}). Settings this version does not know are kept but ignored.`,
    });
  } else {
    version = raw;
  }

  let data: PlainObject = { ...input };
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = STEPS[v - 1];
    if (step) {
      data = step(data);
    }
  }
  data.version = SCHEMA_VERSION;
  return { data, issues };
}
