/**
 * mapLightning.js — storms in Neon Meridian's smog. The pollution keeps the
 * cloud deck charged, so every second or two lightning flickers somewhere in
 * the fog of war: a flash that lights the clouds from inside, and a jagged
 * pixel bolt with a few branches crawling across the cloud tops.
 *
 * Strikes only land over deep fog (never over charted land) and only where
 * the student is looking. Drawn each frame over the fog, in world space
 * (1 tile = cell px, 1 art px = cell / 8).
 */

const storms = new WeakMap(); // world → { next, strikes }

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A main bolt and a few branches, as polylines in tiles relative to the strike. */
function boltPaths(seed) {
  const rnd = rng(seed);
  const walk = (x, y, ang, n, step) => {
    const pts = [[x, y]];
    for (let i = 0; i < n; i += 1) {
      ang += (rnd() - 0.5) * 1.4;
      const len = step * (0.6 + rnd() * 0.8);
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len * 0.8;
      pts.push([x, y]);
    }
    return pts;
  };
  const main = walk(0, 0, rnd() * Math.PI * 2, 7 + Math.floor(rnd() * 5), 0.42);
  const paths = [main];
  const branches = 1 + Math.floor(rnd() * 3);
  for (let b = 0; b < branches; b += 1) {
    const [bx, by] = main[1 + Math.floor(rnd() * (main.length - 2))];
    paths.push(walk(bx, by, rnd() * Math.PI * 2, 2 + Math.floor(rnd() * 3), 0.3));
  }
  return paths;
}

/** Brightness over a strike's life: a double flicker, then the glow dies away. */
function envelope(age) {
  if (age < 0) return 0;
  if (age < 0.05) return 1;
  if (age < 0.11) return 0.2;
  if (age < 0.17) return 0.85;
  return 0.85 * Math.exp(-(age - 0.17) * 5.5);
}

const LIFE = 1.1;

export function drawLightning(ctx, { world, dist, time, cell, vx0, vy0, vx1, vy1, motion = true }) {
  if (!motion || !dist || !world) return;
  const size = world.size;
  const depth = (x, y) => {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) return 0;
    return dist[ty * size + tx];
  };

  let storm = storms.get(world);
  if (!storm) {
    storm = { next: time + 0.6, strikes: [] };
    storms.set(world, storm);
  }
  if (time < storm.next - 10) storm.next = time; // the clock jumped (tab asleep)
  if (time >= storm.next) {
    // Sometimes the sky answers itself: a second strike close behind the first.
    const count = Math.random() < 0.25 ? 2 : 1;
    for (let c = 0; c < count; c += 1) {
      for (let tries = 0; tries < 24; tries += 1) {
        const x = vx0 + Math.random() * Math.max(1, vx1 - vx0);
        const y = vy0 + Math.random() * Math.max(1, vy1 - vy0);
        const d = depth(x, y);
        if (d < 4) continue;
        storm.strikes.push({
          x, y, t0: time + c * (0.15 + Math.random() * 0.25),
          seed: (Math.random() * 4294967296) >>> 0,
          R: Math.min(d - 0.5, 2.5 + Math.random() * 3),
        });
        break;
      }
    }
    storm.next = time + 0.8 + Math.random() * 2.2;
  }
  storm.strikes = storm.strikes.filter((k) => time - k.t0 < LIFE);
  if (!storm.strikes.length) return;

  const a = cell / 8; // one art pixel
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const k of storm.strikes) {
    const e = envelope(time - k.t0);
    if (e <= 0.01) continue;
    const cx = k.x * cell;
    const cy = k.y * cell;
    // The cloud lit from inside.
    const R = k.R * cell;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, `rgba(205,215,245,${0.5 * e})`);
    g.addColorStop(0.45, `rgba(150,160,200,${0.22 * e})`);
    g.addColorStop(1, 'rgba(150,160,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    if (e < 0.3) continue;
    // The bolt: a soft halo, then a hard one-art-pixel core.
    const paths = k.paths || (k.paths = boltPaths(k.seed));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(170,185,255,${0.28 * e})`;
    ctx.lineWidth = a * 3;
    ctx.beginPath();
    for (const path of paths) {
      for (let i = 1; i < path.length; i += 1) {
        const [x0, y0] = path[i - 1];
        const [x1, y1] = path[i];
        if (depth(k.x + x0, k.y + y0) < 2 || depth(k.x + x1, k.y + y1) < 2) continue;
        ctx.moveTo(cx + x0 * cell, cy + y0 * cell);
        ctx.lineTo(cx + x1 * cell, cy + y1 * cell);
      }
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(240,244,255,${e})`;
    const px = Math.max(1, Math.round(a));
    for (const [p, path] of paths.entries()) {
      for (let i = 1; i < path.length; i += 1) {
        const [x0, y0] = path[i - 1];
        const [x1, y1] = path[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 8));
        for (let s = 0; s <= steps; s += 1) {
          const x = k.x + x0 + ((x1 - x0) * s) / steps;
          const y = k.y + y0 + ((y1 - y0) * s) / steps;
          if (depth(x, y) < 2) continue; // stay inside the fog
          if (p > 0 && e < 0.6) continue; // branches only show on the brightest flickers
          ctx.fillRect(Math.round((x * cell) / px) * px, Math.round((y * cell) / px) * px, px, px);
        }
      }
    }
  }
  ctx.restore();
}
