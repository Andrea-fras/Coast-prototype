/**
 * Ambient map animations — drawn on top of the cached world blit each frame.
 * Keeps the static terrain canvas untouched; only overlays lightweight effects
 * in the visible, charted viewport.
 */
import { TERRAIN } from './coastWorldMap';

const WATER = new Set([
  TERRAIN.DEEP_OCEAN,
  TERRAIN.OCEAN,
  TERRAIN.SHALLOW_WATER,
  TERRAIN.REEF,
]);

function hash2(x, y, s = 0) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) & 0xffff) / 65535;
}

function tileType(world, x, y) {
  const size = world.size;
  if (x < 0 || y < 0 || x >= size || y >= size) return TERRAIN.DEEP_OCEAN;
  return world.terrain[y][x].type;
}

function isCharted(x, y, unlocked) {
  return unlocked.has(`${x},${y}`);
}

function isVisibleEntity(x, y, unlocked) {
  if (isCharted(x, y, unlocked)) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (isCharted(x + dx, y + dy, unlocked)) return true;
  }
  return false;
}

/** Pre-seed bird flight paths once per world. */
export function buildAnimationSpec(world) {
  const birds = [];
  for (let i = 0; i < 7; i += 1) {
    birds.push({
      y: 12 + hash2(i, 0, 41) * (world.size - 24),
      speed: 4 + hash2(i, 1, 42) * 10,
      phase: hash2(i, 2, 43) * world.size * 1.4,
      amp: 1.2 + hash2(i, 3, 44) * 2.8,
      wing: 5 + hash2(i, 4, 45) * 4,
      dir: hash2(i, 5, 46) > 0.5 ? 1 : -1,
      alt: hash2(i, 6, 47) > 0.82,
    });
  }
  return { birds, _size: world.size };
}

function drawWaterGlints(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1) {
  const sub = Math.max(1, cell / 4);
  for (let y = vy0; y < vy1; y += 1) {
    for (let x = vx0; x < vx1; x += 1) {
      if (!isCharted(x, y, unlocked)) continue;
      const type = tileType(world, x, y);
      if (!WATER.has(type)) continue;

      const h = hash2(x, y, 17);
      const pulse = Math.sin(time * 1.6 + h * 6.28);
      if (pulse < 0.55) continue;

      const sx = Math.floor(h * 3) + 1;
      const sy = Math.floor(hash2(y, x, 18) * 3) + 1;
      if (type === TERRAIN.DEEP_OCEAN) ctx.fillStyle = 'rgba(90, 150, 210, 0.45)';
      else if (type === TERRAIN.REEF) ctx.fillStyle = 'rgba(255, 180, 200, 0.55)';
      else ctx.fillStyle = 'rgba(190, 235, 255, 0.55)';
      ctx.fillRect(x * cell + sx * sub, y * cell + sy * sub, sub, sub);
    }
  }
}

