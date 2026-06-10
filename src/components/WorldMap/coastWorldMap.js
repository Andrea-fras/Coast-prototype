/**
 * coastWorldMap.js — Coast world generator + pixel-art renderer.
 *
 * Drop-in replacement for the old module consumed by worldMapAdapter.js.
 * Exports: generateWorldMap, renderMapToCanvas, getIslandAt, HQ, MAP_SIZE,
 *          TERRAIN, ISLAND_DEFS.
 *
 * What changed vs the old renderer:
 *  - Each logical tile is rendered as a 4x4 block of sub-pixels (tileSize
 *    option, default 4), so coastlines, dithering, foam, flowers and lava
 *    cracks all read at sub-tile detail while game logic stays 1 tile = 1 cell.
 *  - Seven themed islands (meadow harbor, forest, tropic atoll, snow,
 *    swamp, volcano, ancient ruins) each with their own palette + props.
 *  - Cute sprites: houses with colored roofs, lighthouse, dock + rowboat,
 *    oak/pine/palm trees, treasure chests, snowman, ruin columns, campfire.
 */

export const MAP_SIZE = 144;

export const TERRAIN = {
  DEEP_OCEAN: 0,
  OCEAN: 1,
  SHALLOW_WATER: 2,
  REEF: 3,
  BEACH: 4,
  GRASS: 5,
  MEADOW: 6,
  FOREST: 7,
  DEEP_FOREST: 8,
  MOUNTAIN: 9,
  PEAK: 10,
  SWAMP: 11,
  LAVA: 12,
  SNOW: 13,
  PATH: 14,
};

export const BIOME = {
  meadow: 'meadow',
  forest: 'forest',
  tropic: 'tropic',
  snow: 'snow',
  swamp: 'swamp',
  volcano: 'volcano',
  ruins: 'ruins',
};

export const ISLAND_DEFS = [
  { id: 'harbor', name: 'Harbor Home', cx: 72, cy: 78, r: 15, biome: 'meadow', level: 1 },
  { id: 'woods', name: 'Whispering Woods', cx: 42, cy: 50, r: 12, biome: 'forest', level: 2 },
  { id: 'atoll', name: 'Sunfire Atoll', cx: 107, cy: 48, r: 10, biome: 'tropic', level: 3 },
  { id: 'frost', name: 'Frostpeak Isle', cx: 35, cy: 106, r: 12, biome: 'snow', level: 4 },
  { id: 'marsh', name: 'Mistmarsh', cx: 78, cy: 124, r: 9, biome: 'swamp', level: 4 },
  { id: 'ember', name: 'Ember Isle', cx: 113, cy: 101, r: 11, biome: 'volcano', level: 5 },
  { id: 'skull', name: 'Skull Rock', cx: 121, cy: 21, r: 7, biome: 'ruins', level: 6 },
];

/** Unnamed decorative islets (stepping stones + open-water variety). */
const ISLETS = [
  { cx: 92, cy: 66, r: 3.4, biome: 'meadow' },
  { cx: 56, cy: 66, r: 2.8, biome: 'meadow' },
  { cx: 96, cy: 86, r: 3.0, biome: 'tropic' },
  { cx: 58, cy: 92, r: 2.6, biome: 'forest' },
  { cx: 100, cy: 30, r: 2.8, biome: 'ruins' },
  { cx: 20, cy: 20, r: 3.4, biome: 'forest' },
  { cx: 52, cy: 16, r: 2.8, biome: 'meadow' },
  { cx: 74, cy: 30, r: 3.6, biome: 'forest' },
  { cx: 14, cy: 70, r: 2.7, biome: 'meadow' },
  { cx: 16, cy: 42, r: 2.4, biome: 'tropic' },
  { cx: 130, cy: 62, r: 3.1, biome: 'tropic' },
  { cx: 133, cy: 40, r: 2.3, biome: 'meadow' },
  { cx: 130, cy: 86, r: 2.6, biome: 'volcano' },
  { cx: 14, cy: 120, r: 2.9, biome: 'snow' },
  { cx: 20, cy: 132, r: 2.2, biome: 'meadow' },
  { cx: 56, cy: 130, r: 2.7, biome: 'swamp' },
  { cx: 100, cy: 130, r: 3.3, biome: 'tropic' },
  { cx: 131, cy: 127, r: 2.6, biome: 'meadow' },
  { cx: 108, cy: 12, r: 2.5, biome: 'ruins' },
  { cx: 36, cy: 30, r: 2.3, biome: 'meadow' },
];

