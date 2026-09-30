/** Export the canonical world geometry and chest placements for the backend.
 *  node scripts/export-map-terrain.mjs <out.json>             level 1 (The Lumen Reaches)
 *  node scripts/export-map-terrain.mjs <out.json> --level 2   level 2 (Neon Meridian)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateLumenWorld } from '../src/components/WorldMap/lumenWorld.js';
import { generateNeonWorld } from '../src/components/WorldMap/neonWorld.js';

const WORLDS = { 1: ['lumen', generateLumenWorld], 2: ['neon', generateNeonWorld] };

const output = process.argv[2];
const levelFlag = process.argv.indexOf('--level');
const level = levelFlag > 0 ? Number(process.argv[levelFlag + 1]) : 1;
if (!output || !WORLDS[level]) {
  throw new Error('Usage: node scripts/export-map-terrain.mjs /path/to/backend/map_terrain_types[_l2].json [--level 2]');
}
const [id, generate] = WORLDS[level];
const world = generate();
const types = world.terrain.flatMap(row => row.map(cell => cell.type));
const chests = world.entities.filter(entity => entity.type === 'treasure_chest')
  .map(({ x, y, name, id: chestId }) => ({ id: chestId || `${id}:${x},${y}`, x, y, name }));
const payload = { level, world: id, size: world.size, origin: world.origin, types, chests };
writeFileSync(resolve(output), JSON.stringify(payload));
console.log(`Level ${level} (${id}): exported ${types.length} cells and ${chests.length} chests.`);
