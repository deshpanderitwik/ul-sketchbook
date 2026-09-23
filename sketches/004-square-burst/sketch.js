// 004 square burst
// A square of tiny grains. Every so often a heavy ball ploughs through it.
// The grains behave like sand on a table: the ball shoves them aside, packed
// grains push on their neighbours, momentum spreads through the pile, and
// sliding friction brings everything to a stop. Then it all rewinds home.
// Tap anywhere to throw a ball from there through the square.
//
// Physics is a small particle-in-cell scheme: each frame grains splat mass
// and momentum onto a coarse grid, the grid turns over-packing into pressure
// (push only, sand has no glue), and grains read back the pressure force and
// the local average velocity, which is what makes neighbours drag each other.

import { createSketch, rng, TAU, clamp } from '../../lib/sketch.js';

const random = rng(4);
const gauss = () => (random() + random() + random() - 1.5) * 1.15;

const MAX = 90000;
const MAX_PIXELS = 1.2e6; // internal resolution cap, keeps the pixel pass cheap
const CELL = 4;           // grid cell size in canvas px

// Tuning, in units of the square's side length so any screen size behaves alike.
const BALL_SPEED = 5;     // sides per second
const PRESSURE = 12;      // push from over-packing, sides/s^2 per unit overpressure
const PUSH_MAX = 14;      // cap on that acceleration, keeps the solver stable
const FRICTION = 9;       // sliding friction deceleration, sides/s^2
const SHARE = 10;         // how quickly a grain matches moving neighbours' velocity
const KNOCK = 0.35;       // moving grains per cell needed to knock a resting one loose
const RESTITUTION = 0.5;  // bounce off the ball
const WAKE_SPEED = 0.06;  // neighbours moving this fast (sides/s) wake a grain
const SETTLE = 1.1;       // seconds after the last hit before rewinding

const hx = new Float32Array(MAX), hy = new Float32Array(MAX); // home
const px = new Float32Array(MAX), py = new Float32Array(MAX);
const vx = new Float32Array(MAX), vy = new Float32Array(MAX);
const state = new Uint8Array(MAX); // 0 asleep at home, 1 loose, 2 rewinding
const r0x = new Float32Array(MAX), r0y = new Float32Array(MAX); // rewind start
const rT = new Float32Array(MAX), rDur = new Float32Array(MAX), arc = new Float32Array(MAX);

let count = 0, W = 0, H = 0, scale = 1, side = 0;
let GW = 0, GH = 0, rho0 = 1;
let gm, gmm, gmx, gmy, gvx, gvy, gp, gfx, gfy, wake;
let buf = null, image = null, out = null;
let balls = [];
let rest = 1.2, lastHit = -Infinity, moving = 0, rewinding = 0;

const DECAY = 0.72; // glow buffer falloff per frame

const LUT = new Uint32Array(256); // warm off-white ramp, little-endian RGBA
for (let v = 0; v < 256; v++) {
  LUT[v] = ((255 << 24) | (((v * 0.88) | 0) << 16) | (((v * 0.96) | 0) << 8) | v) >>> 0;
}

function throwBall(fromX, fromY, toX, toY) {
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const s = side * BALL_SPEED;
  balls.push({
    x: fromX, y: fromY, lx: fromX, ly: fromY,
    vx: (dx / len) * s, vy: (dy / len) * s,
    r: side * (0.09 + random() * 0.06),
  });
}

function autoBall() {
  const a = random() * TAU;
  const far = Math.hypot(W, H) * 0.6;
  const tx = W / 2 + gauss() * side * 0.2, ty = H / 2 + gauss() * side * 0.2;
  throwBall(tx - Math.cos(a) * far, ty - Math.sin(a) * far, tx, ty);
}

window.addEventListener('pointerdown', (e) => {
  if (!W) return;
  const x = e.clientX * scale, y = e.clientY * scale;
  const tx = W / 2 + gauss() * side * 0.15, ty = H / 2 + gauss() * side * 0.15;
  if (Math.hypot(x - tx, y - ty) < side * 0.4) {
    const a = random() * TAU;
    const far = Math.hypot(W, H);
    throwBall(x - Math.cos(a) * far, y - Math.sin(a) * far, x, y);
  } else {
    throwBall(x, y, tx, ty);
  }
});

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

