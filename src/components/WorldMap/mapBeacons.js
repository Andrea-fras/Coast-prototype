/**
 * mapBeacons.js — signs of undiscovered places, drawn over the fog.
 *
 * Each landmark leaks one tell-tale through the fog: smoke, a light, a sound
 * made visible. They are chunky pixel effects in world space (they scale with
 * zoom) and deliberately cheap: a handful of rects per beacon per frame.
 */

import { GLIMPSE_TILES } from './mapFog';
import { drawSkyhaven } from './lumenProps';
import { makeCanvas } from './lumenPalette';

/** Which undiscovered items show a beacon right now. */
export function visibleBeacons(items, fogDist, size) {
  return items.filter((it) => {
    if (it.discovered || !it.beacon) return false;
    const d = fogDist ? fogDist[it.y * size + it.x] : 99;
    if (it.kind === 'chest') return d <= GLIMPSE_TILES + 1;
    if (it.minor) return it.sectionsAway <= 2 || d <= GLIMPSE_TILES;
    return it.always || it.sectionsAway <= 3 || d <= GLIMPSE_TILES + 2;
  });
}

let skySprite = null;
function skyhavenSprite() {
  if (skySprite) return skySprite;
  const cv = makeCanvas(60, 76);
  drawSkyhaven(cv, 2, 2);
  const c = document.createElement('canvas');
  c.width = 60;
  c.height = 76;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(cv.px.buffer), 60, 76), 0, 0);
  skySprite = c;
  return c;
}

function blob(ctx, x, y, r, px) {
  // A pixel-stepped disc: rows of rects snapped to the beacon pixel grid.
  const R = Math.max(px, Math.round(r / px) * px);
  for (let dy = -R; dy <= R; dy += px) {
    const half = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy)) / px) * px;
    ctx.fillRect(Math.round((x - half) / px) * px, Math.round((y + dy) / px) * px, half * 2 + px, px);
  }
}

