// 003 go there
// One point. Tap anywhere and it travels there, easing in and out and laying
// down a permanent trail with a little hand-drawn wobble. Tap again mid-flight
// and it curves toward the new target.

import { createSketch, TAU, clamp } from '../../lib/sketch.js';

const pos = { x: 0, y: 0 };
const vel = { x: 0, y: 0 };
let target = null;          // { x, y } or null
let placed = false;

// persistent trail layer
let layer = null, lctx = null;
let lastDrawn = null;
let noisePhase = 0;

// smooth 1D noise from a few incommensurate sines, in -1..1
function wobble(p) {
  return (Math.sin(p * 1.7) + Math.sin(p * 2.9 + 1.3) * 0.6 + Math.sin(p * 5.3 + 0.4) * 0.3) / 1.9;
}

window.addEventListener('pointerdown', (e) => {
  target = { x: e.clientX, y: e.clientY };
});

createSketch({
  setup({ canvas, width, height }) {
    if (!placed) { pos.x = width / 2; pos.y = height / 2; placed = true; }
    // rebuild the trail layer at the new size, keeping whatever was drawn
    const old = layer;
    layer = document.createElement('canvas');
    layer.width = canvas.width; layer.height = canvas.height;
    lctx = layer.getContext('2d');
    if (old) lctx.drawImage(old, 0, 0);
    lctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    lctx.lineCap = 'round'; lctx.lineJoin = 'round';
    lastDrawn = null;
  },
  draw({ ctx, width, height, dt }) {
    dt = Math.min(dt, 0.05);

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

    // lay down trail: offset the pen sideways by a slow noise so the line wavers
    if (speed > 1) {
      noisePhase += speed * dt * 0.06;
      const nx = -vel.y / speed, ny = vel.x / speed;        // perpendicular
      const off = wobble(noisePhase) * 2.2;
      const pen = { x: pos.x + nx * off, y: pos.y + ny * off };
      if (!lastDrawn) lastDrawn = pen;
      if (Math.hypot(pen.x - lastDrawn.x, pen.y - lastDrawn.y) > 0.4) {
        lctx.strokeStyle = 'rgba(120, 200, 255, 0.55)';
        lctx.lineWidth = 1.2 + (wobble(noisePhase * 2.3 + 7) + 1) * 0.5;
        lctx.beginPath();
        lctx.moveTo(lastDrawn.x, lastDrawn.y);
        lctx.lineTo(pen.x, pen.y);
        lctx.stroke();
        lastDrawn = pen;
      }
    }

    // compose: background, trail layer, target marker, point
    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(layer, 0, 0, width, height);

    if (target) {
      const d = Math.hypot(target.x - pos.x, target.y - pos.y);
      const r = clamp(d * 0.15, 4, 28);
      const a = clamp(d / 120, 0.08, 0.7);
      ctx.strokeStyle = `rgba(255, 210, 120, ${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(target.x, target.y, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255, 210, 120, ${a})`;
      ctx.beginPath(); ctx.arc(target.x, target.y, 1.5, 0, TAU); ctx.fill();
      if (d < 0.5 && speed < 2) target = null;
    }

    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 3.5, 0, TAU); ctx.fill();
  },
});
