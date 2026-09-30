/**
 * lumenAnimations.js — ambient life for the level 2 world, drawn each frame
 * over the cached terrain in world space (1 tile = cell px, 1 art px = cell/8).
 * Only charted, on-screen things animate; everything is a few rects.
 */

import { drawWindmillSails } from './lumenProps';
import { hash2 } from './mapNoise';

const ANIMATED = new Set(['windmill', 'house', 'hall', 'lodge', 'forge', 'lighthouse', 'fountain', 'elderTree', 'crystal', 'crystalCave', 'volcano', 'boat', 'ship', 'igloo', 'camp', 'library', 'stiltHouse']);

/** Pre-sort the entities that animate, once per world. */
export function buildLumenAnimSpec(world) {
  const actors = (world.entities || []).filter((e) => ANIMATED.has(e.type));
  const glints = [];
  const petals = [];
  for (let y = 0; y < world.size; y += 1) {
    for (let x = 0; x < world.size; x += 1) {
      const t = world.terrain[y][x];
      if (t.lv < 0 && !t.river && t.k === 'water' && hash2(x, y, 17) < 0.07) glints.push([x, y, hash2(x, y, 19)]);
      if (t.k === 'blossom' && hash2(x, y, 23) < 0.05) petals.push([x, y, hash2(x, y, 29)]);
    }
  }
  const gulls = Array.from({ length: 9 }, (_, i) => ({
    y: 20 + hash2(i, 0, 41) * (world.size - 40),
    speed: 3 + hash2(i, 1, 42) * 6,
    phase: hash2(i, 2, 43) * world.size * 1.4,
    dir: hash2(i, 5, 46) > 0.5 ? 1 : -1,
  }));
  return { actors, glints, petals, gulls, river: world.mapData?.river?.samples || [] };
}

function charted(unlocked, x, y) {
  return unlocked.has(`${Math.floor(x)},${Math.floor(y)}`);
}