function glowAt(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function star(ctx, x, y, s, px, color) {
  ctx.fillStyle = color;
  const X = Math.round(x / px) * px;
  const Y = Math.round(y / px) * px;
  ctx.fillRect(X, Y, px, px);
  if (s > 0.4) {
    ctx.fillRect(X - px, Y, px, px);
    ctx.fillRect(X + px, Y, px, px);
    ctx.fillRect(X, Y - px, px, px);
    ctx.fillRect(X, Y + px, px, px);
  }
  if (s > 0.8) {
    ctx.fillRect(X - 2 * px, Y, px, px);
    ctx.fillRect(X + 2 * px, Y, px, px);
    ctx.fillRect(X, Y - 2 * px, px, px);
    ctx.fillRect(X, Y + 2 * px, px, px);
  }
}

function pill(ctx, x, y, w, h, px) {
  // A pixel-stepped ellipse w×h centred on (x, y).
  const rows = Math.max(1, Math.round(h / px));
  for (let r = 0; r < rows; r += 1) {
    const v = ((r + 0.5) / rows) * 2 - 1;
    const half = Math.round(((w / 2) * Math.sqrt(1 - v * v)) / px) * px;
    ctx.fillRect(Math.round((x - half) / px) * px, Math.round((y - h / 2) / px) * px + r * px, half * 2 || px, px);
  }
}

// The Holo-Whale, facing left. X body, o eye.
const HOLO_WHALE = [
  '......XXXXXXXX........',
  '...XXXXXXXXXXXXXX...XX',
  '.XXXXXXXXXXXXXXXXXX.XX',
  'XXoXXXXXXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXXXXXX.XX',
  '..XXXXXX.XXXXXXX....XX',
  '.....XX...............',
];

const seedOf = (it) => ((it.x * 73856093) ^ (it.y * 19349663)) % 1000 / 1000;

/**
 * Draw every visible beacon. ctx is already in world space (1 tile = cell px).
 * `motion` false (reduced motion) freezes them in a readable pose; `night`
 * switches the shared beacons to neon colours for Neon Meridian's smog.
 */
export function drawBeacons(ctx, { items, time, cell, motion = true, night = false }) {
  const t = motion ? time : 1.3;
  const px = Math.max(2, Math.round(cell / 6));
  ctx.save();
  for (const it of items) {
    const x = (it.x + 0.5) * cell;
    const y = (it.y + 0.5) * cell;
    const sd = seedOf(it);
    switch (it.beacon) {
      case 'smoke': {
        glowAt(ctx, x, y, cell * 2.4, '255,120,50', 0.35 + 0.1 * Math.sin(t * 2 + sd * 9));
        for (let k = 0; k < 7; k += 1) {
          const ph = (t * 0.16 + k / 7 + sd) % 1;
          const shade = 70 + ph * 70;
          ctx.fillStyle = `rgba(${shade},${shade - 4},${shade + 10},${(1 - ph) * 0.62})`;
          blob(ctx, x + (Math.sin(ph * 3 + k) * 0.5 + ph * 1.6) * cell, y - (0.6 + ph * 6) * cell, (0.35 + ph * 1.05) * cell, px);
        }
        break;
      }
      case 'campfire':
      case 'chimney': {
        if (it.beacon === 'campfire') glowAt(ctx, x, y, cell * 1.6, '255,150,60', 0.4 + 0.15 * Math.sin(t * 9 + sd * 7));
        for (let k = 0; k < 5; k += 1) {
          const ph = (t * 0.22 + k / 5 + sd) % 1;
          ctx.fillStyle = `rgba(200,205,215,${(1 - ph) * 0.45})`;
          blob(ctx, x + (Math.sin(ph * 4 + k) * 0.3 + ph * 0.9) * cell, y - (0.4 + ph * 3.2) * cell, (0.18 + ph * 0.45) * cell, px);
        }
        break;
      }
      case 'aurora': {
        // Two soft curtains of light, one continuous column per beacon pixel, with rays.
        ctx.globalCompositeOperation = 'lighter';
        const ribbons = [['110,255,170', 0], ['90,210,255', 1]];
        for (const [col, r] of ribbons) {
          for (let k = -22; k <= 22; k += 1) {
            const ax = x + k * px;
            const wave = Math.sin(k * 0.22 + t * (0.5 + r * 0.15) + r * 1.7) * cell * 0.7;
            const top = y - (4.6 + r * 0.9) * cell + wave;
            const h = (1.9 + 0.5 * Math.sin(k * 0.31 + t * 0.7 + r)) * cell;
            const edge = 1 - (Math.abs(k) / 23) ** 2;
            const ray = 0.65 + 0.35 * Math.sin(k * 1.3 + t * 1.1 + r * 2);
            const a = 0.2 * edge * ray;
            const g = ctx.createLinearGradient(0, top, 0, top + h);
            g.addColorStop(0, `rgba(${col},0)`);
            g.addColorStop(0.7, `rgba(${col},${a})`);
            g.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(Math.round(ax / px) * px, top, px, h);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'eerie': {
        glowAt(ctx, x, y, cell * 2.6, '120,255,140', 0.28 + 0.12 * Math.sin(t * 1.6));
        for (let k = 0; k < 6; k += 1) {
          const ph = (t * 0.25 + k / 6) % 1;
          ctx.fillStyle = `rgba(170,255,170,${(1 - ph) * 0.9})`;
          ctx.fillRect(Math.round((x + Math.sin(k * 2.1 + t) * cell) / px) * px, Math.round((y - ph * 3 * cell) / px) * px, px, px);
        }
        break;
      }
      case 'sparkle':
      case 'glint': {
        const n = it.beacon === 'glint' ? 1 : 4;
        for (let k = 0; k < n; k += 1) {
          const ph = (t * (it.beacon === 'glint' ? 0.35 : 0.6) + k * 0.27 + sd) % 1;
          const s = ph < 0.25 ? Math.sin((ph / 0.25) * Math.PI) : 0;
          if (s <= 0) continue;
          const ox = it.beacon === 'glint' ? 0 : Math.sin(k * 2.4 + sd * 10) * 1.6 * cell;
          const oy = it.beacon === 'glint' ? -0.2 * cell : Math.cos(k * 1.7 + sd * 7) * 1.2 * cell;
          const tint = night ? (k % 2 ? '255,47,178' : '39,230,255') : '255,215,110';
          glowAt(ctx, x + ox, y + oy, cell * 0.9 * s, tint, 0.5 * s);
          star(ctx, x + ox, y + oy, s, px, night ? `rgba(225,250,255,${0.5 + s * 0.5})` : `rgba(255,248,210,${0.5 + s * 0.5})`);
        }
        break;
      }
      case 'wisps': {
        for (let k = 0; k < 4; k += 1) {
          const wx = x + Math.sin(t * (0.5 + k * 0.13) + k * 1.9) * cell * 1.6;
          const wy = y - cell * 0.6 + Math.cos(t * (0.7 + k * 0.1) + k) * cell * 0.9;
          glowAt(ctx, wx, wy, cell * 0.9, '190,255,140', 0.5);
          ctx.fillStyle = 'rgba(235,255,200,0.95)';
          ctx.fillRect(Math.round(wx / px) * px, Math.round(wy / px) * px, px, px);
        }
        break;
      }
      case 'sails': {
        const cy = y - cell * 0.9;
        ctx.fillStyle = night ? 'rgba(150,160,205,0.75)' : 'rgba(52,56,76,0.7)';
        if (night && Math.sin(t * 2.2 + sd * 6) > 0.4) {
          glowAt(ctx, x, cy, cell * 0.8, '255,59,92', 0.7);
        }
        for (let k = 0; k < 4; k += 1) {
          const a = t * 0.9 + (k * Math.PI) / 2;
          for (let s = 1; s <= 6; s += 1) {
            ctx.fillRect(Math.round((x + Math.cos(a) * s * px) / px) * px, Math.round((cy + Math.sin(a) * s * px) / px) * px, px, px);
            if (s > 2) ctx.fillRect(Math.round((x + Math.cos(a) * s * px - Math.sin(a) * px) / px) * px, Math.round((cy + Math.sin(a) * s * px + Math.cos(a) * px) / px) * px, px, px);
          }
        }
        break;
      }
      case 'mist': {
        ctx.globalCompositeOperation = 'lighter';
        const arc = 0.22 + 0.08 * Math.sin(t * 0.8);
        ['255,90,90', '255,200,80', '120,230,120', '90,160,255'].forEach((c, i) => {
          ctx.strokeStyle = `rgba(${c},${arc})`;
          ctx.lineWidth = px;
          ctx.beginPath();
          ctx.arc(x, y + cell * 0.6, cell * (2.1 - i * 0.28), Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        });
        ctx.globalCompositeOperation = 'source-over';
        for (let k = 0; k < 10; k += 1) {
          const ph = (t * 0.5 + k / 10 + sd) % 1;
          ctx.fillStyle = `rgba(235,250,255,${(1 - ph) * 0.8})`;
          ctx.fillRect(Math.round((x + Math.sin(k * 3.3) * cell * 0.9) / px) * px, Math.round((y - ph * 2.2 * cell) / px) * px, px, px);
        }
        break;
      }
      case 'petals': {
        for (let k = 0; k < 10; k += 1) {
          const ph = (t * 0.12 + k / 10 + sd) % 1;
          const pxx = x + (ph * 4 + Math.sin(ph * 9 + k) * 0.4) * cell;
          const pyy = y - cell + (ph * 2.2 + Math.cos(ph * 7 + k) * 0.3) * cell;
          ctx.fillStyle = k % 3 ? `rgba(255,170,205,${1 - ph})` : `rgba(255,225,238,${1 - ph})`;
          ctx.fillRect(Math.round(pxx / px) * px, Math.round(pyy / px) * px, px * (k % 2 ? 2 : 1), px);
        }
        break;
      }
      case 'lanterns': {
        glowAt(ctx, x, y - cell, cell * 3, '255,200,110', 0.22);
        for (let k = 0; k < 7; k += 1) {
          const ph = (t * 0.08 + k / 7 + sd) % 1;
          const lx = x + (Math.sin(k * 2.2) * 1.8 + Math.sin(ph * 5 + k) * 0.3) * cell;
          const ly = y - (0.8 + ph * 4.5) * cell;
          const a = ph < 0.1 ? ph * 10 : 1 - ph;
          glowAt(ctx, lx, ly, cell * 0.7, '255,190,90', 0.6 * a);
          ctx.fillStyle = `rgba(255,236,170,${a})`;
          ctx.fillRect(Math.round(lx / px) * px, Math.round(ly / px) * px, px, px * 2);
        }
        break;
      }
      case 'beam': {
        const pulse = 0.3 + 0.08 * Math.sin(t * 1.3);
        const top = y - cell * 10;
        const g = ctx.createLinearGradient(0, y, 0, top);
        g.addColorStop(0, `rgba(255,214,110,${pulse + 0.2})`);
        g.addColorStop(1, 'rgba(255,214,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - cell * 0.35, top, cell * 0.7, y - top);
        ctx.fillStyle = `rgba(255,248,215,${pulse})`;
        ctx.fillRect(x - px / 2, top + cell * 2, px, y - top - cell * 2);
        glowAt(ctx, x, y, cell * 1.8, '255,214,110', 0.45);
        break;
      }
      case 'prism': {
        ctx.globalCompositeOperation = 'lighter';
        ['120,230,255', '190,150,255', '255,150,220'].forEach((c, i) => {
          const a = -Math.PI / 2 + (i - 1) * 0.3 + Math.sin(t * 0.5 + i) * 0.08;
          const len = cell * (6 + i);
          const ex = x + Math.cos(a) * len;
          const ey = y + Math.sin(a) * len;
          const g = ctx.createLinearGradient(x, y, ex, ey);
          g.addColorStop(0, `rgba(${c},0.45)`);
          g.addColorStop(1, `rgba(${c},0)`);
          ctx.strokeStyle = g;
          ctx.lineWidth = cell * 0.45;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        });
        ctx.globalCompositeOperation = 'source-over';
        glowAt(ctx, x, y, cell * 1.6, '200,230,255', 0.45);
        break;
      }
      case 'runes': {
        const ph = (t * 0.35 + sd) % 1;
        ctx.strokeStyle = `rgba(140,255,230,${(1 - ph) * 0.6})`;
        ctx.lineWidth = px;
        ctx.beginPath();
        ctx.ellipse(x, y, cell * (0.6 + ph * 2.4), cell * (0.4 + ph * 1.6), 0, 0, Math.PI * 2);
        ctx.stroke();
        glowAt(ctx, x, y, cell * 1.6, '140,255,230', 0.35);
        for (let k = 0; k < 5; k += 1) {
          const b = (t * 0.4 + k / 5) % 1;
          ctx.fillStyle = `rgba(220,255,250,${(1 - b) * 0.8})`;
          ctx.fillRect(Math.round((x + Math.sin(k * 2.7) * cell) / px) * px, Math.round((y - b * 1.6 * cell) / px) * px, px, px);
        }
        break;
      }
      case 'sky': {
        const img = skyhavenSprite();
        const s = cell / 8;
        const bob = Math.sin(t * 0.7) * cell * 0.18;
        ctx.fillStyle = 'rgba(40,50,90,0.18)';
        blob(ctx, x + cell * 0.8, y + cell * 2.2, cell * 2.6, px);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x - 30 * s, y - 72 * s + bob, 60 * s, 76 * s);
        break;
      }
      case 'whale': {
        const ph = (t * 0.16 + sd) % 1;
        if (ph < 0.25) {
          const p = ph / 0.25;
          for (let k = 0; k < 9; k += 1) {
            const a = -Math.PI / 2 + (k - 4) * 0.22;
            const r = p * cell * 1.8;
            ctx.fillStyle = `rgba(235,250,255,${1 - p})`;
            ctx.fillRect(Math.round((x + Math.cos(a) * r) / px) * px, Math.round((y - cell * 0.4 + Math.sin(a) * r + p * p * cell) / px) * px, px, px);
          }
        } else if (ph > 0.45 && ph < 0.6) {
          const p = (ph - 0.45) / 0.15;
          ctx.fillStyle = `rgba(40,56,90,${Math.sin(p * Math.PI) * 0.8})`;
          const tx = x + cell * 0.8;
          ctx.fillRect(tx - px * 2, y - px, px * 5, px);
          ctx.fillRect(tx - px * 3, y - px * 2, px * 2, px);
          ctx.fillRect(tx + px * 2, y - px * 2, px * 2, px);
        }
        break;
      }
      case 'stars': {
        for (let k = 0; k < 9; k += 1) {
          const sx = x + Math.sin(k * 2.39 + sd * 5) * cell * 2.6;
          const sy = y - cell * (2 + (k % 4) * 0.9);
          const s = 0.5 + 0.5 * Math.sin(t * (1.4 + k * 0.3) + k);
          star(ctx, sx, sy, s, px, `rgba(255,250,230,${0.35 + s * 0.6})`);
        }
        const sh = (t * 0.12 + sd) % 1;
        if (sh < 0.12) {
          const p = sh / 0.12;
          const hx = x - cell * 3 + p * cell * 6;
          const hy = y - cell * 5 + p * cell * 2;
          for (let k = 0; k < 6; k += 1) {
            ctx.fillStyle = `rgba(255,250,230,${(1 - k / 6) * (1 - p)})`;
            ctx.fillRect(Math.round((hx - k * px) / px) * px, Math.round((hy - k * px * 0.33) / px) * px, px, px);
          }
        }
        break;
      }
      case 'crown': {
        // A lit crown above the smog: a slow beam and a red aviation light.
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + sd * 6);
        const base = y - cell * 2;
        const top = y - cell * 13;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, base, 0, top);
        g.addColorStop(0, `rgba(255,47,178,${0.34 + pulse * 0.16})`);
        g.addColorStop(0.5, 'rgba(155,92,255,0.14)');
        g.addColorStop(1, 'rgba(39,230,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - cell * 0.35, top, cell * 0.7, base - top);
        ctx.fillStyle = `rgba(255,190,235,${0.4 + pulse * 0.3})`;
        ctx.fillRect(Math.round(x / px) * px, top + cell * 3, px, base - top - cell * 3);
        glowAt(ctx, x, base, cell * 3.4, '255,47,178', 0.22 + pulse * 0.14);
        ctx.globalCompositeOperation = 'source-over';
        if (Math.sin(t * 3 + sd * 5) > 0.2) {
          glowAt(ctx, x, base - cell * 0.4, cell, '255,59,92', 0.8);
          ctx.fillStyle = '#ffd0da';
          ctx.fillRect(Math.round(x / px) * px, Math.round((base - cell * 0.4) / px) * px, px, px);
        }
        break;
      }
      case 'arcade': {
        // Chiptune made visible: little coloured notes bubbling up.
        const cols = ['255,47,178', '39,230,255', '255,225,77', '77,255,157'];
        glowAt(ctx, x, y, cell * 2.2, '155,92,255', 0.28 + 0.1 * Math.sin(t * 4 + sd));
        for (let k = 0; k < 8; k += 1) {
          const ph = (t * 0.3 + k / 8 + sd) % 1;
          const nx = x + (Math.sin(k * 2.3) * 1.3 + Math.sin(ph * 6 + k) * 0.3) * cell;
          const ny = y - (0.5 + ph * 3.8) * cell;
          const a = ph < 0.1 ? ph * 10 : 1 - ph;
          const X = Math.round(nx / px) * px;
          const Y = Math.round(ny / px) * px;
          ctx.fillStyle = `rgba(${cols[k % 4]},${a})`;
          ctx.fillRect(X, Y, px * 2, px);
          ctx.fillRect(X + px, Y - px * 2, px, px * 2);
        }
        break;
      }
      case 'airship': {
        const ax = x + Math.sin(t * 0.15 + sd * 6) * cell * 2.2;
        const ay = y - cell * 5.5 + Math.sin(t * 0.6) * cell * 0.3;
        const sweep = Math.sin(t * 0.7 + sd * 4) * 0.55;
        const len = cell * 5.5;
        const ex = ax + Math.sin(sweep) * len;
        const ey = ay + Math.cos(sweep) * len;
        const w = cell * 1.4;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(ax, ay, ex, ey);
        g.addColorStop(0, 'rgba(200,235,255,0.34)');
        g.addColorStop(1, 'rgba(200,235,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex - Math.cos(sweep) * w, ey + Math.sin(sweep) * w);
        ctx.lineTo(ex + Math.cos(sweep) * w, ey - Math.sin(sweep) * w);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(44,48,76,0.96)';
        pill(ctx, ax, ay - cell * 0.5, cell * 3.4, cell * 1.1, px);
        ctx.fillStyle = 'rgba(60,66,100,0.96)';
        pill(ctx, ax, ay - cell * 0.62, cell * 2.8, cell * 0.4, px);
        const ad = Math.sin(t * 5 + sd) > -0.7;
        ctx.fillStyle = ad ? 'rgba(255,47,178,0.95)' : 'rgba(39,230,255,0.9)';
        ctx.fillRect(Math.round((ax - cell * 0.9) / px) * px, Math.round((ay - cell * 0.5) / px) * px, Math.round((cell * 1.8) / px) * px, px);
        ctx.fillStyle = 'rgba(30,32,52,1)';
        ctx.fillRect(Math.round((ax - cell * 0.3) / px) * px, Math.round(ay / px) * px, Math.round((cell * 0.6) / px) * px, px);
        if (Math.sin(t * 2.6 + sd * 3) > 0.3) {
          glowAt(ctx, ax - cell * 1.7, ay - cell * 0.5, cell * 0.5, '255,59,92', 0.9);
          glowAt(ctx, ax + cell * 1.7, ay - cell * 0.5, cell * 0.5, '77,255,157', 0.9);
        }
        break;
      }
      case 'pulse': {
        // A slow heartbeat of blue light and rings.
        const beat = (t * 0.55 + sd) % 1;
        glowAt(ctx, x, y, cell * 2.8, '77,124,255', 0.26 + 0.28 * Math.max(0, 1 - beat * 4));
        ctx.lineWidth = px;
        for (let k = 0; k < 2; k += 1) {
          const ph = (beat + k * 0.5) % 1;
          ctx.strokeStyle = `rgba(110,200,255,${(1 - ph) * 0.7})`;
          ctx.beginPath();
          ctx.ellipse(x, y, cell * (0.5 + ph * 3.5), cell * (0.35 + ph * 2.4), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200,235,255,0.95)';
        blob(ctx, x, y - cell * 0.2, px * 1.5, px);
        break;
      }
      case 'blink': {
        // Racks of status lights, blinking out of step.
        glowAt(ctx, x, y - cell * 0.8, cell * 2.2, '39,230,255', 0.16);
        for (let k = 0; k < 16; k += 1) {
          if (Math.sin(t * (2 + (k % 5) * 0.7) + k * 1.9 + sd * 7) < 0.15) continue;
          const bx = x + ((k % 4) - 1.5) * cell * 0.7;
          const by = y - cell * 0.6 - Math.floor(k / 4) * cell * 0.45;
          ctx.fillStyle = k % 3 ? 'rgba(77,255,157,0.95)' : 'rgba(39,230,255,0.95)';
          ctx.fillRect(Math.round(bx / px) * px, Math.round(by / px) * px, px, px);
        }
        break;
      }
      case 'eyes': {
        // Something enormous, half asleep: two red eyes that open and close.
        const open = 0.5 + 0.5 * Math.sin(t * 0.5 + sd * 5);
        if ((t * 0.3 + sd) % 1 < 0.05) break;
        for (const dx of [-0.55, 0.55]) {
          glowAt(ctx, x + dx * cell, y - cell, cell * 1.1, '255,59,92', 0.3 + open * 0.45);
          ctx.fillStyle = `rgba(255,140,160,${0.55 + open * 0.45})`;
          ctx.fillRect(Math.round((x + dx * cell) / px) * px - px, Math.round((y - cell) / px) * px, px * 2, px);
        }
        break;
      }
      case 'rings': {
        // Radio pings rising from the dishes.
        ctx.lineWidth = px;
        for (let k = 0; k < 3; k += 1) {
          const ph = (t * 0.4 + k / 3 + sd) % 1;
          ctx.strokeStyle = `rgba(120,255,200,${(1 - ph) * 0.7})`;
          ctx.beginPath();
          ctx.arc(x, y - cell * 0.8, cell * (0.5 + ph * 3), Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
        glowAt(ctx, x, y - cell * 0.6, cell * 1.2, '120,255,200', 0.4);
        break;
      }
      case 'holo': {
        // The Holo-Whale swimming through the air, scanlines and all.
        const s = Math.max(px, Math.round((cell * 0.34) / px) * px);
        const w = HOLO_WHALE[0].length * s;
        const h = HOLO_WHALE.length * s;
        const hx = x + Math.sin(t * 0.18 + sd * 4) * cell * 2.5 - w / 2;
        const hy = y - cell * 4.5 + Math.sin(t * 0.9) * cell * 0.35 - h / 2;
        const flick = Math.sin(t * 13 + sd) > 0.93 ? 0.45 : 1;
        glowAt(ctx, hx + w / 2, hy + h / 2, w * 0.8, '39,230,255', 0.2 * flick);
        ctx.globalCompositeOperation = 'lighter';
        for (let r = 0; r < HOLO_WHALE.length; r += 1) {
          const row = HOLO_WHALE[r];
          const scan = (r + Math.floor(t * 6)) % 4 === 0 ? 0.25 : 0.55;
          for (let c = 0; c < row.length; c += 1) {
            if (row[c] === '.') continue;
            ctx.fillStyle = row[c] === 'o'
              ? `rgba(255,255,255,${0.9 * flick})`
              : `rgba(39,230,255,${scan * flick})`;
            ctx.fillRect(Math.round(hx / px) * px + c * s, Math.round(hy / px) * px + r * s, s, s);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'tether': {
        // A cable of light straight up into orbit, with a climber on it.
        const top = y - cell * 28;
        const g = ctx.createLinearGradient(0, y, 0, top);
        g.addColorStop(0, 'rgba(170,232,255,0.75)');
        g.addColorStop(1, 'rgba(170,232,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.round(x / px) * px, top, px, y - top);
        const ph = (t * 0.07 + sd) % 1;
        const cy = y - cell - ph * (y - cell - top);
        glowAt(ctx, x, cy, cell * 1.1, '255,225,77', 0.75 * (1 - ph));
        ctx.fillStyle = `rgba(255,245,205,${1 - ph})`;
        ctx.fillRect(Math.round(x / px) * px - px, Math.round(cy / px) * px, px * 3, px * 2);
        glowAt(ctx, x, y, cell * 1.6, '170,232,255', 0.4);
        break;
      }
      case 'rocket': {
        // A white spire above the fog, venting steam, nose light blinking.
        glowAt(ctx, x, y, cell * 1.8, '255,138,43', 0.22 + 0.1 * Math.sin(t * 7 + sd));
        for (let k = 0; k < 6; k += 1) {
          const ph = (t * 0.25 + k / 6 + sd) % 1;
          const side = k % 2 ? 1 : -1;
          ctx.fillStyle = `rgba(205,214,238,${(1 - ph) * 0.5})`;
          blob(ctx, x + side * (0.4 + ph * 2) * cell, y - (0.2 + ph * 0.8) * cell, (0.25 + ph * 0.7) * cell, px);
        }
        const nose = y - cell * 4.2;
        ctx.fillStyle = 'rgba(222,230,248,0.96)';
        ctx.fillRect(Math.round(x / px) * px - px, Math.round(nose / px) * px, px * 2, Math.round((cell * 3.6) / px) * px);
        ctx.fillStyle = 'rgba(160,172,205,0.96)';
        ctx.fillRect(Math.round(x / px) * px, Math.round(nose / px) * px, px, Math.round((cell * 3.6) / px) * px);
        if (Math.sin(t * 2.4 + sd * 4) > 0.45) glowAt(ctx, x, nose, cell * 0.7, '255,59,92', 0.9);
        break;
      }
      default:
        break;
    }
  }
  ctx.restore();
}
