/**
 * neonAnimations.js — Neon Meridian after dark, alive: traffic streaking down
 * the avenues, the maglev gliding over the sea, the Holo-Whale swimming above
 * the bay, drones, blinking aircraft lights, wind turbines, foundry smoke,
 * searchlights and the space-elevator climber.
 *
 * Drawn each frame over the cached art in world space (1 tile = cell px,
 * 1 art px = cell / 8). Only charted, on-screen things animate, and anything
 * at street level that a building stands in front of stays hidden.
 */

import { hash2 } from './mapNoise';
import { MAGLEV_H, antennaTip } from './neonProps';

const AVENUE = 12;
const GRID0 = 6;
const laneOf = (p) => ((p - GRID0) % AVENUE + AVENUE) % AVENUE;

// The Holo-Whale, facing left. X body, o eye.
const WHALE = [
  '......XXXXXXXX........',
  '...XXXXXXXXXXXXXX...XX',
  '.XXXXXXXXXXXXXXXXXX.XX',
  'XXoXXXXXXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXXXXXX.XX',
  '..XXXXXX.XXXXXXX....XX',
  '.....XX...............',
];

// Outline cells of the whale glow brighter than its body.
const WHALE_EDGE = WHALE.map((row, r) => [...row].map((ch, c) => ch !== '.'
  && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => (WHALE[r + dr]?.[c + dc] ?? '.') === '.')));

const DRONE_HUBS = [[84, 70], [128, 74], [104, 88], [72, 104], [62, 94], [88, 44], [120, 42], [44, 70]];

/** Pre-compute everything that animates, once per world. */
export function buildNeonAnimSpec(world) {
  const { size, terrain } = world;
  const S = world.mapData.scale || 8;
  const avenue = (x, y) => terrain[y]?.[x]?.k === 'avenue';

  // Occluders: screen-space rects of buildings (and the Arcology), bucketed
  // by the tiles they cover, with the painter base that orders them.
  const rects = [];
  const buckets = new Map();
  const occlude = (x0, y0, x1, y1, base) => {
    const id = rects.length;
    rects.push([x0, y0, x1, y1, base]);
    for (let ty = Math.floor(y0 / S); ty <= Math.floor((y1 - 1) / S); ty += 1) {
      for (let tx = Math.floor(x0 / S); tx <= Math.floor((x1 - 1) / S); tx += 1) {
        const k = ty * size + tx;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(id);
      }
    }
  };
  const lights = [];
  for (const b of world.mapData.buildings || []) {
    const base = (b.y + b.d) * S;
    occlude(b.x * S + 1, b.y * S + 1 - b.h, (b.x + b.w) * S - 1, base - 1, base);
    const tip = antennaTip(b, S);
    if (tip) lights.push({ ...tip, base, tx: b.x, ty: b.y, ph: hash2(b.x, b.y, 3) });
  }

  const ent = (type) => (world.entities || []).filter((e) => e.type === type);
  let searchlight = null;
  for (const e of ent('arcology')) {
    const cx = e.x * S + (e.w * S) / 2;
    const foot = e.y * S + e.d * S;
    let y = foot - 2;
    for (const [w, d, h] of [[38, 32, 70], [28, 24, 60], [20, 16, 48], [12, 10, 30]]) {
      const top = y - h;
      occlude(Math.round(cx - w / 2), top - d, Math.round(cx + w / 2), y, foot);
      y = top - d + d - Math.round(d * 0.35);
    }
    occlude(cx, y - 27, cx + 2, y, foot);
    searchlight = { x: cx, y: y - 27, tx: e.x + 2, ty: e.y + 2 };
  }

  // Traffic lanes: right-hand traffic, two lanes each way per avenue.
  const lanes = [];
  const addRuns = (vertical, a) => {
    let p = 0;
    const on = (q) => (vertical ? avenue(a, q) && avenue(a + 1, q) : avenue(q, a) && avenue(q, a + 1));
    while (p < size) {
      while (p < size && !on(p)) p += 1;
      const p0 = p;
      while (p < size && on(p)) p += 1;
      const len = p - p0;
      if (len < 4) continue;
      // Southbound/westbound on the first lane, northbound/eastbound on the second.
      for (const [fixed, dir] of [[a * S + 3, vertical ? 1 : -1], [(a + 1) * S + 4, vertical ? -1 : 1]]) {
        const cars = [];
        const n = Math.max(1, Math.round(len / 3.2));
        for (let k = 0; k < n; k += 1) {
          cars.push({ off: hash2(a * 7 + k, p0 + dir, 51) * len * S, speed: (1.5 + hash2(a, k + dir * 13, 53) * 1.4) * S });
        }
        lanes.push({ vertical, fixed, from: p0 * S, len: len * S, dir, cars });
      }
    }
  };
  for (let a = 0; a < size - 1; a += 1) {
    if (laneOf(a) !== 0) continue;
    addRuns(true, a);
    addRuns(false, a);
  }

  const glints = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      const wet = (t.lv < 0 && (t.sd ?? 9) <= 5) || t.k === 'canal';
      if (wet && hash2(x, y, 17) < 0.08) glints.push([x, y, hash2(x, y, 19)]);
    }
  }

  const drones = Array.from({ length: 14 }, (_, i) => {
    const [cx, cy] = DRONE_HUBS[i % DRONE_HUBS.length];
    return {
      cx, cy,
      rx: 3 + hash2(i, 1, 61) * 6,
      ry: 2 + hash2(i, 2, 62) * 4,
      a: 0.12 + hash2(i, 3, 63) * 0.18,
      b: 0.17 + hash2(i, 4, 64) * 0.2,
      ph: hash2(i, 5, 65) * 10,
      alt: 18 + hash2(i, 6, 66) * 14,
    };
  });

  return {
    S,
    size,
    rects,
    buckets,
    lights,
    lanes,
    glints,
    drones,
    searchlight,
    rail: world.mapData.maglev || [],
    turbines: ent('turbine'),
    stacks: ent('foundryStacks'),
    elevator: ent('elevator')[0] || null,
    rocket: ent('rocket')[0] || null,
    ferries: ent('ferry'),
    whale: ent('holowhale')[0] || null,
    reactor: ent('reactor')[0] || null,
  };
}

