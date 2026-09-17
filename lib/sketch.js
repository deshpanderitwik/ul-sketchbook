// Tiny shared helpers for sketches. No dependencies.

/**
 * Create a full-viewport canvas, handle devicePixelRatio and resize,
 * and run a draw loop. Returns a handle with { canvas, ctx, stop }.
 *
 * setup({ ctx, width, height })  called once and again after each resize
 * draw({ ctx, width, height, t, dt, frame })  called every animation frame
 */
export function createSketch({ setup, draw, parent = document.body } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.touchAction = 'none';
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const state = { canvas, ctx, width: 0, height: 0, t: 0, dt: 0, frame: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = Math.floor(state.width * dpr);
    canvas.height = Math.floor(state.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setup?.(state);
  }

  let raf = 0;
  let last = performance.now();
  function frame(now) {
    state.dt = (now - last) / 1000;
    state.t += state.dt;
    last = now;
    draw?.(state);
    state.frame++;
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    ...state,
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}

/** Seeded random (mulberry32). Same seed, same sequence. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const map = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const TAU = Math.PI * 2;