function startRewind(t) {
  let far = 1;
  for (let i = 0; i < count; i++) {
    if (state[i] !== 1) continue;
    far = Math.max(far, Math.abs(px[i] - hx[i]) + Math.abs(py[i] - hy[i]));
  }
  for (let i = 0; i < count; i++) {
    if (state[i] !== 1) continue;
    const d = Math.abs(px[i] - hx[i]) + Math.abs(py[i] - hy[i]);
    state[i] = 2;
    r0x[i] = px[i]; r0y[i] = py[i];
    rT[i] = t + (d / far) * 0.35 + random() * 0.15; // nearest grains first
    rDur[i] = 0.55 + random() * 0.3;
    arc[i] = gauss() * 0.12;
    vx[i] = vy[i] = 0;
  }
}

createSketch({
  setup({ canvas, ctx }) {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    scale = Math.min(canvas.width / cssW, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
    W = canvas.width = Math.floor(cssW * scale);
    H = canvas.height = Math.floor(cssH * scale);
    buf = new Float32Array(W * H);
    image = ctx.createImageData(W, H);
    out = new Uint32Array(image.data.buffer);

    GW = Math.ceil(W / CELL) + 2; GH = Math.ceil(H / CELL) + 2;
    const n = GW * GH;
    gm = new Float32Array(n); gmm = new Float32Array(n); gmx = new Float32Array(n); gmy = new Float32Array(n);
    gvx = new Float32Array(n); gvy = new Float32Array(n); gp = new Float32Array(n);
    gfx = new Float32Array(n); gfy = new Float32Array(n); wake = new Uint8Array(n);

    side = Math.min(W, H) * 0.42;
    const x0 = (W - side) / 2, y0 = (H - side) / 2;
    count = Math.min(MAX, Math.floor(side * side * 0.7));
    rho0 = (count * CELL * CELL) / (side * side); // grains per cell at rest
    const cols = Math.ceil(Math.sqrt(count));
    const grid = side / cols;
    for (let i = 0; i < count; i++) {
      hx[i] = px[i] = x0 + ((i % cols) + random()) * grid;
      hy[i] = py[i] = y0 + (Math.floor(i / cols) + random()) * grid;
      vx[i] = vy[i] = 0; state[i] = 0;
    }
    balls = [];
  },
  draw({ ctx, t, dt }) {
    dt = Math.min(dt, 1 / 30);

    if (!balls.length && moving === 0 && rewinding === 0) {
      rest -= dt;
      if (rest <= 0) { autoBall(); rest = 0.9 + random() * 0.9; }
    }
    if (!balls.length && moving > 0 && t - lastHit > SETTLE) startRewind(t);

    // --- ball: a heavy solid, tested along its whole path this frame --------
    for (const b of balls) {
      b.lx = b.x; b.ly = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const sx = b.x - b.lx, sy = b.y - b.ly, sl = sx * sx + sy * sy || 1;
      const minX = Math.min(b.x, b.lx) - b.r, maxX = Math.max(b.x, b.lx) + b.r;
      const minY = Math.min(b.y, b.ly) - b.r, maxY = Math.max(b.y, b.ly) + b.r;
      const r2 = b.r * b.r;
      for (let i = 0; i < count; i++) {
        if (state[i] === 2) continue;
        const x = px[i], y = py[i];
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        const u = clamp(((x - b.lx) * sx + (y - b.ly) * sy) / sl, 0, 1);
        const cx = b.lx + sx * u, cy = b.ly + sy * u;
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const d = Math.sqrt(d2) || 0.01;
        let nx = dx / d, ny = dy / d;
        if (d2 === 0) { const a = random() * TAU; nx = Math.cos(a); ny = Math.sin(a); }
        px[i] = clamp(cx + nx * b.r, 0, W - 1);
        py[i] = clamp(cy + ny * b.r, 0, H - 1);
        const vn = (b.vx - vx[i]) * nx + (b.vy - vy[i]) * ny;
        if (vn > 0) {
          vx[i] += nx * vn * (1 + RESTITUTION) + (random() - 0.5) * vn * 0.6;
          vy[i] += ny * vn * (1 + RESTITUTION) + (random() - 0.5) * vn * 0.6;
        }
        state[i] = 1;
        lastHit = t;
      }
    }
    const margin = Math.hypot(W, H);
    balls = balls.filter((b) => Math.abs(b.x - W / 2) < margin && Math.abs(b.y - H / 2) < margin);

    // --- grains to grid ------------------------------------------------------
    gm.fill(0); gmm.fill(0); gmx.fill(0); gmy.fill(0);
    const inv = 1 / CELL;
    for (let i = 0; i < count; i++) {
      if (state[i] === 2) continue;
      const gx = px[i] * inv + 0.5, gy = py[i] * inv + 0.5; // +1 pad, -0.5 centre
      const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
      const c = iy * GW + ix;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const a = vx[i], b = vy[i];
      gm[c] += w00; gm[c + 1] += w10; gm[c + GW] += w01; gm[c + GW + 1] += w11;
      if (state[i] === 1) {
        // only moving grains share momentum; the resting pile just takes up room
        gmm[c] += w00; gmm[c + 1] += w10; gmm[c + GW] += w01; gmm[c + GW + 1] += w11;
        gmx[c] += w00 * a; gmx[c + 1] += w10 * a; gmx[c + GW] += w01 * a; gmx[c + GW + 1] += w11 * a;
        gmy[c] += w00 * b; gmy[c + 1] += w10 * b; gmy[c + GW] += w01 * b; gmy[c + GW + 1] += w11 * b;
      }
    }

    // --- grid: average velocity, over-packing pressure and its push ---------
    const pushK = PRESSURE * side * 0.5, pushMax = PUSH_MAX * side;
    const wakeV2 = (WAKE_SPEED * side) ** 2;
    for (let c = 0; c < gm.length; c++) {
      const m = gm[c], mm = gmm[c];
      gvx[c] = mm > 0 ? gmx[c] / mm : 0;
      gvy[c] = mm > 0 ? gmy[c] / mm : 0;
      gp[c] = m > rho0 * 1.15 ? m / rho0 - 1.15 : 0;
    }
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1, c = y * GW + 1; x < GW - 1; x++, c++) {
        let fx = -(gp[c + 1] - gp[c - 1]) * pushK;
        let fy = -(gp[c + GW] - gp[c - GW]) * pushK;
        const f = Math.abs(fx) + Math.abs(fy);
        if (f > pushMax) { fx *= pushMax / f; fy *= pushMax / f; }
        gfx[c] = fx; gfy[c] = fy;
        wake[c] = gmm[c] > rho0 * KNOCK && gvx[c] * gvx[c] + gvy[c] * gvy[c] > wakeV2 ? 1 : 0;
      }
    }

    // --- grid back to grains, friction, motion ------------------------------
    const share = 1 - Math.exp(-SHARE * dt);
    const fric = FRICTION * side * dt;
    const drag = Math.exp(-0.8 * dt);
    moving = 0; rewinding = 0;
    for (let i = 0; i < count; i++) {
      let x = px[i], y = py[i];
      const st = state[i];

      if (st === 2) {
        const u = (t - rT[i]) / rDur[i];
        rewinding++;
        if (u >= 1) {
          state[i] = 0; x = hx[i]; y = hy[i];
        } else if (u > 0) {
          const e = ease(u);
          const dx = hx[i] - r0x[i], dy = hy[i] - r0y[i];
          const bend = Math.sin(u * Math.PI) * arc[i];
          x = r0x[i] + dx * e - dy * bend;
          y = r0y[i] + dy * e + dx * bend;
        }
        const ox = px[i], oy = py[i];
        px[i] = x; py[i] = y;
        streak(ox, oy, x, y);
        continue;
      }

      const gx = x * inv + 0.5, gy = y * inv + 0.5;
      const ix = gx | 0, iy = gy | 0, c = iy * GW + ix;

      if (st === 0) {
        if (!wake[c] && !wake[c + 1] && !wake[c + GW] && !wake[c + GW + 1]) {
          // a pixel of shimmer keeps the resting square alive
          const qx = (x + Math.random() * 2 - 1) | 0, qy = (y + Math.random() * 2 - 1) | 0;
          if (qx >= 0 && qy >= 0 && qx < W && qy < H) buf[qy * W + qx] += 0.5;
          continue;
        }
        // knocked loose: it picks up part of the moving grains' velocity
        state[i] = 1;
        const w = 0.35 + Math.random() * 0.4;
        vx[i] = gvx[c] * w; vy[i] = gvy[c] * w;
      }
      moving++;

      const fx = gx - ix, fy = gy - iy;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const m = w00 * gmm[c] + w10 * gmm[c + 1] + w01 * gmm[c + GW] + w11 * gmm[c + GW + 1];
      const ax = w00 * gfx[c] + w10 * gfx[c + 1] + w01 * gfx[c + GW] + w11 * gfx[c + GW + 1];
      const ay = w00 * gfy[c] + w10 * gfy[c + 1] + w01 * gfy[c + GW] + w11 * gfy[c + GW + 1];
      const ux = w00 * gvx[c] + w10 * gvx[c + 1] + w01 * gvx[c + GW] + w11 * gvx[c + GW + 1];
      const uy = w00 * gvy[c] + w10 * gvy[c + 1] + w01 * gvy[c + GW] + w11 * gvy[c + GW + 1];

      let a = vx[i] + ax * dt, b = vy[i] + ay * dt;
      // grains moving in a crowd trade momentum; lone ones fly free
      const k = share * clamp(m / rho0 - 0.3, 0, 1);
      a += (ux - a) * k; b += (uy - b) * k;
      // sliding friction: constant deceleration, then a dead stop
      a *= drag; b *= drag;
      const sp = Math.sqrt(a * a + b * b);
      if (sp <= fric) { a = 0; b = 0; } else { a -= (a / sp) * fric; b -= (b / sp) * fric; }

      const ox = x, oy = y;
      x += a * dt; y += b * dt;
      if (x < 0) { x = -x; a *= -0.4; } else if (x >= W) { x = 2 * W - x - 1; a *= -0.4; }
      if (y < 0) { y = -y; b *= -0.4; } else if (y >= H) { y = 2 * H - y - 1; b *= -0.4; }
      x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1);
      vx[i] = a; vy[i] = b; px[i] = x; py[i] = y;
      streak(ox, oy, x, y);
    }

    // one pass: glow buffer to pixels, then fade it
    for (let k = 0; k < buf.length; k++) {
      const v = buf[k];
      out[k] = LUT[v >= 1 ? 255 : (v * 255) | 0];
      buf[k] = v < 0.004 ? 0 : v * DECAY;
    }
    ctx.putImageData(image, 0, 0);

    for (const b of balls) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.6);
      g.addColorStop(0, 'rgba(255,250,240,1)');
      g.addColorStop(0.6, 'rgba(255,245,230,0.95)');
      g.addColorStop(0.66, 'rgba(255,240,220,0.25)');
      g.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.6, 0, TAU);
      ctx.fill();
    }
  },
});

// short streak so fast grains read as motion; a still grain is one bright dot
function streak(ox, oy, x, y) {
  const len = Math.abs(x - ox) + Math.abs(y - oy);
  const n = len < 3 ? 1 : len < 6 ? 2 : len < 9 ? 3 : 4;
  const tone = (0.5 + Math.min(0.5, len * 0.02)) / n;
  for (let s = 1; s <= n; s++) {
    const u = s / n;
    buf[((oy + (y - oy) * u) | 0) * W + ((ox + (x - ox) * u) | 0)] += tone;
  }
}
