/**
 * Logical terrain types shared by every world. They drive the organic unlock
 * (land is cheap to chart, open sea expensive) and are exported to the
 * backend, so the numbers must never change meaning.
 */
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
