// 004 square burst
// A square of tiny particles. Every so often a ball tears through it and the
// square fractures like something brittle: shards tear away along cracks,
// spin off, and crumble into grain mid-flight. Then everything springs back
// and the square re-forms.
// Tap anywhere to throw a ball from there through the square.

import { createSketch, rng, TAU, clamp } from '../../lib/sketch.js';

const random = rng(4);
const gauss = () => (random() + random() + random() - 1.5) * 1.15;

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

// --- material ------------------------------------------------------------------
// The square is pre-cut into irregular shards (a jittered Voronoi), each with its
// own toughness, and laced with crack lines from ridged noise. When a ball is
// thrown, the whole fracture is worked out once: which particles break, when,
// and which way they fly. Per frame, particles just wait for their moment.
const MAX = 90000;
const MAX_PIXELS = 1.2e6; // internal resolution cap, keeps the pixel pass cheap
const SHARDS = 9;         // shards per side of the square (roughly)

const hx = new Float32Array(MAX), hy = new Float32Array(MAX); // home
const px = new Float32Array(MAX), py = new Float32Array(MAX);
const vx = new Float32Array(MAX), vy = new Float32Array(MAX);
const kx = new Float32Array(MAX), ky = new Float32Array(MAX); // velocity on break
const breakAt = new Float32Array(MAX).fill(Infinity);
const reach = new Float32Array(MAX); // crack lines and grain toughness
const shard = new Uint16Array(MAX);
const loose = new Uint8Array(MAX);
const wait = new Float32Array(MAX);
const pull = new Float32Array(MAX);

const NS = SHARDS * SHARDS;
const sx = new Float32Array(NS), sy = new Float32Array(NS); // seed points
const cx = new Float32Array(NS), cy = new Float32Array(NS); // centroids
const tough = new Float32Array(NS);
const sBurst = new Float32Array(NS), sCarry = new Float32Array(NS);
const sgx = new Float32Array(NS), sgy = new Float32Array(NS), spin = new Float32Array(NS);

let count = 0, W = 0, H = 0, scale = 1, side = 0, busy = 0;
let buf = null, image = null, out = null;
let balls = [];
let rest = 1.2; // seconds until the next automatic ball
let now = 0;

const DECAY = 0.8;      // glow buffer falloff per frame
const DRAG = 1.6;       // velocity loss per second while flying
const SPRING = 26;      // pull toward home once returning
const RETURN_AFTER = 1.6;

// warm off-white ramp, packed as little-endian RGBA
const LUT = new Uint32Array(256);
for (let v = 0; v < 256; v++) {
  LUT[v] = ((255 << 24) | (((v * 0.88) | 0) << 16) | (((v * 0.96) | 0) << 8) | v) >>> 0;
}

function throwBall(fromX, fromY, toX, toY) {
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const s = Math.max(W, H) * 1.1;
  const Dx = dx / len, Dy = dy / len; // travel direction
  const Nx = -Dy, Ny = Dx;            // normal to the path
  const b = { x: fromX, y: fromY, vx: Dx * s, vy: Dy * s, r: side * (0.07 + random() * 0.05) };
  balls.push(b);

  // how each shard reacts: a shove away from the path, some drag along it,
  // a random lurch and a spin
  for (let c = 0; c < NS; c++) {
    sBurst[c] = s * (0.1 + random() * 0.35);
    sCarry[c] = s * (0.08 + random() * 0.4);
    sgx[c] = gauss() * s * 0.09;
    sgy[c] = gauss() * s * 0.09;
    spin[c] = gauss() * 7;
  }

  const wave = side * 1.4; // how fast the fracture spreads away from the path
  const rough = 11 / side;
  for (let i = 0; i < count; i++) {
    if (loose[i]) continue;
    const rx = hx[i] - fromX, ry = hy[i] - fromY;
    const along = rx * Dx + ry * Dy;
    const perp = rx * Nx + ry * Ny;
    const d = Math.abs(perp);
    const c = shard[i];

    // a shard whose middle is close enough to the path goes as one piece;
    // otherwise only a ragged fringe and the fault lines give way
    const dc = Math.abs((cx[c] - fromX) * Nx + (cy[c] - fromY) * Ny);
    const whole = dc < b.r * 1.1 * tough[c];
    const dr = d + noise3(hx[i] * rough, hy[i] * rough, 3) * b.r * 0.9;
    const R = b.r * 0.9 * tough[c] * reach[i];
    if (!whole && dr >= R) continue;
    const hit = clamp(1 - d / (b.r * 2.5), 0, 1);
    const q = whole ? 0 : clamp(dr / R, 0, 1);
    const when = now + along / s + d / wave + (q * q * 0.45 + 0.04) * random();
    if (when >= breakAt[i]) continue;
    breakAt[i] = when;
    const side_ = perp < 0 ? -1 : 1;
    const burst = sBurst[c] * (0.5 + hit);
    const carry = sCarry[c] * (0.4 + hit);
    const ox = hx[i] - cx[c], oy = hy[i] - cy[c];
    kx[i] = Nx * side_ * burst + Dx * carry + sgx[c] - oy * spin[c] + gauss() * s * 0.012;
    ky[i] = Ny * side_ * burst + Dy * carry + sgy[c] + ox * spin[c] + gauss() * s * 0.012;
  }
}