function drawCoastalFoam(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1) {
  const sub = Math.max(1, cell / 4);
  const at = (x, y) => tileType(world, x, y);

  for (let y = vy0; y < vy1; y += 1) {
    for (let x = vx0; x < vx1; x += 1) {
      if (!isCharted(x, y, unlocked)) continue;
      const type = at(x, y);
      if (type !== TERRAIN.SHALLOW_WATER && type !== TERRAIN.REEF && type !== TERRAIN.OCEAN) continue;

      const wave = Math.sin(time * 2.2 + x * 0.35 + y * 0.28);
      if (wave < 0.15) continue;

      const edges = [
        [at(x, y - 1), 0, -1], [at(x, y + 1), 0, 1],
        [at(x - 1, y), -1, 0], [at(x + 1, y), 1, 0],
      ];
      for (const [nt, dx, dy] of edges) {
        if (nt < TERRAIN.BEACH) continue;
        const k = Math.floor(hash2(x + dx, y + dy, 31) * 4);
        const fx = dx === 0 ? k : (dx < 0 ? 0 : 3);
        const fy = dy === 0 ? k : (dy < 0 ? 0 : 3);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.22 + wave * 0.18})`;
        ctx.fillRect(x * cell + fx * sub, y * cell + fy * sub, sub, sub);
      }
    }
  }
}

function drawBoatWake(ctx, entities, unlocked, time, cell) {
  const boat = entities?.find((e) => e.type === 'boat');
  if (!boat || !isVisibleEntity(boat.x, boat.y, unlocked)) return;

  const cx = boat.x * cell + cell / 2;
  const cy = boat.y * cell + cell / 2;
  const sub = Math.max(1, cell / 4);
  const bob = Math.sin(time * 2.4) * sub * 0.6;

  for (let r = 0; r < 3; r += 1) {
    const phase = ((time * 0.9 + r * 0.55) % 2.4) / 2.4;
    const radius = phase * cell * 1.1;
    const alpha = (1 - phase) * 0.35;
    if (alpha <= 0.02) continue;
    ctx.strokeStyle = `rgba(180, 220, 255, ${alpha})`;
    ctx.lineWidth = Math.max(1, sub * 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, cy + bob + radius * 0.3, radius, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCampfires(ctx, entities, unlocked, time, cell) {
  const sub = Math.max(1, cell / 4);
  for (const e of entities || []) {
    if (e.type !== 'campfire' || !isVisibleEntity(e.x, e.y, unlocked)) continue;

    const bx = e.x * cell + cell / 2;
    const by = e.y * cell - sub;
    const flick = Math.sin(time * 14 + e.x * 2.1) * 0.5 + 0.5;

    ctx.fillStyle = flick > 0.55 ? '#ff9a3c' : '#ffd56a';
    ctx.fillRect(bx - sub, by - sub * (1 + flick), sub * 2, sub * 2);
    ctx.fillStyle = '#ff6b2b';
    ctx.fillRect(bx - sub / 2, by, sub, sub);

    const smokeT = (time * 12) % (cell * 1.5);
    for (let s = 0; s < 3; s += 1) {
      const sy = by - sub * (2 + s) - smokeT * 0.15;
      const sx = bx + Math.sin(time * 1.5 + s + e.y) * sub;
      ctx.fillStyle = `rgba(200, 210, 220, ${0.28 - s * 0.08})`;
      ctx.fillRect(sx, sy, sub, sub);
    }
  }
}

function drawLighthouseBeams(ctx, entities, unlocked, time, cell) {
  for (const e of entities || []) {
    if (e.type !== 'lighthouse' || !isVisibleEntity(e.x, e.y, unlocked)) continue;

    const lx = e.x * cell + cell / 2;
    const ly = e.y * cell + cell / 4;
    const angle = time * 0.65 + e.x * 0.1;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(angle);
    const beamLen = cell * 9;
    const grad = ctx.createLinearGradient(0, 0, beamLen, 0);
    grad.addColorStop(0, 'rgba(255, 248, 210, 0.32)');
    grad.addColorStop(0.4, 'rgba(255, 248, 210, 0.12)');
    grad.addColorStop(1, 'rgba(255, 248, 210, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, -cell / 5, beamLen, cell / 2.5);
    ctx.restore();

    const blink = Math.sin(time * 3.2 + e.y) > 0.2;
    if (blink) {
      ctx.fillStyle = 'rgba(255, 255, 220, 0.85)';
      ctx.fillRect(lx - 1, ly - cell / 3, 2, 2);
    }
  }
}

function drawVolcanoEmbers(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1) {
  const sub = Math.max(1, cell / 4);
  for (let y = vy0; y < vy1; y += 1) {
    for (let x = vx0; x < vx1; x += 1) {
      if (!isCharted(x, y, unlocked)) continue;
      const tile = world.terrain[y][x];
      if (tile.type !== TERRAIN.LAVA && !(tile.type === TERRAIN.MOUNTAIN && tile.b === 'volcano')) continue;
      const h = hash2(x, y, 88);
      if (h > 0.18) continue;

      const rise = (time * (1.2 + h * 2) + h * 10) % 1;
      const px = x * cell + Math.floor(h * 3 + 1) * sub;
      const py = y * cell - rise * cell * 1.2;
      ctx.fillStyle = rise < 0.5 ? `rgba(255, 120, 40, ${0.7 - rise})` : `rgba(255, 200, 80, ${0.5 - rise * 0.4})`;
      ctx.fillRect(px, py, sub, sub);
    }
  }
}

function drawBird(ctx, x, y, wingPhase, high) {
  const sub = 2;
  ctx.fillStyle = high ? 'rgba(30, 35, 45, 0.75)' : 'rgba(20, 24, 32, 0.85)';
  const flap = Math.sin(wingPhase) > 0 ? 1 : -1;
  ctx.fillRect(x, y, sub, sub);
  ctx.fillRect(x - sub * 2, y + (flap > 0 ? -sub : sub), sub * 2, sub);
  ctx.fillRect(x + sub, y + (flap > 0 ? -sub : sub), sub * 2, sub);
}

function drawBirds(ctx, spec, unlocked, time, cell, vx0, vy0, vx1, vy1) {
  if (!spec?.birds) return;
  const margin = 4;

  for (const bird of spec.birds) {
    const x = ((bird.phase + time * bird.speed * bird.dir) % (spec._size + margin * 2)) - margin;
    const y = bird.y + Math.sin(time * 0.7 + bird.phase) * bird.amp;
    if (x < vx0 - 2 || x > vx1 + 2 || y < vy0 - 2 || y > vy1 + 2) continue;

    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!isCharted(tx, ty, unlocked)) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (isCharted(tx + dx, ty + dy, unlocked)) { near = true; break; }
        }
      }
      if (!near) continue;
    }

    drawBird(
      ctx,
      x * cell + cell / 2,
      y * cell + cell / 3,
      time * bird.wing,
      bird.alt,
    );
  }
}

function drawFireflies(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1) {
  const sub = Math.max(1, cell / 4);
  for (let y = vy0; y < vy1; y += 1) {
    for (let x = vx0; x < vx1; x += 1) {
      if (!isCharted(x, y, unlocked)) continue;
      const tile = world.terrain[y][x];
      if (tile.type !== TERRAIN.SWAMP && tile.type !== TERRAIN.DEEP_FOREST) continue;
      const h = hash2(x, y, 71);
      if (h > 0.06) continue;

      const glow = Math.sin(time * 2.8 + h * 20) * 0.5 + 0.5;
      if (glow < 0.45) continue;
      const driftX = Math.sin(time * 0.6 + h * 8) * sub;
      const driftY = Math.cos(time * 0.5 + h * 6) * sub;
      ctx.fillStyle = `rgba(210, 255, 120, ${0.35 + glow * 0.45})`;
      ctx.fillRect(
        x * cell + cell / 2 + driftX,
        y * cell + cell / 2 + driftY,
        sub,
        sub,
      );
    }
  }
}

function drawPalmSway(ctx, entities, unlocked, time, cell) {
  const sub = Math.max(1, cell / 4);
  for (const e of entities || []) {
    if (e.type !== 'palm' || !isVisibleEntity(e.x, e.y, unlocked)) continue;
    const sway = Math.sin(time * 1.6 + e.x * 0.4) * sub * 1.2;
    ctx.fillStyle = 'rgba(55, 130, 65, 0.55)';
    ctx.fillRect(e.x * cell + cell / 2 + sway, e.y * cell - sub * 0.5, sub * 2, sub);
    ctx.fillStyle = 'rgba(70, 155, 75, 0.45)';
    ctx.fillRect(e.x * cell + cell / 2 + sway * 1.3, e.y * cell - sub * 1.5, sub * 3, sub);
  }
}

/**
 * Draw all ambient animations for the current viewport.
 * @param {number} time seconds since page load (from rAF)
 */
export function drawMapAnimations(ctx, {
  world,
  unlocked,
  time = 0,
  cell,
  vx0,
  vy0,
  vx1,
  vy1,
  animSpec,
}) {
  if (!world || !unlocked || time == null) return;

  const entities = world.entities;

  drawWaterGlints(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1);
  drawCoastalFoam(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1);
  drawBoatWake(ctx, entities, unlocked, time, cell);
  drawCampfires(ctx, entities, unlocked, time, cell);
  drawLighthouseBeams(ctx, entities, unlocked, time, cell);
  drawVolcanoEmbers(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1);
  drawFireflies(ctx, world, unlocked, time, cell, vx0, vy0, vx1, vy1);
  drawPalmSway(ctx, entities, unlocked, time, cell);
  if (animSpec) {
    drawBirds(ctx, animSpec, unlocked, time, cell, vx0, vy0, vx1, vy1);
  }
}
