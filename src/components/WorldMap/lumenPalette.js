/**
 * lumenPalette.js — colour ramps and a tiny pixel canvas for the level 2 art.
 * Ramps run dark → light and are hue-shifted (shadows lean blue/purple,
 * highlights lean warm) so shading reads like hand-painted pixel art.
 */

import { bayer } from './mapNoise.js';

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function pack(r, g, b) {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
export function packHex(h) {
  const [r, g, b] = hexToRgb(h);
  return pack(r, g, b);
}
const ramp = (...hexes) => hexes.map(packHex);

/** Hue-shifted ramps, dark → light: shadows lean blue/purple, lights lean yellow. */
export const R = {
  deep: ramp('#0f2549', '#122c55', '#163462', '#1a3c6e'),
  ocean: ramp('#1c4580', '#1f4e8e', '#23579c', '#2861aa'),
  mid: ramp('#2c6db5', '#317bc2', '#3788cc'),
  shallow: ramp('#3689c6', '#3d98cf', '#46a7d6', '#54b5da', '#68c3de'),
  surf: ramp('#9fe3ee', '#c9f2f7', '#effdff'),
  lagoon: ramp('#46b8d0', '#5ccad6', '#76dadb', '#98e7dc', '#bff2e2'),
  lake: ramp('#24679f', '#2c78b0', '#378ac0', '#469ccd', '#5aafd8'),
  river: ramp('#2a74b0', '#3286bf', '#3d98cc', '#4fabd8', '#69c0e2', '#9fdcef'),
  grass: ramp('#27513a', '#2f633d', '#3b7841', '#4b8e45', '#5fa54b', '#79bb55', '#97cf63', '#b6e07a'),
  meadow: ramp('#3a6538', '#4a7b3c', '#5d9241', '#72a948', '#8abf52', '#a4d160', '#c0e177'),
  forestFloor: ramp('#1b3a2b', '#224731', '#2a5536', '#33643b', '#3d7341'),
  deepFloor: ramp('#13291f', '#183325', '#1e3e2b', '#254a31', '#2d5737'),
  autumnFloor: ramp('#5a3f26', '#6d4d2c', '#825d33', '#98703b', '#ad8345'),
  alpine: ramp('#35573f', '#426947', '#517c4f', '#638f59', '#7aa466', '#93b877'),
  sand: ramp('#b2855a', '#c79a69', '#d9af7b', '#e8c48f', '#f2d6a6', '#f9e7c2'),
  wetSand: ramp('#94704f', '#a57f5a', '#b69068'),
  desert: ramp('#b56f3f', '#c9854b', '#dc9d59', '#e9b56b', '#f2ca82', '#f9dc9f'),
  mesaTop: ramp('#86392c', '#a04834', '#b95a3e', '#cf6d48', '#df8554', '#ea9e65'),
  strata: ramp('#6e2e25', '#8f3e2d', '#b25136', '#c96a43', '#a8492f', '#7f352a'),
  rock: ramp('#2b2a3d', '#3a384f', '#4c4963', '#615d78', '#78738e', '#918ca5', '#aba7bc', '#c7c4d5'),
  earth: ramp('#3b2a26', '#4d372e', '#614636', '#76563f', '#8a6748'),
  snow: ramp('#7f93bd', '#9aafd4', '#b8cbe6', '#d3e1f3', '#e8f0fa', '#f7fbff', '#ffffff'),
  ice: ramp('#4f98c2', '#6db3d6', '#91cbe4', '#b6e0ef', '#d9f1f8', '#f2fbfe'),
  marsh: ramp('#384a2f', '#455a35', '#546b3c', '#657d44', '#78904e', '#8ea55b'),
  marshWater: ramp('#23433f', '#2b5049', '#355e53', '#426e60', '#56826f'),
  tundra: ramp('#5c7466', '#6d8676', '#809885', '#94aa96', '#a9bca8'),
  volcanic: ramp('#18141b', '#221b26', '#2e2533', '#3c3141', '#4c3f51', '#5f5163', '#756777'),
  lava: ramp('#7c1b10', '#b12e17', '#dd4a1c', '#f97726', '#ffa73a', '#ffd35d', '#fff3a6'),
  cobble: ramp('#4f4a4a', '#645e5b', '#7b746e', '#938a81', '#aba196', '#c4bbae', '#dbd3c6'),
  dirt: ramp('#5e4230', '#74533a', '#8a6544', '#a07951', '#b58e61', '#c9a476'),
  wood: ramp('#3e2716', '#573821', '#72492b', '#8e5d36', '#aa7443', '#c48c55'),
  oak: ramp('#173b29', '#1f4c2f', '#2a6035', '#36753b', '#468b42', '#5aa04b', '#73b556', '#92c963'),
  pine: ramp('#11281f', '#163326', '#1c402d', '#244e35', '#2e5e3e', '#3a6f48'),
  blossom: ramp('#6e2f5c', '#8f3d73', '#b0508a', '#cb68a0', '#e184b6', '#f0a3ca', '#f9c4dc', '#ffe4ef'),
  autumn: ramp('#5e2418', '#83321b', '#a8451f', '#c95e26', '#e27d33', '#f09d45', '#f8bf5c', '#fcdb7e'),
  elder: ramp('#0f2a20', '#153626', '#1b442d', '#225235', '#2b623e', '#377349', '#468657', '#599a66'),
  palm: ramp('#1f4f2e', '#2a6537', '#377b40', '#48924a', '#5eaa54', '#7cc062'),
  trunk: ramp('#3a2517', '#4f321d', '#664226', '#7d5330', '#94653b'),
  cactus: ramp('#1f4a31', '#2a5e3a', '#377344', '#468a4f', '#5aa05d', '#72b76c'),
  crop: {
    wheat: ramp('#9c7a2c', '#b98f33', '#d2a93e', '#e5c252', '#f1d772'),
    lavender: ramp('#4b3a7a', '#5f4a95', '#7661ae', '#8f7cc6', '#a998da'),
    tulip: ramp('#8e2240', '#b3304e', '#d6435d', '#ec6177', '#f7879a'),
    sunflower: ramp('#9a6b12', '#c28c17', '#e0ae22', '#f2c93a', '#fbe06a'),
    cabbage: ramp('#2f6a3c', '#3c8045', '#4d9750', '#63ad5d', '#80c26d'),
  },
  roof: [
    ramp('#6e2a21', '#8f3829', '#b44a32', '#d4613f', '#ea8156', '#f6a47a'),
    ramp('#1a4a4b', '#226162', '#2b7a78', '#3a968f', '#55b3a6', '#7ccdbc'),
    ramp('#212c5e', '#2c3c80', '#3a50a3', '#4f69c1', '#6c88d8', '#93aae8'),
    ramp('#44203d', '#612d57', '#7f3e72', '#9d5490', '#b873ab', '#d19bc7'),
    ramp('#6a4a1d', '#8a6224', '#ab7c2c', '#c99837', '#e0b44c', '#efcc6e'),
  ],
  plaster: ramp('#7d6d5c', '#9b8a75', '#baa991', '#d6c7ae', '#ebdfc9', '#f8f1e3'),
  stone: ramp('#3f3a44', '#55505a', '#6d6771', '#878089', '#a29ba2', '#bdb6bb', '#d8d2d4'),
};

export const SHADOW = hexToRgb('#0b1024');
export const WHITE = packHex('#ffffff');
export const FOAM = packHex('#eefcff');

/* ------------------------------ canvas ---------------------------------- */

export function makeCanvas(W, H) {
  const px = new Uint32Array(W * H);
  const put = (x, y, c) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    px[y * W + x] = c;
  };
  const blend = (x, y, rgb, a) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    const c = px[i];
    const r = c & 255;
    const g = (c >> 8) & 255;
    const b = (c >> 16) & 255;
    px[i] = pack(
      Math.round(r + (rgb[0] - r) * a),
      Math.round(g + (rgb[1] - g) * a),
      Math.round(b + (rgb[2] - b) * a),
    );
  };
  return { W, H, px, put, blend };
}

/** Pick a ramp colour from a continuous index with ordered dithering. */
export function pick(rmp, idx, X, Y, dither = 0.9) {
  const i = Math.round(idx + bayer(X, Y) * dither);
  return rmp[i < 0 ? 0 : i >= rmp.length ? rmp.length - 1 : i];
}