/** Is art pixel (X, Y) — standing on the ground at art row G — behind a building? */
function hidden(spec, X, Y, G) {
  const { S, size, rects, buckets } = spec;
  const list = buckets.get(Math.floor(Y / S) * size + Math.floor(X / S));
  if (!list) return false;
  for (const id of list) {
    const r = rects[id];
    if (X >= r[0] && X < r[2] && Y >= r[1] && Y < r[3] && r[4] > G) return true;
  }
  return false;
}

export function drawNeonAnimations(ctx, { world, unlocked, time, cell, vx0, vy0, vx1, vy1, spec, motion = true }) {
  if (!spec || !world) return;
  const t = motion ? time : 0;
  const S = spec.S;
  const a = cell / S; // one art pixel
  const inView = (x, y, pad = 2) => x >= vx0 - pad && x <= vx1 + pad && y >= vy0 - pad && y <= vy1 + pad;
  const charted = (x, y) => unlocked.has(`${Math.floor(x)},${Math.floor(y)}`);
  // Draw at art-pixel coordinates.
  const px = (X, Y, w = 1, h = 1) => ctx.fillRect(Math.round(X * a), Math.round(Y * a), Math.max(1, Math.round(w * a)), Math.max(1, Math.round(h * a)));
  const glow = (X, Y, r, rgb, al) => {
    const x = X * a;
    const y = Y * a;
    const R = r * a;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(${rgb},${al})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
  };

  ctx.save();

  // Neon glints on the water and canals.
  const GLINT = ['39,230,255', '255,47,178', '255,207,107'];
  for (const [x, y, h] of spec.glints) {
    if (!inView(x, y, 0) || !charted(x, y)) continue;
    const s = Math.sin(t * 1.5 + h * 14);
    if (s < 0.55) continue;
    ctx.fillStyle = `rgba(${GLINT[Math.floor(h * 30) % 3]},${(s - 0.55) * 1.6})`;
    px(x * S + ((h * 5 + t * 0.7) % 6), y * S + h * 6, 2, 1);
  }

  // Traffic: head and tail lights with a long-exposure streak.
  for (const lane of spec.lanes) {
    const { vertical, fixed, from, len, dir } = lane;
    const tileFixed = fixed / S;
    if (vertical ? tileFixed < vx0 - 1 || tileFixed > vx1 + 1 : tileFixed < vy0 - 1 || tileFixed > vy1 + 1) continue;
    for (const car of lane.cars) {
      const d = (((car.off + t * car.speed) % len) + len) % len;
      const along = dir > 0 ? from + d : from + len - d;
      const X = vertical ? fixed : along;
      const Y = vertical ? along : fixed;
      if (!inView(X / S, Y / S, 0) || !charted(X / S, Y / S) || hidden(spec, X, Y, Y)) continue;
      const fx = vertical ? 0 : dir;
      const fy = vertical ? dir : 0;
      ctx.fillStyle = 'rgba(255,246,216,0.95)';
      px(X, Y);
      ctx.fillStyle = 'rgba(255,240,200,0.3)';
      px(X + fx, Y + fy);
      for (let k = 1; k <= 4; k += 1) {
        ctx.fillStyle = `rgba(255,70,90,${k === 1 ? 0.95 : 0.55 - k * 0.11})`;
        px(X - fx * k, Y - fy * k);
      }
    }
  }

  // The maglev: two trains shuttling between Tether Isle and the Foundry.
  const rail = spec.rail;
  if (rail.length > 40) {
    const n = rail.length;
    const period = n / (4.2 * S) + 6; // seconds end to end, plus a dwell
    for (let k = 0; k < 2; k += 1) {
      const ph = ((t / period + k * 0.5) % 2 + 2) % 2;
      const forward = ph < 1;
      const u = forward ? ph : ph - 1;
      const travel = Math.min(1, Math.max(0, (u * period - 3) / (period - 6)));
      const ease = travel * travel * (3 - 2 * travel);
      const head = Math.round((forward ? ease : 1 - ease) * (n - 1));
      const dir = forward ? 1 : -1;
      const hp = rail[head];
      if (!hp || !inView(hp.x, hp.y, 6)) continue;
      const L = 30;
      for (let j = 0; j < L; j += 1) {
        const i = head - dir * j;
        if (i < 0 || i >= n) break;
        const p = rail[i];
        if (!charted(p.x, p.y)) continue;
        const X = Math.round(p.x * S);
        const G = Math.round(p.y * S);
        const Y = G - MAGLEV_H - 1;
        if (hidden(spec, X, Y, G)) continue;
        const gap = j % 10 === 9;
        const horiz = Math.abs(p.tx) >= Math.abs(p.ty);
        if (horiz) {
          ctx.fillStyle = gap ? 'rgba(40,46,70,1)' : 'rgba(226,234,255,1)';
          px(X, Y - 1);
          ctx.fillStyle = j < 2 ? 'rgba(255,250,225,1)' : gap ? 'rgba(30,34,52,1)' : j % 2 ? 'rgba(39,230,255,1)' : 'rgba(160,245,255,1)';
          px(X, Y);
        } else {
          ctx.fillStyle = gap ? 'rgba(40,46,70,1)' : 'rgba(226,234,255,1)';
          px(X - 1, Y);
          px(X + 1, Y);
          ctx.fillStyle = j < 2 ? 'rgba(255,250,225,1)' : gap ? 'rgba(30,34,52,1)' : 'rgba(39,230,255,1)';
          px(X, Y);
        }
      }
      if (charted(hp.x, hp.y)) {
        ctx.globalCompositeOperation = 'lighter';
        const mid = rail[Math.max(0, Math.min(n - 1, head - dir * 15))];
        glow(mid.x * S, mid.y * S - MAGLEV_H, 22, '39,230,255', 0.22);
        glow(hp.x * S + hp.tx * dir * 4, hp.y * S - MAGLEV_H + hp.ty * dir * 4, 9, '255,245,210', 0.45);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  // Aircraft lights on the tallest towers, twinkling across the skyline.
  ctx.globalCompositeOperation = 'lighter';
  for (const l of spec.lights) {
    if (!inView(l.x / S, l.y / S, 1) || !charted(l.tx, l.ty)) continue;
    const on = ((t * 0.5 + l.ph * 0.6) % 1) < 0.14;
    if (!on || hidden(spec, l.x, l.y, l.base)) continue;
    glow(l.x + 0.5, l.y + 0.5, 3.5, '255,59,92', 0.55);
    ctx.fillStyle = 'rgba(255,210,220,1)';
    px(l.x, l.y);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Wind turbines on the ridge.
  for (const e of spec.turbines) {
    if (!inView(e.x, e.y, 4) || !charted(e.x, e.y)) continue;
    const hx = e.x * S + S / 2 + 0.5;
    const hy = e.y * S + S - 30;
    const ang = t * 1.1 + (e.seed || 0) * 2.1;
    for (let b = 0; b < 3; b += 1) {
      const th = ang + (b * Math.PI * 2) / 3;
      for (let r = 1; r <= 11; r += 1) {
        ctx.fillStyle = r > 8 ? 'rgba(148,162,198,1)' : 'rgba(186,198,228,1)';
        px(Math.round(hx + Math.cos(th) * r), Math.round(hy + Math.sin(th) * r * 0.85));
      }
    }
    ctx.fillStyle = 'rgba(210,220,245,1)';
    px(hx - 1, hy - 1, 2, 2);
    if (Math.sin(t * 2.2 + e.x) > 0.6) {
      ctx.globalCompositeOperation = 'lighter';
      glow(hx, hy - 2, 5, '255,59,92', 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Foundry smoke, lit orange from the furnaces below.
  for (const e of spec.stacks) {
    if (!inView(e.x + 3, e.y, 8) || !charted(e.x, e.y)) continue;
    const x0 = e.x * S + 2;
    const w = e.w * S - 4;
    const base = e.y * S + e.d * S - 2;
    [0.12, 0.32, 0.55, 0.78].forEach((f, i) => {
      const sx = Math.round(x0 + w * f) + 1;
      const sy = base - 12 - (40 + i * 6);
      for (let k = 0; k < 5; k += 1) {
        const ph = (t * 0.2 + k / 5 + i * 0.17) % 1;
        const r = 2 + ph * 6;
        const warm = Math.max(0, 1 - ph * 3);
        ctx.fillStyle = `rgba(${Math.round(90 + warm * 150)},${Math.round(80 + warm * 40)},${Math.round(110 - warm * 50)},${(1 - ph) * 0.45})`;
        px(sx + ph * 14 + Math.sin(ph * 5 + k) * 2 - r / 2, sy - ph * 26 - r / 2, r, r);
      }
    });
  }

  // The space elevator's climber, and steam venting at the launch pad.
  const el = spec.elevator;
  if (el && inView(el.x, el.y, 22) && charted(el.x, el.y)) {
    const cx = el.x * S + S / 2;
    const base = el.y * S + S - 8;
    const ph = (t * 0.05) % 1;
    const y = base - ph * 150;
    ctx.globalCompositeOperation = 'lighter';
    glow(cx + 0.5, y, 7, '255,225,77', 0.7 * (1 - ph));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,245,205,${1 - ph * 0.8})`;
    px(cx - 1, y - 1, 3, 2);
  }
  const rk = spec.rocket;
  if (rk && inView(rk.x, rk.y, 6) && charted(rk.x, rk.y)) {
    const cx = rk.x * S + S / 2;
    const base = rk.y * S + S;
    for (let k = 0; k < 6; k += 1) {
      const ph = (t * 0.3 + k / 6) % 1;
      const side = k % 2 ? 1 : -1;
      const r = 2 + ph * 5;
      ctx.fillStyle = `rgba(205,214,238,${(1 - ph) * 0.4})`;
      px(cx + side * (4 + ph * 16) - r / 2, base - 3 - ph * 6 - r / 2, r, r);
    }
  }

  // Ferry wakes.
  for (const e of spec.ferries) {
    if (!inView(e.x, e.y, 3) || !charted(e.x, e.y)) continue;
    for (let k = 0; k < 2; k += 1) {
      const ph = (t * 0.45 + k * 0.5 + e.x * 0.13) % 1;
      ctx.strokeStyle = `rgba(160,230,255,${(1 - ph) * 0.3})`;
      ctx.lineWidth = Math.max(1, a);
      ctx.beginPath();
      ctx.ellipse((e.x * S + 8) * a, (e.y * S + 3) * a, (9 + ph * 8) * a, (2 + ph * 2.5) * a, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The reactor breathes.
  const re = spec.reactor;
  if (re && inView(re.x, re.y, 6) && charted(re.x, re.y)) {
    const beat = (t * 0.55) % 1;
    ctx.globalCompositeOperation = 'lighter';
    glow(re.x * S + (re.w * S) / 2 - 6, re.y * S + re.d * S - 20, 26, '77,124,255', 0.22 * Math.max(0, 1 - beat * 2.5));
    ctx.globalCompositeOperation = 'source-over';
  }

  // Searchlights sweeping the sky from the Arcology's crown.
  const sl = spec.searchlight;
  if (sl && inView(sl.tx, sl.ty - 12, 16) && charted(sl.tx, sl.ty)) {
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k += 1) {
      const ang = -Math.PI / 2 + Math.sin(t * 0.35 + k * 2.4) * 0.75;
      const len = 120 * a;
      const x = sl.x * a;
      const y = sl.y * a;
      const ex = x + Math.cos(ang) * len;
      const ey = y + Math.sin(ang) * len;
      const w = 11 * a;
      const g = ctx.createLinearGradient(x, y, ex, ey);
      g.addColorStop(0, 'rgba(190,225,255,0.22)');
      g.addColorStop(1, 'rgba(190,225,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex - Math.sin(ang) * w, ey + Math.cos(ang) * w);
      ctx.lineTo(ex + Math.sin(ang) * w, ey - Math.cos(ang) * w);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // The Holo-Whale, swimming a slow loop above Meridian Bay.
  const wh = spec.whale;
  if (wh && charted(wh.x, wh.y)) {
    const ang = t * 0.07;
    const wx = (wh.x + Math.cos(ang) * 6) * S;
    const wy = (wh.y + Math.sin(ang) * 2) * S - 26;
    if (inView(wx / S, wy / S, 8)) {
      const right = Math.sin(ang) < 0; // heading east
      const s = 2;
      const W = WHALE[0].length * s;
      const H = WHALE.length * s;
      const x0 = Math.round(wx - W / 2);
      const y0 = Math.round(wy - H / 2 + Math.sin(t * 0.9) * 2);
      const flick = Math.sin(t * 11) > 0.94 ? 0.45 : 1;
      // Projected from a buoy on the water: a faint beam up to the belly.
      const bx = wx;
      const by = (wh.y + Math.sin(ang) * 2) * S + 4;
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, by * a, 0, (y0 + H) * a);
      beam.addColorStop(0, `rgba(39,230,255,${0.3 * flick})`);
      beam.addColorStop(1, 'rgba(39,230,255,0.02)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo((bx - 1) * a, by * a);
      ctx.lineTo((bx + 1) * a, by * a);
      ctx.lineTo((x0 + W * 0.75) * a, (y0 + H) * a);
      ctx.lineTo((x0 + W * 0.25) * a, (y0 + H) * a);
      ctx.closePath();
      ctx.fill();
      glow(wx, wy, 40, '39,230,255', 0.14 * flick);
      glow(bx, by, 6, '39,230,255', 0.6);
      for (let r = 0; r < WHALE.length; r += 1) {
        const row = WHALE[r];
        const scan = (r + Math.floor(t * 4)) % 3 === 0 ? 0.1 : 0.3;
        for (let c = 0; c < row.length; c += 1) {
          if (row[c] === '.') continue;
          const cc = right ? row.length - 1 - c : c;
          const tail = c > 16 ? Math.round(Math.sin(t * 1.8) * (c - 16) * 0.35) : 0;
          ctx.fillStyle = row[c] === 'o' ? `rgba(255,255,255,${0.95 * flick})`
            : WHALE_EDGE[r][c] ? `rgba(150,250,255,${0.8 * flick})` : `rgba(39,230,255,${scan * flick})`;
          px(x0 + cc * s, y0 + r * s + tail, s, s);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(200,250,255,1)';
      px(bx - 0.5, by - 0.5);
    }
  }

  // Drones drifting over the districts, nav lights blinking.
  for (const d of spec.drones) {
    const x = d.cx + Math.sin(t * d.a + d.ph) * d.rx;
    const y = d.cy + Math.sin(t * d.b + d.ph * 1.7) * d.ry;
    if (!inView(x, y, 1) || !charted(x, y)) continue;
    const X = x * S;
    const Y = y * S - d.alt;
    ctx.fillStyle = 'rgba(20,22,36,0.9)';
    px(X - 1, Y, 3, 1);
    ctx.fillStyle = 'rgba(1,2,10,0.25)';
    px(X, y * S + 1, 2, 1);
    const blink = Math.sin(t * 5 + d.ph * 3) > 0;
    ctx.fillStyle = blink ? 'rgba(255,59,92,1)' : 'rgba(77,255,157,1)';
    px(blink ? X - 2 : X + 2, Y);
  }

  ctx.restore();
}