export const HQ = { x: 72, y: 79 };

/* ----------------------------- noise utils ----------------------------- */

function hash2(x, y, s = 0) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) & 0xffff) / 65535;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, s) {
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const fx = smooth(x - x0); const fy = smooth(y - y0);
  const a = hash2(x0, y0, s); const b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s); const d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x, y, s) {
  return valueNoise(x, y, s) * 0.55
    + valueNoise(x * 2.1, y * 2.1, s + 7) * 0.3
    + valueNoise(x * 4.3, y * 4.3, s + 13) * 0.15;
}

/* ----------------------------- generation ------------------------------ */

const ALL_BLOBS = [...ISLAND_DEFS, ...ISLETS];

/**
 * Each island is the union of 1–4 stretched, rotated lobes instead of one
 * circle — this is what produces peninsulas, bays and irregular coastlines.
 */
const LOBES = [];
for (let i = 0; i < ALL_BLOBS.length; i += 1) {
  const isl = ALL_BLOBS[i];
  const count = isl.r >= 10 ? 4 : isl.r >= 6 ? 3 : isl.r >= 3 ? 2 : 1;
  // Primary lobe keeps the island anchored on its center.
  LOBES.push({
    isl,
    cx: isl.cx,
    cy: isl.cy,
    r: isl.r * (count > 1 ? 0.78 : 1),
    ax: 1 + (hash2(i, 1, 201) - 0.5) * 0.5,
    rot: hash2(i, 2, 202) * Math.PI,
  });
  for (let k = 1; k < count; k += 1) {
    const ang = hash2(i, k * 3, 203) * Math.PI * 2;
    const dist = isl.r * (0.3 + hash2(i, k * 5, 204) * 0.45);
    LOBES.push({
      isl,
      cx: isl.cx + Math.cos(ang) * dist,
      cy: isl.cy + Math.sin(ang) * dist,
      r: isl.r * (0.32 + hash2(i, k * 7, 205) * 0.34),
      ax: 0.7 + hash2(i, k * 11, 206) * 0.8,
      rot: hash2(i, k * 13, 207) * Math.PI,
    });
  }
}

function coastField(x, y) {
  let best = Infinity;
  let bestIsl = null;
  for (let i = 0; i < LOBES.length; i += 1) {
    const lb = LOBES[i];
    let dx = x - lb.cx;
    let dy = y - lb.cy;
    // Rotate, then stretch — turns circles into tilted ovals.
    const cos = Math.cos(lb.rot); const sin = Math.sin(lb.rot);
    const rx = (dx * cos - dy * sin) * lb.ax;
    const ry = (dx * sin + dy * cos) / lb.ax;
    const d = Math.sqrt(rx * rx + ry * ry) / lb.r;
    const wobble = (fbm(x * 0.09 + i * 23.1, y * 0.09 - i * 11.7, 11 + i) - 0.5) * 0.62;
    const e = d + wobble;
    if (e < best) { best = e; bestIsl = lb.isl; }
  }
  return { e: best, isl: bestIsl };
}

function interiorType(biome, inner, dn, v, islR) {
  switch (biome) {
    case 'forest': {
      if (inner < 0.14) return TERRAIN.GRASS;
      if (dn > 0.74) return TERRAIN.GRASS; // clearings
      if (inner > 0.52) return TERRAIN.DEEP_FOREST;
      return TERRAIN.FOREST;
    }
    case 'tropic': {
      if (islR >= 6 && inner > 0.52) return TERRAIN.SHALLOW_WATER; // turquoise lagoon
      if (islR >= 6 && inner > 0.42) return TERRAIN.BEACH; // inner lagoon beach ring
      if (inner < 0.16) return TERRAIN.BEACH; // wide sunny beaches
      if (dn > 0.78) return TERRAIN.MEADOW;
      return TERRAIN.GRASS;
    }
    case 'snow': {
      if (inner < 0.12) return TERRAIN.GRASS;
      if (inner > 0.66 && dn < 0.6) return TERRAIN.PEAK; // snowy cap
      if (dn > 0.64) return TERRAIN.MOUNTAIN; // rocky outcrops
      if (dn > 0.42 && dn < 0.58 && inner < 0.45) return TERRAIN.FOREST; // pine belt
      return TERRAIN.SNOW;
    }
    case 'swamp': {
      if (dn > 0.76) return TERRAIN.GRASS;
      return TERRAIN.SWAMP;
    }
    case 'volcano': {
      if (inner < 0.1) return TERRAIN.GRASS;
      if (inner > 0.56) return TERRAIN.LAVA;
      return TERRAIN.MOUNTAIN;
    }
    case 'ruins': {
      if (dn > 0.72) return TERRAIN.MOUNTAIN;
      if (inner > 0.55 && dn < 0.3) return TERRAIN.PATH; // worn plaza
      return TERRAIN.GRASS;
    }
    case 'meadow':
    default: {
      if (dn > 0.66) return TERRAIN.MEADOW;
      if (dn < 0.27 && inner > 0.22) return TERRAIN.FOREST;
      return TERRAIN.GRASS;
    }
  }
}

