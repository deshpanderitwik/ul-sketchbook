// 001 first light
// A field of drifting particles that get pulled toward a slow-orbiting point.
// Touch or move the pointer to drag the attractor around.

import { createSketch, rng, TAU, lerp } from '../../lib/sketch.js';

const random = rng(1);
const N = 600;
const particles = [];
let attractor = { x: 0, y: 0 };
let pointer = null;

for (let i = 0; i < N; i++) {
  particles.push({
    x: random(), y: random(),      // normalized 0..1
    vx: 0, vy: 0,
    hue: 180 + random() * 120,
  });
}

window.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointerdown', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointerup', () => { pointer = null; });

createSketch({
  setup({ ctx, width, height }) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
  },
  draw({ ctx, width, height, t, dt }) {
    // fade trails
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, width, height);

    const target = pointer ?? {
      x: width / 2 + Math.cos(t * 0.4) * width * 0.25,
      y: height / 2 + Math.sin(t * 0.7) * height * 0.25,
    };
    attractor.x = lerp(attractor.x, target.x, 0.05);
    attractor.y = lerp(attractor.y, target.y, 0.05);

    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const px = p.x * width, py = p.y * height;
      const dx = attractor.x - px, dy = attractor.y - py;
      const d2 = dx * dx + dy * dy + 400;
      const f = 4000 / d2;
      p.vx += (dx / Math.sqrt(d2)) * f * dt;
      p.vy += (dy / Math.sqrt(d2)) * f * dt;
      // gentle swirl
      p.vx += -dy / Math.sqrt(d2) * 0.6 * dt;
      p.vy += dx / Math.sqrt(d2) * 0.6 * dt;
      p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx * dt; p.y += p.vy * dt;
      // wrap
      if (p.x < 0) p.x += 1; if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1; if (p.y > 1) p.y -= 1;

      const speed = Math.hypot(p.vx, p.vy);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${Math.min(1, 0.25 + speed * 2)})`;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
});
