// 003 square dissolve
// A square of tiny particles distorts, smears out into a drifting noise field,
// then converges back into the square. Loops forever.
// Hold a finger or the mouse button down to keep it dissolved; let go and it
// pulls back together.

import { createSketch, rng, TAU, clamp, lerp } from '../../lib/sketch.js';

const random = rng(3);

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
// Each particle has a home inside the square and a wanderer out in the field;
// what gets drawn is a blend between the two.
const MAX = 120000;
const hx = new Float32Array(MAX), hy = new Float32Array(MAX); // home in square
const fx = new Float32Array(MAX), fy = new Float32Array(MAX); // field wanderer
const delay = new Float32Array(MAX);                          // 0..1 stagger
let count = 0, W = 0, H = 0, dpr = 1;
let buf = null, image = null;
let held = false;

const SCALE = 0.0016;   // noise frequency per device pixel
const SPEED = 38;       // field drift, device px per second
const DECAY = 0.82;     // glow buffer falloff per frame
const STAGGER = 0.7;    // how spread out in time the particles' departures are

// Loop timing in seconds: square, dissolve, field, converge.
const HOLD = 2, OUT = 3.5, FIELD = 2.5, BACK = 3.5;
const CYCLE = HOLD + OUT + FIELD + BACK;

const smooth = (e) => e * e * (3 - 2 * e);

function cycleTarget(t) {
  const c = t % CYCLE;
  if (c < HOLD) return 0;
  if (c < HOLD + OUT) return (c - HOLD) / OUT;
  if (c < HOLD + OUT + FIELD) return 1;
  return 1 - (c - HOLD - OUT - FIELD) / BACK;
}

window.addEventListener('pointerdown', () => { held = true; });
window.addEventListener('pointerup', () => { held = false; });
window.addEventListener('pointercancel', () => { held = false; });

let g = 0; // global dissolve amount, 0 = square, 1 = field

createSketch({
  setup({ canvas, ctx }) {
    W = canvas.width; H = canvas.height;
    dpr = W / window.innerWidth;
    buf = new Float32Array(W * H);
    image = ctx.createImageData(W, H);
    const d = image.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;

    const side = Math.min(W, H) * 0.42;
    const x0 = (W - side) / 2, y0 = (H - side) / 2;
    count = Math.min(MAX, Math.floor(side * side * 0.9));
    // jittered grid so the square fills evenly
    const cols = Math.ceil(Math.sqrt(count));
    const cell = side / cols;
    for (let i = 0; i < count; i++) {
      hx[i] = x0 + ((i % cols) + random()) * cell;
      hy[i] = y0 + (Math.floor(i / cols) + random()) * cell;
      fx[i] = random() * W;
      fy[i] = random() * H;
      // patches of the square let go together, edges a little before the core
      const n = noise3(hx[i] * 0.004, hy[i] * 0.004, 7) * 0.5 + 0.5;
      const edge = Math.max(Math.abs(hx[i] - W / 2), Math.abs(hy[i] - H / 2)) / (side / 2);
      delay[i] = clamp(n * 0.75 + (1 - edge) * 0.25 + (random() - 0.5) * 0.15, 0, 1);
    }
  },
  draw({ ctx, t, dt }) {
    dt = Math.min(dt, 1 / 20);
    const z = t * 0.08;
    const step = SPEED * dpr * dt;
    const warp = Math.min(W, H) * 0.12;

    // ease the global amount toward its target so holding and releasing glide
    const target = held ? 1 : cycleTarget(t);
    g += clamp(target - g, -dt / 2, dt / 2);

    for (let k = 0; k < buf.length; k++) buf[k] *= DECAY;

    for (let i = 0; i < count; i++) {
      // the wanderer always drifts through the field, wrapping at the edges
      let x = fx[i], y = fy[i];
      const a = noise3(x * SCALE, y * SCALE, z) * TAU;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      if (x < 0) x += W; else if (x >= W) x -= W;
      if (y < 0) y += H; else if (y >= H) y -= H;
      fx[i] = x; fy[i] = y;

      const e = smooth(clamp(g * (1 + STAGGER) - delay[i] * STAGGER, 0, 1));
      let px, py, tone;
      if (e === 0) {
        // a pixel of shimmer keeps the resting square alive
        px = hx[i] + (random() - 0.5) * 2; py = hy[i] + (random() - 0.5) * 2; tone = 1;
      } else {
        // distortion peaks halfway, so the square bends before it lets go
        const bend = Math.sin(e * Math.PI) * warp;
        const nx = hx[i] * SCALE * 1.5, ny = hy[i] * SCALE * 1.5;
        px = lerp(hx[i], x, e) + noise3(nx, ny, z * 3) * bend;
        py = lerp(hy[i], y, e) + noise3(nx + 31, ny, z * 3) * bend;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const f = noise3(x * SCALE * 3.1 + 17, y * SCALE * 3.1, z * 1.7) * 0.5 + 0.5;
        tone = lerp(1, f * f * 1.6, e);
      }
      buf[(py | 0) * W + (px | 0)] += tone * 0.5;
    }

    const d = image.data;
    for (let k = 0, j = 0; k < buf.length; k++, j += 4) {
      const v = clamp(buf[k] + (random() - 0.5) * 0.04, 0, 1) * 255;
      d[j] = v; d[j + 1] = v * 0.96; d[j + 2] = v * 0.88;
    }
    ctx.putImageData(image, 0, 0);
  },
});
