/** One-off: export the world terrain type grid for backend organic unlock sync. */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateWorldMap, MAP_SIZE, HQ } from '../src/components/WorldMap/coastWorldMap.js';

const size = MAP_SIZE;
const { terrain } = generateWorldMap(size);
const types = [];
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    types.push(terrain[y][x].type);
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), '../../../coast-local-oma/map_terrain_types.json');
writeFileSync(out, JSON.stringify({ size, origin: { x: HQ.x, y: HQ.y }, types }));
console.log(`Wrote ${types.length} terrain cells (size ${size}, origin ${HQ.x},${HQ.y}) → ${out}`);