function stampVillage(terrain, size) {
  // Plaza around HQ.
  for (let y = HQ.y - 2; y <= HQ.y + 2; y += 1) {
    for (let x = HQ.x - 3; x <= HQ.x + 3; x += 1) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.hypot(x - HQ.x, y - HQ.y);
      if (d <= 2.6 && terrain[y][x].type >= TERRAIN.BEACH) {
        terrain[y][x].type = TERRAIN.PATH;
      }
    }
  }
  // Path south toward the water (dock road).
  for (let y = HQ.y; y < size; y += 1) {
    const t = terrain[y][HQ.x].type;
    if (t < TERRAIN.BEACH) return y; // first water row
    terrain[y][HQ.x].type = TERRAIN.PATH;
  }
  return null;
}

function findLandNear(terrain, size, cx, cy, seed, opts = {}) {
  const minType = opts.minType ?? TERRAIN.BEACH;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ang = hash2(seed, attempt, 3) * Math.PI * 2;
    const rad = hash2(attempt, seed, 5) * (opts.maxR ?? 6) + (opts.minR ?? 1);
    const x = Math.round(cx + Math.cos(ang) * rad);
    const y = Math.round(cy + Math.sin(ang) * rad);
    if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
    const t = terrain[y][x].type;
    if (t >= minType && t <= TERRAIN.PATH && t !== TERRAIN.LAVA) return { x, y };
  }
  return null;
}

