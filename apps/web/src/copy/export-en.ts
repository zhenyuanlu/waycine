/**
 * The user-visible strings only the export dialog uses (English); strings it
 * shares with the rest of the app are in `en.ts`. Export components import
 * from these two tables and never inline copy.
 */

/** Pieces of the dialog's one-line summary. */
export interface SummaryParts {
  profile: string;
  aspect: string | null;
  width: number;
  height: number;
  fps: string;
  duration: string;
  size: string;
  /** File format in plain words (`MP4 (H.264)`), or null while the encoder is being checked. */
  format: string | null;
}

export const exportCopy = {
  close: 'Close',
  kicker: {
    setup: 'Export',
    progress: 'Exporting',
    done: 'Done',
    stopped: 'Stopped',
    failed: 'Failed',
  },
  title: 'Export video',
  progressTitle: 'Making your video',
  stoppedTitle: 'Export stopped',
  failedTitle: 'Export failed',
  privacy: 'Made on this device. Nothing is uploaded.',
  keepOpen: 'Keep this tab open. Rendering uses this computer’s graphics chip.',
  summary: (p: SummaryParts): string =>
    [
      p.aspect === null ? p.profile : `${p.profile} ${p.aspect}`,
      `${p.width} × ${p.height}`,
      `${p.fps} fps`,
      p.duration,
      `about ${p.size}`,
      p.format ?? 'checking the encoder…',
    ].join(' · '),
  /** File formats in plain words; the exact codec string is under "Technical details". */
  formats: {
    avc: 'MP4 (H.264)',
    vp9: 'WebM (VP9)',
    recordedMp4: 'MP4 (recorded)',
    recordedWebm: 'WebM (recorded)',
  },
  /** Container names as the Output row writes them ("A single MP4 file"). */
  containers: { mp4: 'MP4', webm: 'WebM' },
  tech: {
    label: 'Technical details',
    codec: (codec: string) => `Codec ${codec}, from a test encode at this size.`,
    checking: 'Codec: checking…',
  },
  profiles: {
    landscape: 'Landscape',
    portrait: 'Portrait',
    square: 'Square',
  },
  rows: {
    length: 'Length',
    format: 'Format',
    size: 'Size',
    quality: 'Quality',
    output: 'Output',
    smooth: 'Extra smooth',
    file: 'File',
  },
  lengthLine: (duration: string, parts: string) => `${duration} · ${parts}`,
  parts: {
    intro: 'intro',
    stops: (n: number) => (n === 1 ? '1 stop' : `${n} stops`),
    finale: 'finale',
  },
  /** The line under the Format choice: "Landscape · 29.97 fps". */
  formatNote: (profile: string, fps: string) => `${profile} · ${fps} fps`,
  size: {
    option: (shortSide: number) => (shortSide === 2160 ? '4K' : `${shortSide}p`),
    pixels: (width: number, height: number) => `${width} × ${height}`,
    unsupported: (codec: string) => `This browser cannot encode ${codec} at this size.`,
    codecName: { avc: 'H.264', vp9: 'VP9' },
    /** Stands in for the codec name in `unsupported` when no encoder route names one. */
    anyCodec: 'video',
  },
  quality: {
    names: { standard: 'Standard', high: 'High', max: 'Max' },
    estimate: (size: string) => `~${size}`,
    fixed: (mbps: number) => `Set by the project's bitrate (${mbps} Mbps).`,
  },
  output: {
    video: 'One video',
    videoHint: (format: string) => `A single ${format} file`,
    clips: 'Separate clips',
    clipsHint: (count: number, format: string) =>
      `A ZIP with ${count} ${format} files, one per segment`,
    clipsUnavailable: 'Separate clips need a video encoder, which this browser lacks.',
    clipsInsecure:
      'Separate clips need the fast encoder, which browsers allow only on https or localhost.',
  },
  smooth: {
    label: 'Extra smooth',
    hint: 'Renders twice the pixels; about 2× slower',
    tooLarge: (shortSide: number) =>
      `Not available at ${shortSide}p: the frame would be too large for the browser.`,
    recorder: 'Not available while the video is recorded in real time.',
  },
  fileLine: (size: string) => `about ${size}`,
  start: 'Export video',
  cancel: 'Cancel',
  checking: 'Checking what this browser can encode…',
  frameCaption: (n: string, total: string) => `Frame ${n} / ${total}`,
  still: {
    button: 'Save frame as PNG',
    working: (frame: number) => `Saving frame ${frame}…`,
    done: (frame: number, name: string) => `Saved frame ${frame} as ${name}.`,
    failed: 'The frame could not be saved as a PNG.',
  },
  banner: {
    large: (size: string) =>
      `This video will be about ${size}. The whole file is held in memory while it is made, so very large exports can fail on some devices; a smaller size or quality helps.`,
    smaller: (requested: number, chosen: number) =>
      `This browser cannot make a ${requested}p H.264 video. ${chosen}p is the largest size it can encode, so it is selected.`,
    webm: 'This browser cannot encode H.264 (MP4), so your video will be a WebM file (VP9). It plays in browsers and VLC, but some phones and editors cannot open it.',
    recorder:
      'This browser has no video encoder Waycine can use, so the video is recorded while it plays in real time. It may drop frames; keep this tab in front until it finishes.',
    recorderInsecure:
      'Browsers allow the fast video encoder only on https or localhost, and this page is plain http, so the video is recorded while it plays in real time. It may drop frames; keep this tab in front until it finishes.',
    unavailable:
      'This browser can’t make videos. Use Chrome or Edge 111 or later. You can still save single frames as PNG.',
  },
  running: {
    preparing: 'Preparing the encoder…',
    frameLine: (frame: number, total: number, where: string) =>
      where === '' ? `Frame ${frame} of ${total}` : `Frame ${frame} of ${total} · ${where}`,
    clip: (n: number, count: number) => `Clip ${n} of ${count}`,
    recording: 'Recording in real time',
    elapsed: (time: string) => `Elapsed ${time}`,
    left: (time: string) => `About ${time} left`,
    progressLabel: 'Export progress',
    thumbnailLabel: 'The frame being exported',
    announce: (percent: number) => `Export ${percent}% done`,
    cancel: 'Cancel export',
  },
  stopped: {
    line: (percent: number) => `Stopped at ${percent} %. Nothing was saved.`,
    close: 'Close',
    again: 'Start again',
  },
  done: {
    title: 'Your video is ready',
    titleClips: 'Your clips are ready',
    file: (size: string, duration: string) => ` · ${size} · ${duration}`,
    details: (format: string, width: number, height: number) => `${format} · ${width} × ${height}`,
    finished: (time: string) => `Finished in ${time}`,
    saved: 'Downloaded',
    tech: (codec: string, seconds: string, speed: string) =>
      `Codec ${codec || 'unknown'} · made in ${seconds} s (${speed}× real time)`,
    downloadAgain: 'Download again',
    done: 'Done',
    another: 'Export another size',
    play: 'Play it',
    hideVideo: 'Show the frame',
    videoLabel: 'Your exported video',
    share: 'Share…',
    shareTouch: 'Share / Save to Photos',
    shareFailed: 'Sharing did not work. Use "Download again" instead.',
  },
  error: {
    atFrame: (frame: number) => `Encoder failed at frame ${frame}.`,
    beforeStart: 'The encoder failed before the first frame.',
    hint: 'Smaller videos are easier on the encoder.',
    noWebCodecs:
      'This browser cannot encode video. Try a recent version of Chrome, Edge or Safari on a computer.',
    unsupported: 'This browser cannot encode this video at this size. Try a smaller size.',
    probeFailed: 'Waycine could not check whether this browser can encode video.',
    retry720: 'Retry at 720p',
    retry: 'Try again',
    copy: 'Copy details',
    copied: 'Details copied.',
    copyFailed: 'Could not copy. Open "Technical details" and select the text instead.',
    close: 'Close',
  },
} as const;
