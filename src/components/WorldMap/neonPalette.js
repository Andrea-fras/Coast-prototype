/**
 * neonPalette.js — night ramps for Neon Meridian. Same rules as the Lumen
 * palette (dark → light, hue-shifted), but moonlit: shadows sink to indigo,
 * highlights are cool, and colour comes from neon and lit windows.
 */

import { hexToRgb, packHex } from './lumenPalette.js';

const ramp = (...hexes) => hexes.map(packHex);

export const N = {
  sea: ramp('#02040b', '#040816', '#071024', '#0a1631', '#0e1d3f', '#13264e'),
  shore: ramp('#0f2044', '#152a55', '#1c3667', '#26467e'),
  asphalt: ramp('#0a0c16', '#0e111d', '#131725', '#191e2f', '#20263a'),
  sidewalk: ramp('#23283f', '#2c324d', '#373e5d', '#444c70'),
  concrete: ramp('#141829', '#1b2035', '#232942', '#2c3350', '#373f60', '#444d74'),
  grass: ramp('#061318', '#0a1b1e', '#0e2427', '#122d2e', '#183837', '#1f4540'),
  tree: ramp('#030b10', '#061317', '#0a1c20', '#0f2629', '#153233', '#1c403e', '#275249'),
  rock: ramp('#090a16', '#0f1022', '#16182e', '#1f223d', '#292d4d', '#353a60', '#444a75'),
  snow: ramp('#222d4f', '#2d3c66', '#3a4f80', '#4b6399', '#5f7ab2', '#7d96cc'),
  rust: ramp('#120a0c', '#1d100e', '#2a1712', '#3a2017', '#4c2a1c', '#613622'),
  solar: ramp('#050c22', '#0a1638', '#10224e', '#1a3469', '#2a4d8c', '#4a78c0'),
  quay: ramp('#1f2439', '#293049', '#343c5b', '#414a6f'),
  glass: ramp('#060b19', '#0a1226', '#0f1a34', '#152443', '#1d3055', '#283e6b'),
  facade: ramp('#0c0e1b', '#121526', '#191d32', '#21263f', '#2a304e', '#353c60'),
  brick: ramp('#140a11', '#1e0e19', '#2a1422', '#391b2e', '#49233b', '#5b2d4a'),
  lab: ramp('#1a2036', '#252d49', '#333e5d', '#48557d', '#67769f', '#94a2c6'),
  roof: ramp('#181c30', '#20253f', '#29304d', '#333a5d', '#3f4770', '#4d5684'),
  roofTeal: ramp('#0c1c22', '#12272e', '#18333a', '#1f4048', '#284f58', '#346269'),
  roofPlum: ramp('#1a1024', '#231631', '#2e1d40', '#3a2550', '#472e62', '#573a78'),
  roofRust: ramp('#1c1212', '#28191a', '#352121', '#432a28', '#523431', '#65413a'),
  metal: ramp('#13141d', '#1d1f2a', '#292c3a', '#373b4d', '#484d63', '#5d637e'),
  pagoda: ramp('#1a0c0f', '#2b1115', '#40171b', '#591e22', '#74272a', '#933434'),
};

export const NEON = {
  magenta: '#ff2fb2', cyan: '#27e6ff', yellow: '#ffe14d', orange: '#ff8a2b', violet: '#9b5cff',
  green: '#4dff9d', red: '#ff3b5c', pink: '#ff7ad1', blue: '#4d7cff',
};
export const NEON_KEYS = ['magenta', 'cyan', 'yellow', 'violet', 'orange', 'green', 'pink', 'blue', 'red'];
export const NEON_PX = Object.fromEntries(Object.entries(NEON).map(([k, v]) => [k, packHex(v)]));
export const NEON_RGB = Object.fromEntries(Object.entries(NEON).map(([k, v]) => [k, hexToRgb(v)]));

export const WINDOWS = {
  warm: ramp('#b9852f', '#e9b85c', '#ffd98a'),
  cool: ramp('#3aa7c4', '#6fd7f0', '#b8f3ff'),
  pink: ramp('#c2468f', '#ff8fd6', '#ffc2ea'),
  off: packHex('#080b16'),
  dim: packHex('#101628'),
};

export const NIGHT_SHADOW = hexToRgb('#01020a');
export const MOON = hexToRgb('#b9c8ff');
