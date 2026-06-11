import React from 'react';

/** 14×10 char grids — one char = one pixel. */
const SPRITES = {
  /* Tropical — green grass, sand shore, palm trunk + fronds */
  current: [
    '......tt......',
    '.....tTTt.....',
    '....tTTTTt....',
    '...gggggggg...',
    '..gggggggggg..',
    '.gggggggggggg.',
    'ssggggggggggss',
    '.ssssssssssss.',
    '..ssssssssss..',
    '...ssssssss...',
  ],
  /* Barren rock — dark grey, no life */
  locked: [
    '....dddddd....',
    '...dddddddd...',
    '..dddddddddd..',
    '.dddddddddddd.',
    'dddddddddddddd',
    'dddddddddddddd',
    'dddddddddddddd',
    '.dddddddddddd.',
    '..dddddddddd..',
    '...dddddddd...',
  ],
  /* Golden treasure island — warm sand + gold crown */
  complete: [
    '......**......',
    '.....*YY*.....',
    '...ssYYYYss...',
    '...sYYYYYYYS..',
    '..sYYYYYYYYY..',
    '.sYYYYYYYYYs.',
    'sYYYYYYYYYYYs',
    '.sYYYYYYYYYs.',
    '..ssssssssss..',
    '...ssssssss...',
  ],
};

const PALETTES = {
  current: {
    t: '#1a5c1a',
    T: '#2d8a2d',
    g: '#5cb85c',
    G: '#4a9e3f',
    s: '#e8b84a',
    S: '#c9922a',
  },
  locked: {
    d: '#3a3a3a',
    D: '#525252',
  },
  complete: {
    '*': '#fff8dc',
    Y: '#ffd033',
    y: '#ffb503',
    s: '#c8860a',
    S: '#a06808',
  },
};

function PixelIsland({ variant = 'current', size = 40 }) {
  const grid = SPRITES[variant] || SPRITES.current;
  const palette = PALETTES[variant] || PALETTES.current;
  const cols = grid[0]?.length || 14;
  const rows = grid.length;
  const px = size / cols;
  const height = Math.round(px * rows);

  return (
    <svg
      className="pixel-island-svg"
      width={size}
      height={height}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {grid.map((row, y) =>
        row.split('').map((ch, x) => {
          if (ch === '.') return null;
          const fill = palette[ch];
          if (!fill) return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
}

export default PixelIsland;