export function generateWorldMap(size = MAP_SIZE) {
  const terrain = new Array(size);
  for (let y = 0; y < size; y += 1) {
    terrain[y] = new Array(size);
    for (let x = 0; x < size; x += 1) {
      const { e, isl } = coastField(x, y);
      const v = hash2(x, y, 99);
      let type;
      if (e > 1.34) type = TERRAIN.DEEP_OCEAN;
      else if (e > 1.1) type = TERRAIN.OCEAN;
      else if (e > 0.97) {
        type = TERRAIN.SHALLOW_WATER;
        if (isl.biome === 'tropic' && v < 0.4) type = TERRAIN.REEF;
      } else if (e > 0.9) type = TERRAIN.BEACH;
      else {
        const inner = Math.max(0, Math.min(1, (0.9 - e) / 0.9));
        const dn = fbm(x * 0.21, y * 0.21, 47);
        type = interiorType(isl.biome, inner, dn, v, isl.r);
      }
      terrain[y][x] = { type, v, b: isl.biome };
    }
  }

  const dockRow = stampVillage(terrain, size);
  const entities = [];

  // Harbor village houses (roof variants 0=red 1=teal 2=blue).
  const housePlots = [
    [-4, -2, 0], [2, -3, 1], [-5, 1, 2], [3, 1, 0], [-1, -4, 1],
  ];
  for (const [dx, dy, roof] of housePlots) {
    const x = HQ.x + dx; const y = HQ.y + dy;
    if (terrain[y]?.[x] && terrain[y][x].type >= TERRAIN.BEACH) {
      entities.push({ type: 'house', x, y, v: roof });
    }
  }

  // Lighthouse on the harbor's eastern shore.
  for (let x = HQ.x; x < size - 1; x += 1) {
    if (terrain[HQ.y - 3][x].type === TERRAIN.BEACH) {
      entities.push({ type: 'lighthouse', x, y: HQ.y - 3 });
      break;
    }
  }

  // Dock + rowboat where the village path meets the sea.
  if (dockRow != null) {
    entities.push({ type: 'dock', x: HQ.x, y: dockRow, len: 3 });
    entities.push({ type: 'boat', x: HQ.x + 2, y: dockRow + 2 });
  }

  // Per-island props.
  for (let i = 0; i < ISLAND_DEFS.length; i += 1) {
    const isl = ISLAND_DEFS[i];
    const chests = isl.id === 'harbor' ? 1 : 2;
    for (let c = 0; c < chests; c += 1) {
      const spot = findLandNear(terrain, size, isl.cx, isl.cy, i * 17 + c * 53, { maxR: isl.r * 0.6 });
      if (spot) entities.push({ type: 'treasure_chest', x: spot.x, y: spot.y, name: 'Treasure Chest' });
    }
  }

  // Palms on every tropic blob's beaches.
  for (const blob of ALL_BLOBS) {
    if (blob.biome !== 'tropic') continue;
    const reach = Math.ceil(blob.r) + 3;
    for (let y = blob.cy - reach; y <= blob.cy + reach; y += 1) {
      for (let x = blob.cx - reach; x <= blob.cx + reach; x += 1) {
        if (terrain[y]?.[x]?.type === TERRAIN.BEACH && hash2(x, y, 21) < 0.12) {
          entities.push({ type: 'palm', x, y });
        }
      }
    }
  }

  // Snowman, campfire, ruins.
  const frost = ISLAND_DEFS.find((d) => d.biome === 'snow');
  const frostSpot = findLandNear(terrain, size, frost.cx, frost.cy - 4, 71, { maxR: 4 });
  if (frostSpot) entities.push({ type: 'snowman', x: frostSpot.x, y: frostSpot.y });

  const woods = ISLAND_DEFS.find((d) => d.biome === 'forest');
  const fireSpot = findLandNear(terrain, size, woods.cx, woods.cy, 83, { maxR: 3 });
  if (fireSpot) entities.push({ type: 'campfire', x: fireSpot.x, y: fireSpot.y });

  const skull = ISLAND_DEFS.find((d) => d.biome === 'ruins');
  for (let c = 0; c < 5; c += 1) {
    const spot = findLandNear(terrain, size, skull.cx, skull.cy, 101 + c * 7, { maxR: skull.r * 0.7 });
    if (spot) entities.push({ type: 'ruin', x: spot.x, y: spot.y, v: c % 2 });
  }

  return {
    size,
    terrain,
    entities,
    islands: ISLAND_DEFS.map((d) => ({ ...d })),
    origin: { ...HQ },
  };
}

export function getIslandAt(mapData, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const isl of mapData.islands || ISLAND_DEFS) {
    const d = Math.hypot(x - isl.cx, y - isl.cy) / isl.r;
    if (d < 1.15 && d < bestD) { best = isl; bestD = d; }
  }
  return best;
}

/* ------------------------------ rendering ------------------------------ */

const C = {
  deep: ['#16395f', '#1a4170', '#123353'],
  ocean: ['#2a6cb4', '#3179c2', '#2563a6'],
  shallow: ['#5fb6e6', '#71c2ee', '#8ccfef'],
  foam: '#ecf8fd',
  reefCoral: ['#ff8f6b', '#ffd166', '#7be0c3'],
  beach: ['#f1dca4', '#e7cf90', '#d9bc77'],
  beachWet: '#dfc795',
  grass: ['#7ac95e', '#70bd54', '#8ed873'],
  meadow: ['#8bd56d', '#80c962', '#9ee382'],
  flower: ['#f6699c', '#ffd84d', '#ffffff', '#b07ce8'],
  forestGround: ['#63ad4d', '#5aa246'],
  snow: ['#eef4f8', '#e0eaf2', '#ffffff'],
  frostGrass: ['#a8d8a0', '#9bcd93'],
  mountain: ['#8f939c', '#7c8089', '#a6aab2'],
  peak: ['#e9f0f6', '#d8e4ee', '#c6d8e8'],
  swamp: ['#5d7a52', '#52704a', '#3a5a63', '#7da763'],
  lavaRock: ['#3f3636', '#352d2d'],
  lava: ['#ff7b2e', '#ffc23d'],
  path: ['#dcbd8d', '#d2b27f', '#b3915e'],
};

