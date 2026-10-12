/**
 * The Mediabunny pieces the exporter and the probe use. The main thread
 * imports this module lazily (`await import('./mediabunny.js')`) instead of
 * the package itself, so bundlers can tree-shake the rest of Mediabunny
 * (demuxers, input formats, other containers) out of the export chunk; the
 * export worker imports it statically (its whole bundle loads on export).
 */
export {
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  NullTarget,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
