// 004 square burst
// A square of tiny particles. Every so often a ball tears through it and the
// particles blow apart: ballistic, scattered, nothing smooth about it. They
// tumble, bounce off the edges, then spring back and the square re-forms.
// Tap anywhere to throw a ball from there through the square.

import { createSketch, rng, TAU, clamp } from '../../lib/sketch.js';

const random = rng(4);
const gauss = () => (random() + random() + random() - 1.5) * 1.15;

// Everything lives in device pixels so each particle is a single real pixel.
const MAX = 120000;
const hx = new Float32Array(MAX), hy = new Float32Array(MAX); // home
const px = new Float32Array(MAX), py = new Float32Array(MAX);
const vx = new Float32Array(MAX), vy = new Float32Array(MAX);
const loose = new Uint8Array(MAX);
const wait = new Float32Array(MAX); // seconds until it starts heading home
const pull = new Float32Array(MAX); // spring strength ramp 0..1
let count = 0, W = 0, H = 0, dpr = 1, side = 0, looseCount = 0;
let buf = null, image = null;
let balls = [];
let rest = 1.2; // seconds until the next automatic ball

const DECAY = 0.8;      // glow buffer falloff per frame
const DRAG = 1.6;       // velocity loss per second while flying
const SPRING = 26;      // pull toward home once returning
const RETURN_AFTER = 1.6;

function throwBall(fromX, fromY, toX, toY) {
  const dx = toX - fromX, dy = toY - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const speed = Math.max(W, H) * 1.1;
  balls.push({
    x: fromX, y: fromY,
    vx: (dx / d) * speed, vy: (dy / d) * speed,
    r: side * (0.07 + random() * 0.05),
  });
}

function autoBall() {
  // come in from off screen at a random angle, aimed a little off centre
  const a = random() * TAU;
  const reach = Math.hypot(W, H) * 0.6;
  const cx = W / 2 + gauss() * side * 0.2, cy = H / 2 + gauss() * side * 0.2;
  throwBall(cx - Math.cos(a) * reach, cy - Math.sin(a) * reach, cx, cy);
}

window.addEventListener('pointerdown', (e) => {
  if (!W) return;
  const x = e.clientX * dpr, y = e.clientY * dpr;
  // aim at the square; a tap on the square itself throws from the far edge
  let tx = W / 2 + gauss() * side * 0.15, ty = H / 2 + gauss() * side * 0.15;
  if (Math.hypot(x - tx, y - ty) < side * 0.4) {
    const a = random() * TAU;
    throwBall(x - Math.cos(a) * W, y - Math.sin(a) * W, x, y);
  } else {
    throwBall(x, y, tx, ty);
  }
});

createSketch({
  setup({ canvas, ctx }) {
    W = canvas.width; H = canvas.height;
    dpr = W / window.innerWidth;
    buf = new Float32Array(W * H);
    image = ctx.createImageData(W, H);
    const d = image.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;

    side = Math.min(W, H) * 0.42;
    const x0 = (W - side) / 2, y0 = (H - side) / 2;
    count = Math.min(MAX, Math.floor(side * side * 0.9));
    const cols = Math.ceil(Math.sqrt(count));
    const cell = side / cols;
    for (let i = 0; i < count; i++) {
      hx[i] = px[i] = x0 + ((i % cols) + random()) * cell;
      hy[i] = py[i] = y0 + (Math.floor(i / cols) + random()) * cell;
      vx[i] = vy[i] = 0;
      loose[i] = 0;
    }
    looseCount = 0;
    balls = [];
  },
  draw({ ctx, t, dt }) {
    dt = Math.min(dt, 1 / 20);

    // next automatic ball once the square has settled
    if (!balls.length && looseCount === 0) {
      rest -= dt;
      if (rest <= 0) { autoBall(); rest = 1.2 + random() * 1.2; }
    }

    for (const b of balls) { b.x += b.vx * dt; b.y += b.vy * dt; }
    const margin = Math.hypot(W, H);
    balls = balls.filter((b) => Math.abs(b.x - W / 2) < margin && Math.abs(b.y - H / 2) < margin);

    for (let k = 0; k < buf.length; k++) buf[k] *= DECAY;

    const drag = Math.exp(-DRAG * dt);
    looseCount = 0;
    for (let i = 0; i < count; i++) {
      let x = px[i], y = py[i];

      // the ball's blast zone: anything close gets thrown hard, in every
      // direction at once, with a big helping of randomness
      for (const b of balls) {
        const dx = x - b.x, dy = y - b.y;
        const blast = b.r * 2.6;
        if (dx > blast || dx < -blast || dy > blast || dy < -blast) continue;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        if (d > blast) continue;
        const hit = 1 - d / blast;
        const bs = Math.hypot(b.vx, b.vy);
        const burst = bs * (0.25 + hit * hit * 1.4) * (0.3 + random() * random() * 2.2);
        const carry = hit * (0.2 + random() * 0.8);
        vx[i] += (dx / d) * burst + b.vx * carry + gauss() * bs * 0.25 * hit;
        vy[i] += (dy / d) * burst + b.vy * carry + gauss() * bs * 0.25 * hit;
        if (!loose[i]) { loose[i] = 1; pull[i] = 0; }
        wait[i] = RETURN_AFTER + random() * 1.6;
      }

      if (!loose[i]) {
        // a pixel of shimmer keeps the resting square alive
        const sx = (x + (random() - 0.5) * 2) | 0, sy = (y + (random() - 0.5) * 2) | 0;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) buf[sy * W + sx] += 0.5;
        continue;
      }
      looseCount++;

      // flying: drag plus random twitches, then a spring back home
      vx[i] *= drag; vy[i] *= drag;
      const sp = Math.abs(vx[i]) + Math.abs(vy[i]);
      if (random() < 0.02) { vx[i] += gauss() * sp * 0.6; vy[i] += gauss() * sp * 0.6; }
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

      // streak between last and current position so fast debris reads as motion
      const len = Math.abs(x - ox) + Math.abs(y - oy);
      const n = Math.min(8, 1 + (len / 2) | 0);
      const tone = (0.5 + Math.min(0.6, len * 0.02)) / n;
      for (let s = 1; s <= n; s++) {
        const u = s / n;
        const sx = (ox + (x - ox) * u) | 0, sy = (oy + (y - oy) * u) | 0;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) buf[sy * W + sx] += tone;
      }
    }

    const d = image.data;
    for (let k = 0, j = 0; k < buf.length; k++, j += 4) {
      const v = clamp(buf[k] + (random() - 0.5) * 0.04, 0, 1) * 255;
      d[j] = v; d[j + 1] = v * 0.96; d[j + 2] = v * 0.88;
    }
    ctx.putImageData(image, 0, 0);

    // the ball itself, drawn on top in CSS pixels
    for (const b of balls) {
      const g = ctx.createRadialGradient(b.x / dpr, b.y / dpr, 0, b.x / dpr, b.y / dpr, (b.r * 1.8) / dpr);
      g.addColorStop(0, 'rgba(255,250,240,1)');
      g.addColorStop(0.5, 'rgba(255,245,230,0.95)');
      g.addColorStop(0.56, 'rgba(255,240,220,0.25)');
      g.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x / dpr, b.y / dpr, (b.r * 1.8) / dpr, 0, TAU);
      ctx.fill();
    }
  },
});
