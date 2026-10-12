import { signal } from '@preact/signals';

/**
 * Bumped whenever font faces are (re)registered: the bundled fonts at start-up
 * and, later, other font bytes or a font the user uploads. The preview
 * recompiles on every bump, so no text width measured with an earlier face
 * survives (compiled width caches are per compile and keyed by font identity).
 */
export const fontsVersion = signal(0);