const SPRITES = {
  house: {
    w: 8,
    h: 8,
    rows: [
      '...cc...',
      '..rrrr..',
      '.rrRRrr.',
      'rrRRRRrr',
      'wwwwwwww',
      'wggwwggw',
      'wwwddwww',
      'WwwddwwW',
    ],
  },
  lighthouse: {
    w: 4,
    h: 10,
    rows: ['.yy.', '.GG.', 'rrrr', 'wwww', 'rrrr', 'wwww', 'rrrr', 'wwww', 'wwww', 'BBBB'],
  },
  oak: { w: 5, h: 6, rows: ['.hLL.', 'LLLLD', 'LLDLD', '.DDD.', '..t..', '..t..'] },
  pine: { w: 5, h: 6, rows: ['..s..', '.ppp.', '.pPp.', 'pPPPp', '..t..', '..t..'] },
  palm: { w: 5, h: 5, rows: ['l.L.l', '.lLl.', '..t..', '..t..', '.t...'] },
  chest: { w: 5, h: 4, rows: ['.bbb.', 'bbGbb', 'bbGbb', 'BBBBB'] },
  snowman: { w: 4, h: 5, rows: ['.kk.', '.ww.', 'wwww', 'wwww', '....'] },
  ruin: { w: 3, h: 6, rows: ['ggg', '.G.', '.g.', '.G.', '.g.', 'ggG'] },
  campfire: { w: 4, h: 4, rows: ['..y.', '.yo.', '.oo.', 'llll'] },
  boat: { w: 6, h: 3, rows: ['.pwwp.', 'pppppp', '.PPPP.'] },
};

const SPRITE_PAL = {
  c: '#9a5a3c',
  w: '#f6ead0',
  W: '#e2d2b0',
  d: '#8a5a33',
  g: '#ffd970',
  y: '#ffe28a',
  G: '#bfe8ff',
  B: '#cfc8b6',
  h: '#5cbf63',
  t: '#7a4a2b',
  s: '#eef6fb',
  p: '#2e6b46',
  P: '#3d8257',
  l: '#57b863',
  L: '#3f9e4f',
  D: '#357d3e',
  b: '#9a6a36',
  k: '#37343a',
  o: '#ff8b3d',
  e: '#2c2c2c',
};

const HOUSE_ROOFS = [
  { r: '#d9534f', R: '#e8736f' },
  { r: '#2fa9a0', R: '#45c2b8' },
  { r: '#4a7fd6', R: '#6a97e2' },
];