function autoBall() {
  // come in from off screen at a random angle, aimed a little off centre
  const a = random() * TAU;
  const far = Math.hypot(W, H) * 0.6;
  const tx = W / 2 + gauss() * side * 0.2, ty = H / 2 + gauss() * side * 0.2;
  throwBall(tx - Math.cos(a) * far, ty - Math.sin(a) * far, tx, ty);
}

window.addEventListener('pointerdown', (e) => {
  if (!W) return;
  const x = e.clientX * scale, y = e.clientY * scale;
  // aim at the square; a tap on the square itself throws from far away
  const tx = W / 2 + gauss() * side * 0.15, ty = H / 2 + gauss() * side * 0.15;
  if (Math.hypot(x - tx, y - ty) < side * 0.4) {
    const a = random() * TAU;
    const far = Math.hypot(W, H);
    throwBall(x - Math.cos(a) * far, y - Math.sin(a) * far, x, y);
  } else {
    throwBall(x, y, tx, ty);
  }
});

createSketch({
  setup({ canvas, ctx }) {
    // render below device resolution on big screens; CSS stretches it back up
    const cssW = window.innerWidth, cssH = window.innerHeight;
    scale = Math.min(canvas.width / cssW, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
    W = canvas.width = Math.floor(cssW * scale);
    H = canvas.height = Math.floor(cssH * scale);
    buf = new Float32Array(W * H);
    image = ctx.createImageData(W, H);
    out = new Uint32Array(image.data.buffer);

    side = Math.min(W, H) * 0.42;
    const x0 = (W - side) / 2, y0 = (H - side) / 2;
    const cell = side / SHARDS;
    for (let c = 0; c < NS; c++) {
      sx[c] = x0 + ((c % SHARDS) + 0.1 + random() * 0.8) * cell;
      sy[c] = y0 + (Math.floor(c / SHARDS) + 0.1 + random() * 0.8) * cell;
      tough[c] = 0.4 + random() * random() * 1.8;
      cx[c] = cy[c] = 0;
    }
    const members = new Uint32Array(NS);

    count = Math.min(MAX, Math.floor(side * side * 0.7));
    const cols = Math.ceil(Math.sqrt(count));
    const grid = side / cols;
    const f = 4.5 / side;
    for (let i = 0; i < count; i++) {
      const x = x0 + ((i % cols) + random()) * grid;
      const y = y0 + (Math.floor(i / cols) + random()) * grid;
      hx[i] = px[i] = x; hy[i] = py[i] = y;
      vx[i] = vy[i] = 0; loose[i] = 0; breakAt[i] = Infinity;

      // nearest shard seed among the neighbouring cells
      const gx = clamp(Math.floor((x - x0) / cell), 0, SHARDS - 1);
      const gy = clamp(Math.floor((y - y0) / cell), 0, SHARDS - 1);
      let best = 0, bd = Infinity;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const qx = gx + ox, qy = gy + oy;
          if (qx < 0 || qy < 0 || qx >= SHARDS || qy >= SHARDS) continue;
          const c = qy * SHARDS + qx;
          const dd = (sx[c] - x) ** 2 + (sy[c] - y) ** 2;
          if (dd < bd) { bd = dd; best = c; }
        }
      }
      shard[i] = best;
      cx[best] += x; cy[best] += y; members[best]++;

      // thin ridges of noise are fault lines: damage runs much further along them
      const n = Math.abs(noise3(x * f, y * f, 11));
      const ridge = 1 - clamp(n / 0.06, 0, 1);
      reach[i] = (1 + ridge * 3) * (0.85 + random() * 0.3);
    }
    for (let c = 0; c < NS; c++) if (members[c]) { cx[c] /= members[c]; cy[c] /= members[c]; }
    busy = 0;
    balls = [];
  },
  draw({ ctx, t, dt }) {
    dt = Math.min(dt, 1 / 20);
    now = t;

    // next automatic ball once the square has settled
    if (!balls.length && busy === 0) {
      rest -= dt;
      if (rest <= 0) { autoBall(); rest = 1.2 + random() * 1.2; }
    }

    for (const b of balls) { b.x += b.vx * dt; b.y += b.vy * dt; }
    const margin = Math.hypot(W, H);
    balls = balls.filter((b) => Math.abs(b.x - W / 2) < margin && Math.abs(b.y - H / 2) < margin);

    const drag = Math.exp(-DRAG * dt);
    busy = 0;
    for (let i = 0; i < count; i++) {
      let x = px[i], y = py[i];

      if (!loose[i]) {
        if (breakAt[i] <= t) {
          loose[i] = 1; breakAt[i] = Infinity;
          vx[i] = kx[i]; vy[i] = ky[i];
          wait[i] = RETURN_AFTER + Math.random() * 1.6;
          pull[i] = 0;
        } else {
          if (breakAt[i] !== Infinity) busy++;
          // a pixel of shimmer keeps the resting square alive
          const qx = (x + Math.random() * 2 - 1) | 0, qy = (y + Math.random() * 2 - 1) | 0;
          if (qx >= 0 && qy >= 0 && qx < W && qy < H) buf[qy * W + qx] += 0.5;
          continue;
        }
      }
      busy++;

      // flying: drag and the odd random twitch as shards crumble, then home
      vx[i] *= drag; vy[i] *= drag;
      if (Math.random() < 0.02) {
        const sp = (Math.abs(vx[i]) + Math.abs(vy[i])) * 0.6;
        vx[i] += (Math.random() - 0.5) * sp; vy[i] += (Math.random() - 0.5) * sp;
      }
      wait[i] -= dt;
      if (wait[i] < 0) {
        pull[i] = Math.min(1, pull[i] + dt * 0.8);
        const k = SPRING * pull[i] * pull[i];
        const c = 2 * Math.sqrt(k);
        vx[i] += ((hx[i] - x) * k - vx[i] * c) * dt;
        vy[i] += ((hy[i] - y) * k - vy[i] * c) * dt;
      }
      const ox = x, oy = y;
      x += vx[i] * dt; y += vy[i] * dt;
      if (x < 0) { x = -x; vx[i] *= -0.5; } else if (x >= W) { x = 2 * W - x - 1; vx[i] *= -0.5; }
      if (y < 0) { y = -y; vy[i] *= -0.5; } else if (y >= H) { y = 2 * H - y - 1; vy[i] *= -0.5; }
      x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1);

      const dhx = hx[i] - x, dhy = hy[i] - y;
      if (pull[i] >= 1 && dhx * dhx + dhy * dhy < 0.5 && vx[i] * vx[i] + vy[i] * vy[i] < 25) {
        x = hx[i]; y = hy[i]; vx[i] = vy[i] = 0; loose[i] = 0;
      }
      px[i] = x; py[i] = y;

      // short streak so fast debris reads as motion
      const len = Math.abs(x - ox) + Math.abs(y - oy);
      const n = len < 3 ? 1 : len < 6 ? 2 : len < 9 ? 3 : 4;
      const tone = (0.5 + Math.min(0.6, len * 0.02)) / n;
      for (let s = 1; s <= n; s++) {
        const u = s / n;
        buf[((oy + (y - oy) * u) | 0) * W + ((ox + (x - ox) * u) | 0)] += tone;
      }
    }

    // one pass: glow buffer to pixels, then fade it
    for (let k = 0; k < buf.length; k++) {
      const v = buf[k];
      out[k] = LUT[v >= 1 ? 255 : (v * 255) | 0];
      buf[k] = v < 0.004 ? 0 : v * DECAY;
    }
    ctx.putImageData(image, 0, 0);

    // the ball itself, drawn on top
    for (const b of balls) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.8);
      g.addColorStop(0, 'rgba(255,250,240,1)');
      g.addColorStop(0.5, 'rgba(255,245,230,0.95)');
      g.addColorStop(0.56, 'rgba(255,240,220,0.25)');
      g.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.8, 0, TAU);
      ctx.fill();
    }
  },
});
