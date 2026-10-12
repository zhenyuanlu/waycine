import { signal, useSignalEffect } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { drawScene, sceneAt } from 'waycine/browser';
import { errorDetail } from '../app/errors';
import { copy } from '../copy/en';
import { type EngineStage, engineState, renderError } from '../state/engine';
import { recordFrameTime, resetFrameTimes } from './adaptive';
import { frame, pause, playing } from './player';
import { activeSegmentLabel } from './segments';

/**
 * True while the paused preview shows a frame whose flash is held back
 * (the flash plays only in playback; the export is not affected).
 */
export const flashHeld = signal(false);

export function EngineErrorPanel({ stage, error }: { stage: EngineStage; error: unknown }) {
  return (
    <div class="engine-error" role="alert">
      <p class="err-t">{copy.engineError.title}</p>
      <p>{copy.engineError[stage]}</p>
      <p class="fnote">{copy.engineError.hint}</p>
      <details>
        <summary>{copy.engineError.detailsLabel}</summary>
        <pre>{errorDetail(error)}</pre>
      </details>
    </div>
  );
}

/**
 * The live preview canvas. Its CSS box is the frame box (sized by the page
 * grid, never by the canvas); the bitmap is the compiled preview size and is
 * contained in the box (`object-fit`), so a new format or resolution changes
 * pixels only, never layout.
 */
export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useSignalEffect(() => {
    const state = engineState.value;
    const index = frame.value;
    const live = playing.value;
    const canvas = canvasRef.current;
    if (!canvas || state.kind !== 'ready') {
      if (flashHeld.peek()) flashHeld.value = false;
      return;
    }
    const { compiled, backend } = state;
    try {
      if (canvas.width !== compiled.width || canvas.height !== compiled.height) {
        canvas.width = compiled.width;
        canvas.height = compiled.height;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('The browser did not give the preview a 2D canvas context.');
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const started = performance.now();
      let scene = sceneAt(compiled, index);
      // Paused or scrubbed: no flash on screen, only a tag saying it plays in playback.
      const held = !live && scene.post.flash > 0;
      if (held) scene = { ...scene, post: { ...scene.post, flash: 0 } };
      drawScene(ctx, compiled, scene, backend);
      if (flashHeld.peek() !== held) flashHeld.value = held;
      // Adaptive preview: slow frames while playing step the preview resolution down (adaptive.ts).
      if (live) recordFrameTime(performance.now() - started);
      else resetFrameTimes();
      canvas.dataset.frame = String(index);
      canvas.dataset.ready = 'true';
      if (renderError.peek() !== null) {
        renderError.value = null;
      }
    } catch (error) {
      pause();
      renderError.value = error;
    }
  });

  const label = activeSegmentLabel.value;
  return (
    <canvas
      ref={canvasRef}
      class="preview"
      role="img"
      aria-label={label === null ? copy.preview.canvasLoading : copy.preview.canvasLabel(label)}
    />
  );
}
