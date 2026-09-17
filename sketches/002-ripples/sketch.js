// 002 ripples
// A grid of dots displaced by circular waves. Tap or drag anywhere to drop a
// ripple; overlapping waves interfere. Idle for a moment and it rains on its own.

import { createSketch, rng, TAU, clamp } from '../../lib/sketch.js';

const random = rng(2);
const SPEED = 220;      // px per second
const LIFE = 4.5;       // seconds a ripple lives
const WAVELEN = 60;     // px
const SPACING = 18;     // dot grid spacing in px

const ripples = [];
let grid = [];
let lastTouch = 0;
let nextAuto = 1.5;
let hueShift = 0;

function drop(x, y, t, amp = 1) {
  ripples.push({ x, y, born: t, amp, hue: (hueShift += 23) % 360 });
  if (ripples.length > 24) ripples.shift();
}

let now = 0;
let dragLast = 0;
window.addEventListener('pointerdown', (e) => {
  lastTouch = now; drop(e.clientX, e.clientY, now, 1.4);
});
window.addEventListener('pointermove', (e) => {
  if (e.buttons === 0 && e.pointerType === 'mouse') return;
  if (now - dragLast < 0.09) return;
  dragLast = now; lastTouch = now; drop(e.clientX, e.clientY, now, 0.6);
});

createSketch({
  setup({ width, height }) {
    grid = [];
    const cols = Math.ceil(width / SPACING) + 1;
    const rows = Math.ceil(height / SPACING) + 1;
    const ox = (width - (cols - 1) * SPACING) / 2;
    const oy = (height - (rows - 1) * SPACING) / 2;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        grid.push({ x: ox + i * SPACING, y: oy + j * SPACING });
  },
  draw({ ctx, width, height, t }) {
    now = t;
    // auto-rain when the user hasn't touched for a while
    if (t - lastTouch > 2.5 && t > nextAuto) {
      drop(random() * width, random() * height, t, 0.8 + random() * 0.6);
      nextAuto = t + 0.9 + random() * 1.6;
    }
    // retire old ripples
    while (ripples.length && t - ripples[0].born > LIFE) ripples.shift();

    ctx.fillStyle = '#06070c';
    ctx.fillRect(0, 0, width, height);

    for (const g of grid) {
      let h = 0, dx = 0, dy = 0, hue = 0, wsum = 0;
      for (const r of ripples) {
        const age = t - r.born;
        const rx = g.x - r.x, ry = g.y - r.y;
        const d = Math.hypot(rx, ry);
        const front = age * SPEED;
        const rel = d - front;               // negative inside the front
        if (rel > 0 || rel < -WAVELEN * 3) continue;
        const env = Math.exp(rel / (WAVELEN * 1.2)) * (1 - age / LIFE) * r.amp;
        const w = Math.sin((rel / WAVELEN) * TAU) * env;
        h += w;
        if (d > 1) { dx += (rx / d) * w * 6; dy += (ry / d) * w * 6; }
        hue += r.hue * Math.abs(w); wsum += Math.abs(w);
      }
      const a = clamp(Math.abs(h), 0, 1);
      const size = 1.1 + a * 3.2;
      const hh = wsum > 0 ? hue / wsum : 220;
      ctx.fillStyle = `hsl(${hh}, ${60 + a * 30}%, ${28 + a * 52}%)`;
      ctx.beginPath();
      ctx.arc(g.x + dx, g.y + dy, size, 0, TAU);
      ctx.fill();
    }
  },
});
