// 003 go there
// One point. Tap anywhere and it travels there, easing in and out and leaving a
// fading trail. Tap again mid-flight and it curves toward the new target.

import { createSketch, TAU, clamp, lerp } from '../../lib/sketch.js';

const pos = { x: 0, y: 0 };
const vel = { x: 0, y: 0 };
let target = null;          // { x, y, since } or null
const trail = [];
const TRAIL = 90;

window.addEventListener('pointerdown', (e) => {
  target = { x: e.clientX, y: e.clientY, since: performance.now() };
});

let placed = false;

createSketch({
  setup({ ctx, width, height }) {
    if (!placed) { pos.x = width / 2; pos.y = height / 2; placed = true; }
    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(0, 0, width, height);
  },
  draw({ ctx, width, height, t, dt }) {
    dt = Math.min(dt, 0.05);
    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(0, 0, width, height);

    // spring toward the target, damped so it settles without orbiting
    if (target) {
      const dx = target.x - pos.x, dy = target.y - pos.y;
      const k = 40, damp = 10;
      vel.x += (dx * k - vel.x * damp) * dt;
      vel.y += (dy * k - vel.y * damp) * dt;
    } else {
      vel.x *= 0.9; vel.y *= 0.9;
    }
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;

    const speed = Math.hypot(vel.x, vel.y);
    trail.push({ x: pos.x, y: pos.y });
    if (trail.length > TRAIL) trail.shift();

    // target marker: a ring that tightens as the point closes in
    if (target) {
      const d = Math.hypot(target.x - pos.x, target.y - pos.y);
      const r = clamp(d * 0.15, 4, 28);
      const a = clamp(d / 120, 0.08, 0.7);
      ctx.strokeStyle = `rgba(255, 210, 120, ${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(target.x, target.y, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(target.x, target.y, 1.5, 0, TAU);
      ctx.fillStyle = `rgba(255, 210, 120, ${a})`; ctx.fill();
      if (d < 0.5 && speed < 2) target = null;
    }

    // trail
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      const f = i / trail.length;
      ctx.strokeStyle = `rgba(120, 200, 255, ${f * f * 0.9})`;
      ctx.lineWidth = lerp(0.5, 3, f);
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }

    // the point, with a soft glow that grows with speed
    const glow = 10 + clamp(speed / 60, 0, 1) * 16;
    const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glow);
    g.addColorStop(0, 'rgba(160, 220, 255, 0.55)');
    g.addColorStop(1, 'rgba(160, 220, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, glow, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 4, 0, TAU); ctx.fill();
  },
});
