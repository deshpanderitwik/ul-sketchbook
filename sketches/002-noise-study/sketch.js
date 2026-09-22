// 002 noise study
// A grainy texture made of tiny particles. Each one drifts along a slowly
// evolving simplex noise field, glows by the noise value underneath it, and
// dissolves back into static when its life runs out.
// Touch or move the pointer to stir the grain.

import { createSketch, rng, TAU, clamp } from '../../lib/sketch.js';

const random = rng(2);

// --- 3D simplex noise (Gustavson), seeded ------------------------------------
const perm = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const G3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
const F3 = 1 / 3, G3c = 1 / 6;

function noise3(x, y, z) {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G3c;
  const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c;
  const x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c;
  const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let n = 0, tt, g;
  tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (tt > 0) { g = (perm[ii + perm[jj + perm[kk]]] % 12) * 3; tt *= tt; n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0); }
  tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (tt > 0) { g = (perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12) * 3; tt *= tt; n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1); }
  tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (tt > 0) { g = (perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12) * 3; tt *= tt; n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2); }
  tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (tt > 0) { g = (perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12) * 3; tt *= tt; n += tt * tt * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3); }
  return 32 * n; // roughly -1..1
}

// --- particles ---------------------------------------------------------------
// Everything lives in device pixels so each particle is a single real pixel.
const MAX = 140000;
const px = new Float32Array(MAX), py = new Float32Array(MAX);
const life = new Float32Array(MAX), span = new Float32Array(MAX);
let count = 0, W = 0, H = 0, dpr = 1;
let buf = null, image = null; // Float32 glow buffer + output ImageData
let pointer = null;

const SCALE = 0.0016;   // noise frequency per device pixel
const SPEED = 38;       // drift, device px per second
const DECAY = 0.82;     // how quickly the glow buffer falls back to black

function spawn(i) {
  px[i] = random() * W;
  py[i] = random() * H;
  span[i] = 1.5 + random() * 4;
  life[i] = 0;
}

function setPointer(e) {
  pointer = { x: e.clientX * dpr, y: e.clientY * dpr };
}
window.addEventListener('pointermove', setPointer);
window.addEventListener('pointerdown', setPointer);
window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer = null; });
window.addEventListener('pointerleave', () => { pointer = null; });

createSketch({
  setup({ canvas, ctx }) {
    W = canvas.width; H = canvas.height;
    dpr = W / window.innerWidth;
    buf = new Float32Array(W * H);
    image = ctx.createImageData(W, H);
    const d = image.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    count = Math.min(MAX, Math.floor((W * H) / 10));
    for (let i = 0; i < count; i++) {
      spawn(i);
      life[i] = random() * span[i]; // stagger so they don't all die together
    }
  },
  draw({ ctx, t, dt }) {
    dt = Math.min(dt, 1 / 20);
    const z = t * 0.08;
    const step = SPEED * dpr * dt;
    const pr = 140 * dpr, pr2 = pr * pr;

    for (let k = 0; k < buf.length; k++) buf[k] *= DECAY;

    for (let i = 0; i < count; i++) {
      let x = px[i], y = py[i];
      const nx = x * SCALE, ny = y * SCALE;

      // flow direction from one octave, brightness from a finer one
      const a = noise3(nx, ny, z) * TAU;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;

      if (pointer) {
        const dx = x - pointer.x, dy = y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < pr2 && d2 > 1) {
          const f = (1 - d2 / pr2) * 6 * step / Math.sqrt(d2);
          x += (dx - dy * 0.6) * f;
          y += (dy + dx * 0.6) * f;
        }
      }

      life[i] += dt;
      if (life[i] > span[i] || x < 0 || y < 0 || x >= W || y >= H) {
        spawn(i);
        continue;
      }
      px[i] = x; py[i] = y;

      // fade in and out over the particle's lifetime
      const u = life[i] / span[i];
      const env = u < 0.2 ? u / 0.2 : u > 0.7 ? (1 - u) / 0.3 : 1;
      const tone = noise3(nx * 3.1 + 17, ny * 3.1, z * 1.7) * 0.5 + 0.5;
      buf[(y | 0) * W + (x | 0)] += env * tone * tone * 0.9;
    }

    const d = image.data;
    for (let k = 0, j = 0; k < buf.length; k++, j += 4) {
      // gentle grain on top of the particle glow, then a warm off-white tint
      const v = clamp(buf[k] + (random() - 0.5) * 0.04, 0, 1) * 255;
      d[j] = v; d[j + 1] = v * 0.96; d[j + 2] = v * 0.88;
    }
    ctx.putImageData(image, 0, 0);
  },
});