export function drawLumenAnimations(ctx, { world, unlocked, time, cell, vx0, vy0, vx1, vy1, spec, motion = true }) {
  if (!spec || !world) return;
  const t = motion ? time : 0;
  const a = cell / 8; // one art pixel
  const inView = (x, y, pad = 2) => x >= vx0 - pad && x <= vx1 + pad && y >= vy0 - pad && y <= vy1 + pad;
  const px = (x, y, w = 1, h = 1) => ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w * a)), Math.max(1, Math.round(h * a)));

  // Water glints drift and blink.
  for (const [x, y, h] of spec.glints) {
    if (!inView(x, y, 0) || !charted(unlocked, x, y)) continue;
    const s = Math.sin(t * 1.7 + h * 12);
    if (s < 0.6) continue;
    ctx.fillStyle = `rgba(215,244,255,${(s - 0.6) * 1.6})`;
    const ox = ((h * 5 + t * 0.6) % 6) * a;
    px(x * cell + ox, y * cell + (h * 6) * a, 2, 1);
  }

  // River: light streaks travelling downstream.
  const rs = spec.river;
  for (let i = 0; i < rs.length; i += 7) {
    const p = rs[i];
    if (!inView(p.x, p.y, 1) || !charted(unlocked, p.x, p.y)) continue;
    const phase = (t * 0.9 - i * 0.021) % 1;
    const f = phase < 0 ? phase + 1 : phase;
    if (f > 0.3) continue;
    ctx.fillStyle = `rgba(230,250,255,${0.7 - f * 2})`;
    const off = (hash2(i, 0, 5) - 0.5) * p.w * 0.6 * cell;
    px(p.x * cell - p.ty * off, p.y * cell + p.tx * off, 2, 1);
  }

  // Waterfall mist.
  const falls = world.mapData?.river?.falls;
  if (falls && inView(falls.x, falls.y) && charted(unlocked, falls.x, falls.y)) {
    for (let k = 0; k < 8; k += 1) {
      const ph = (t * 0.6 + k / 8) % 1;
      ctx.fillStyle = `rgba(240,252,255,${(1 - ph) * 0.7})`;
      px((falls.x + 0.5) * cell + Math.sin(k * 2.3) * cell * 0.6, (falls.y + 1.2) * cell - ph * cell * 0.9, 1, 1);
    }
  }

  for (const e of spec.actors) {
    if (!inView(e.x, e.y, 4) || !charted(unlocked, e.x, e.y)) continue;
    const X = e.x * cell;
    const Y = e.y * cell;
    switch (e.type) {
      case 'windmill': {
        const cx = X + cell / 2;
        const cy = Y + cell * 0.9 - 15 * a;
        ctx.fillStyle = '#6b4a2e';
        drawWindmillSails((sx, sy, part) => {
          ctx.fillStyle = part === 0 ? '#5a3f28' : part === 1 ? '#8a6a48' : '#f2ead8';
          ctx.fillRect(Math.round(sx), Math.round(sy), Math.ceil(a), Math.ceil(a));
        }, cx, cy, t * 1.1 + e.x, a);
        break;
      }
      case 'house':
      case 'hall':
      case 'lodge':
      case 'forge': {
        const chimney = {
          house: [((e.v || 0) % 2 ? 12 : 3) * a, -5 * a],
          hall: [12 * a, -26 * a],
          lodge: [6 * a, -17 * a],
          forge: [5 * a, -21 * a],
        }[e.type];
        const cx = X + chimney[0];
        const cy = Y + chimney[1];
        const dark = e.type === 'forge';
        for (let k = 0; k < 4; k += 1) {
          const ph = (t * 0.25 + k / 4 + (e.x % 7) * 0.13) % 1;
          const sh = dark ? 90 + ph * 60 : 210 + ph * 30;
          ctx.fillStyle = `rgba(${sh},${sh},${sh + 8},${(1 - ph) * (dark ? 0.6 : 0.45)})`;
          const r = 1 + ph * 2.5;
          px(cx + (Math.sin(ph * 5 + k) + ph * 3) * a, cy - ph * 14 * a, r, r);
        }
        if (e.type === 'forge') {
          const f = 0.5 + 0.5 * Math.sin(t * 7 + e.x);
          ctx.fillStyle = `rgba(255,${150 + f * 60},60,${0.5 + f * 0.4})`;
          px(X + 5 * a, Y - 9 * a, 2, 1);
        }
        break;
      }
      case 'lighthouse': {
        const lx = X + cell / 2;
        const ly = Y + cell * 0.7 - 30 * a;
        const ang = t * 0.7;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(ang);
        const len = cell * 11;
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,246,200,0.34)');
        g.addColorStop(0.5, 'rgba(255,246,200,0.12)');
        g.addColorStop(1, 'rgba(255,246,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, -cell * 0.9);
        ctx.lineTo(len, cell * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'fountain': {
        for (let k = 0; k < 6; k += 1) {
          const ph = (t * 1.3 + k / 6) % 1;
          const dir = (k % 2 ? 1 : -1) * (1 + (k % 3));
          ctx.fillStyle = `rgba(225,248,255,${1 - ph})`;
          px(X + dir * ph * 2.4 * a, Y - 6 * a + (ph * ph * 10 - ph * 6) * a, 1, 1);
        }
        break;
      }
      case 'elderTree': {
        for (let k = 0; k < 10; k += 1) {
          const s = Math.sin(t * 1.6 + k * 1.9);
          if (s < 0.3) continue;
          ctx.fillStyle = `rgba(255,236,160,${(s - 0.3) * 1.2})`;
          px(X + cell / 2 + Math.sin(k * 2.4) * 18 * a, Y + cell * 0.9 - (22 + Math.cos(k * 1.3) * 14) * a, 1, 1);
        }
        for (let k = 0; k < 5; k += 1) {
          const fx = X + cell / 2 + Math.sin(t * 0.4 + k * 1.7) * 28 * a;
          const fy = Y + Math.cos(t * 0.5 + k) * 10 * a;
          ctx.fillStyle = `rgba(210,255,140,${0.5 + 0.4 * Math.sin(t * 3 + k)})`;
          px(fx, fy, 1, 1);
        }
        break;
      }
      case 'crystal':
      case 'crystalCave': {
        const s = Math.sin(t * 2.2 + e.x * 1.7 + e.y);
        if (s > 0.55) {
          ctx.fillStyle = `rgba(255,255,255,${(s - 0.55) * 2})`;
          const sx = X + cell / 2 + (hash2(e.x, e.y, 3) - 0.5) * 8 * a;
          const sy = Y + cell * 0.9 - (6 + hash2(e.x, e.y, 5) * 6) * a;
          px(sx, sy, 1, 1);
          px(sx - a, sy, 1, 1);
          px(sx + a, sy, 1, 1);
          px(sx, sy - a, 1, 1);
          px(sx, sy + a, 1, 1);
        }
        break;
      }
      case 'volcano': {
        const cx = X + cell / 2;
        const cy = Y + cell * 0.9 - 42 * a;
        for (let k = 0; k < 7; k += 1) {
          const ph = (t * 0.14 + k / 7) % 1;
          const sh = 70 + ph * 80;
          ctx.fillStyle = `rgba(${sh},${sh - 5},${sh + 8},${(1 - ph) * 0.6})`;
          const r = 3 + ph * 9;
          px(cx + (ph * 16 + Math.sin(ph * 4 + k) * 3) * a - r * a / 2, cy - (4 + ph * 40) * a, r, r);
        }
        for (let k = 0; k < 4; k += 1) {
          const ph = (t * 0.7 + k / 4) % 1;
          ctx.fillStyle = `rgba(255,${160 + k * 20},60,${1 - ph})`;
          px(cx + Math.sin(k * 2.2) * ph * 10 * a, cy - ph * 12 * a + ph * ph * 10 * a, 1, 1);
        }
        break;
      }
      case 'boat':
      case 'ship': {
        const ph = (t * 0.5 + e.x) % 1;
        ctx.strokeStyle = `rgba(220,245,255,${(1 - ph) * 0.35})`;
        ctx.lineWidth = Math.max(1, a);
        ctx.beginPath();
        const w = e.type === 'ship' ? 16 : 7;
        ctx.ellipse(X + w * a, Y + (e.type === 'ship' ? 6 : 3) * a, (w + ph * 6) * a, (2 + ph * 2) * a, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'camp': {
        const f = 0.5 + 0.5 * Math.sin(t * 11 + e.x);
        ctx.fillStyle = f > 0.5 ? '#ffd35d' : '#ff9a3c';
        px(X + cell / 2 - a, Y + cell * 0.9 - (1 + f) * a, 2, 2);
        break;
      }
      case 'library': {
        const ph = (t * 0.3) % 1;
        ctx.strokeStyle = `rgba(150,255,230,${(1 - ph) * 0.45})`;
        ctx.lineWidth = Math.max(1, a);
        ctx.beginPath();
        ctx.ellipse(X, Y + 3 * a, (4 + ph * 16) * a, (3 + ph * 11) * a, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'stiltHouse': {
        for (let k = 0; k < 3; k += 1) {
          ctx.fillStyle = `rgba(200,255,150,${0.4 + 0.4 * Math.sin(t * 2 + k * 2)})`;
          px(X + cell / 2 + Math.sin(t * 0.6 + k * 2.1) * 14 * a, Y - 4 * a + Math.cos(t * 0.8 + k) * 5 * a, 1, 1);
        }
        break;
      }
      case 'igloo': {
        // Aurora over the glacier.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = -18; k <= 18; k += 1) {
          const wave = Math.sin(k * 0.3 + t * 0.5) * cell * 0.7;
          const top = Y - cell * 5 + wave;
          const h = cell * (1.8 + 0.6 * Math.sin(k * 0.4 + t * 0.8));
          const g = ctx.createLinearGradient(0, top, 0, top + h);
          g.addColorStop(0, 'rgba(110,255,170,0)');
          g.addColorStop(0.6, `rgba(110,255,170,${0.2 * (1 - Math.abs(k) / 19)})`);
          g.addColorStop(1, 'rgba(110,255,170,0)');
          ctx.fillStyle = g;
          ctx.fillRect(X + k * a * 3, top, a * 3, h);
        }
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }

  // Blossom petals drifting on the breeze.
  for (const [x, y, h] of spec.petals) {
    if (!inView(x, y, 1) || !charted(unlocked, x, y)) continue;
    const ph = (t * 0.1 + h) % 1;
    ctx.fillStyle = ph % 0.2 < 0.1 ? 'rgba(255,190,215,0.9)' : 'rgba(255,230,240,0.9)';
    px((x + ph * 3) * cell + Math.sin(ph * 12 + h * 9) * 2 * a, (y + ph * 1.5) * cell, 1, 1);
  }

  // Gulls.
  for (const g of spec.gulls) {
    const x = ((g.phase + t * g.speed * g.dir) % (world.size + 8) + world.size + 8) % (world.size + 8) - 4;
    const y = g.y + Math.sin(t * 0.6 + g.phase) * 2;
    if (!inView(x, y, 1) || !charted(unlocked, x, y)) continue;
    const flap = Math.sin(t * 7 + g.phase) > 0 ? -1 : 1;
    ctx.fillStyle = 'rgba(245,247,250,0.95)';
    const gx = x * cell;
    const gy = y * cell;
    px(gx, gy, 1, 1);
    px(gx - 2 * a, gy + flap * a, 2, 1);
    px(gx + a, gy + flap * a, 2, 1);
  }
}
