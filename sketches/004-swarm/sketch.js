// 004 swarm
// At rest it is one dot. Tap and it sets off toward the tap as a swarm of ten,
// spreading apart mid-journey and folding back into a single dot on arrival.

import { createSketch, rng, TAU, clamp, lerp } from '../../lib/sketch.js';

const random = rng(4);
const N = 10;

const leader = { x: 0, y: 0, vx: 0, vy: 0 };
let target = null;               // { x, y }
let journey = 1;                 // length of the current trip, px
let spread = 0;                  // current swarm radius, px
let placed = false;

const dots = Array.from({ length: N }, (_, i) => ({
  x: 0, y: 0,
  angle: (i / N) * TAU + random() * 0.6,
  spin: (random() - 0.5) * 1.6,        // how fast its slot drifts around the leader
  radius: 0.55 + random() * 0.45,      // fraction of the swarm radius it flies at
  ease: 6 + random() * 10,             // how eagerly it chases its slot
  size: 2.2 + random() * 1.6,
  wobble: random() * TAU,
}));

window.addEventListener('pointerdown', (e) => {
  target = { x: e.clientX, y: e.clientY };
  journey = Math.max(40, Math.hypot(target.x - leader.x, target.y - leader.y));
});

createSketch({
  setup({ ctx, width, height }) {
    if (!placed) {
      leader.x = width / 2; leader.y = height / 2;
      for (const d of dots) { d.x = leader.x; d.y = leader.y; }
      placed = true;
    }
    ctx.fillStyle = '#0c0b10';
    ctx.fillRect(0, 0, width, height);
  },
  draw({ ctx, width, height, t, dt }) {
    dt = Math.min(dt, 0.05);
    ctx.fillStyle = '#0c0b10';
    ctx.fillRect(0, 0, width, height);

    // leader: damped spring toward the target
    let remaining = 0;
    if (target) {
      const dx = target.x - leader.x, dy = target.y - leader.y;
      remaining = Math.hypot(dx, dy);
      const k = 22, damp = 8.5;
      leader.vx += (dx * k - leader.vx * damp) * dt;
      leader.vy += (dy * k - leader.vy * damp) * dt;
    } else {
      leader.vx *= 0.9; leader.vy *= 0.9;
    }
    leader.x += leader.vx * dt;
    leader.y += leader.vy * dt;
    const speed = Math.hypot(leader.vx, leader.vy);

    // swarm radius: zero at departure, widest mid-trip, zero again at arrival
    let wanted = 0;
    if (target) {
      const progress = clamp(1 - remaining / journey, 0, 1);
      const bell = Math.sin(progress * Math.PI);
      wanted = bell * clamp(journey * 0.22, 18, 90);
      if (remaining < 0.6 && speed < 2) target = null;
    }
    spread = lerp(spread, wanted, 1 - Math.exp(-6 * dt));

    // each dot chases its own slot around the leader
    for (const d of dots) {
      d.angle += d.spin * dt;
      const r = spread * d.radius * (1 + 0.15 * Math.sin(t * 2.3 + d.wobble));
      const sx = leader.x + Math.cos(d.angle) * r;
      const sy = leader.y + Math.sin(d.angle) * r;
      const f = 1 - Math.exp(-d.ease * dt);
      d.x = lerp(d.x, sx, f);
      d.y = lerp(d.y, sy, f);
    }

    // target marker
    if (target) {
      const rr = clamp(remaining * 0.15, 4, 28);
      const a = clamp(remaining / 120, 0.08, 0.7);
      ctx.strokeStyle = `rgba(255, 210, 120, ${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(target.x, target.y, rr, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255, 210, 120, ${a})`;
      ctx.beginPath(); ctx.arc(target.x, target.y, 1.5, 0, TAU); ctx.fill();
    }

    // dots: when they overlap at rest they read as a single slightly larger dot
    ctx.fillStyle = '#eaf6ff';
    for (const d of dots) {
      ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, TAU); ctx.fill();
    }
  },
});