function drawSprite(ctx, sprite, px, py, t, pal = {}) {
  const merged = { ...SPRITE_PAL, ...pal };
  for (let ry = 0; ry < sprite.rows.length; ry += 1) {
    const row = sprite.rows[ry];
    for (let rx = 0; rx < row.length; rx += 1) {
      const ch = row[rx];
      if (ch === '.' || ch === ' ') continue;
      const color = merged[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(px + rx * (t / 4), py + ry * (t / 4), t / 4, t / 4);
    }
  }
}

function isLand(type) { return type >= TERRAIN.BEACH; }
function isWater(type) { return type < TERRAIN.BEACH; }

function pick(arr, h, weights) {
  if (!weights) return arr[Math.floor(h * arr.length) % arr.length];
  let acc = 0;
  for (let i = 0; i < arr.length; i += 1) {
    acc += weights[i];
    if (h <= acc) return arr[i];
  }
  return arr[arr.length - 1];
}

function tileBase(tile, x, y, sx, sy) {
  const h = hash2(x * 4 + sx, y * 4 + sy, 7);
  const checker = (sx + sy) % 2 === 0;
  switch (tile.type) {
    case TERRAIN.DEEP_OCEAN:
      if (h > 0.985) return C.deep[1];
      if (h < 0.02) return C.deep[2];
      return C.deep[0];
    case TERRAIN.OCEAN:
      if (sy === 1 && h < 0.06) return C.ocean[1];
      if (h > 0.97) return C.ocean[2];
      return C.ocean[0];
    case TERRAIN.SHALLOW_WATER:
      if (h > 0.92) return C.shallow[2];
      if (h < 0.14) return C.shallow[1];
      return C.shallow[0];
    case TERRAIN.REEF: {
      if (h > 0.72) return C.reefCoral[Math.floor(h * 17) % 3];
      if (h < 0.14) return C.shallow[1];
      return C.shallow[0];
    }
    case TERRAIN.BEACH:
      if (h > 0.94) return C.beach[2];
      return checker && h < 0.5 ? C.beach[1] : C.beach[0];
    case TERRAIN.GRASS: {
      const g = tile.b === 'snow' ? C.frostGrass : C.grass;
      if (h > 0.93 && g === C.grass) return C.grass[2];
      return checker && h < 0.55 ? g[1] : g[0];
    }
    case TERRAIN.MEADOW:
      if (h > 0.9) return C.meadow[2];
      return checker && h < 0.55 ? C.meadow[1] : C.meadow[0];
    case TERRAIN.FOREST:
    case TERRAIN.DEEP_FOREST:
      return checker && h < 0.55 ? C.forestGround[1] : C.forestGround[0];
    case TERRAIN.SWAMP:
      if (h < 0.26) return C.swamp[2];
      if (h > 0.88) return C.swamp[3];
      return checker && h < 0.5 ? C.swamp[1] : C.swamp[0];
    case TERRAIN.MOUNTAIN: {
      if (tile.b === 'volcano' && h > 0.975) return C.lava[0]; // ember sparks
      if (sx + sy <= 2 && h < 0.45) return C.mountain[2];
      if (sx + sy >= 5 && h < 0.5) return C.mountain[1];
      return C.mountain[0];
    }
    case TERRAIN.PEAK:
      if (h > 0.9) return C.peak[2];
      return checker && h < 0.5 ? C.peak[1] : C.peak[0];
    case TERRAIN.SNOW:
      if (h > 0.965) return C.snow[2];
      return checker && h < 0.4 ? C.snow[1] : C.snow[0];
    case TERRAIN.LAVA:
      if (h > 0.93) return C.lava[1];
      if (h > 0.78) return C.lava[0];
      return checker && h < 0.5 ? C.lavaRock[1] : C.lavaRock[0];
    case TERRAIN.PATH:
      return checker && h < 0.5 ? C.path[1] : C.path[0];
    default:
      return '#ff00ff';
  }
}

/**
 * Render the whole map to a canvas at sub-tile detail.
 * @param canvas HTMLCanvasElement (or anything with getContext)
 * @param mapData result of generateWorldMap()
 * @param opts { tileSize } pixels per tile, multiple of 4 recommended (default 4)
 */
export function renderMapToCanvas(canvas, mapData, opts = {}) {
  const t = opts.tileSize || 4;
  const sub = t / 4;
  const { size, terrain, entities } = mapData;
  canvas.width = size * t;
  canvas.height = size * t;
  const ctx = canvas.getContext('2d');

  const at = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return TERRAIN.DEEP_OCEAN;
    return terrain[y][x].type;
  };

  // Pass 1 — terrain sub-pixels.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tile = terrain[y][x];
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          ctx.fillStyle = tileBase(tile, x, y, sx, sy);
          ctx.fillRect(x * t + sx * sub, y * t + sy * sub, sub, sub);
        }
      }

      // Foam where water touches land; wet sand where land touches water.
      if (isWater(tile.type) && tile.type !== TERRAIN.DEEP_OCEAN) {
        const edges = [
          [at(x, y - 1), 0, -1], [at(x, y + 1), 0, 1],
          [at(x - 1, y), -1, 0], [at(x + 1, y), 1, 0],
        ];
        for (const [nt, dx, dy] of edges) {
          if (!isLand(nt)) continue;
          ctx.fillStyle = C.foam;
          for (let k = 0; k < 4; k += 1) {
            if (hash2(x * 4 + k, y * 4 + dx + dy, 31) > 0.45) continue;
            const fx = dx === 0 ? k : (dx < 0 ? 0 : 3);
            const fy = dy === 0 ? k : (dy < 0 ? 0 : 3);
            ctx.fillRect(x * t + fx * sub, y * t + fy * sub, sub, sub);
          }
        }
      }
      if (tile.type === TERRAIN.BEACH) {
        const edges = [
          [at(x, y - 1), 0, -1], [at(x, y + 1), 0, 1],
          [at(x - 1, y), -1, 0], [at(x + 1, y), 1, 0],
        ];
        for (const [nt, dx, dy] of edges) {
          if (!isWater(nt)) continue;
          ctx.fillStyle = C.beachWet;
          for (let k = 0; k < 4; k += 1) {
            const fx = dx === 0 ? k : (dx < 0 ? 0 : 3);
            const fy = dy === 0 ? k : (dy < 0 ? 0 : 3);
            ctx.fillRect(x * t + fx * sub, y * t + fy * sub, sub, sub);
          }
        }
      }
      // Path borders.
      if (tile.type === TERRAIN.PATH) {
        ctx.fillStyle = C.path[2];
        if (at(x - 1, y) !== TERRAIN.PATH) ctx.fillRect(x * t, y * t, sub, t);
        if (at(x + 1, y) !== TERRAIN.PATH) ctx.fillRect(x * t + 3 * sub, y * t, sub, t);
      }
      // Flowers on grass / meadow.
      if ((tile.type === TERRAIN.GRASS && tile.v > 0.92) || (tile.type === TERRAIN.MEADOW && tile.v > 0.8)) {
        const fx = Math.floor(hash2(x, y, 55) * 4);
        const fy = Math.floor(hash2(y, x, 56) * 4);
        ctx.fillStyle = C.flower[Math.floor(tile.v * 31) % C.flower.length];
        ctx.fillRect(x * t + fx * sub, y * t + fy * sub, sub, sub);
      }
    }
  }

  // Pass 2 — trees (per forest tile, sparse so canopies read individually).
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tile = terrain[y][x];
      const swampTree = tile.type === TERRAIN.SWAMP && tile.v < 0.1;
      if (tile.type !== TERRAIN.FOREST && tile.type !== TERRAIN.DEEP_FOREST && !swampTree) continue;
      if (!swampTree && tile.v > 0.62) continue; // breathing room between trees
      const pine = tile.b === 'snow';
      const sprite = pine ? SPRITES.pine : SPRITES.oak;
      const jx = Math.floor(hash2(x, y, 61) * 2) - 1;
      const px = x * t + jx * sub - sub / 2;
      const py = y * t - 2 * sub;
      let pal = {};
      if (tile.type === TERRAIN.DEEP_FOREST) pal = { L: '#2f7a3a', D: '#225c2d', h: '#3f8f4a', l: '#388a44' };
      if (swampTree) pal = { L: '#4a6b3e', D: '#3a5530', h: '#587a48', t: '#54402a' };
      drawSprite(ctx, sprite, px, py, t, pal);
    }
  }

  // Pass 3 — entities, painter's order by y.
  const sorted = [...entities].sort((a, b) => a.y - b.y);
  for (const e of sorted) {
    const px = e.x * t;
    const py = e.y * t;
    switch (e.type) {
      case 'dock': {
        ctx.fillStyle = '#b98c58';
        ctx.fillRect(px + sub, py, 2 * sub, e.len * t);
        ctx.fillStyle = '#96703f';
        for (let k = 0; k < e.len; k += 1) {
          ctx.fillRect(px + sub, py + k * t + 3 * sub, 2 * sub, sub);
        }
        ctx.fillStyle = '#7a5a30';
        ctx.fillRect(px, py + (e.len - 1) * t + 2 * sub, sub, 2 * sub);
        ctx.fillRect(px + 3 * sub, py + (e.len - 1) * t + 2 * sub, sub, 2 * sub);
        break;
      }
      case 'house': {
        drawSprite(ctx, SPRITES.house, px - t / 2, py - t, t, HOUSE_ROOFS[e.v % HOUSE_ROOFS.length]);
        break;
      }
      case 'lighthouse':
        drawSprite(ctx, SPRITES.lighthouse, px, py - 1.5 * t, t, { r: '#e25b50', w: '#f7f3ea' });
        break;
      case 'palm':
        drawSprite(ctx, SPRITES.palm, px, py - sub, t);
        break;
      case 'treasure_chest':
        drawSprite(ctx, SPRITES.chest, px, py, t);
        break;
      case 'snowman': {
        drawSprite(ctx, SPRITES.snowman, px, py, t, { w: '#f7fbfe' });
        ctx.fillStyle = SPRITE_PAL.e;
        ctx.fillRect(px + sub, py + sub, sub / 2 || 1, sub / 2 || 1);
        ctx.fillStyle = '#ff8c42';
        ctx.fillRect(px + 2 * sub, py + sub, sub, sub / 2 || 1);
        break;
      }
      case 'ruin':
        drawSprite(ctx, SPRITES.ruin, px, py - t, t, e.v ? { g: '#a6aab6', G: '#8d92a0' } : {});
        break;
      case 'campfire':
        drawSprite(ctx, SPRITES.campfire, px, py, t);
        break;
      case 'boat':
        drawSprite(ctx, SPRITES.boat, px - sub, py, t, { p: '#a4683c', P: '#7e4e2a', w: '#e9dec2' });
        break;
      default:
        break;
    }
  }

  return canvas;
}
