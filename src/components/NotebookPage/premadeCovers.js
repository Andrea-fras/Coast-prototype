import llm from '../../assets/workshop-covers/llm.png';
import llmBanner from '../../assets/workshop-covers/llm-banner.png';
import rocket from '../../assets/workshop-covers/rocket.png';
import rocketBanner from '../../assets/workshop-covers/rocket-banner.png';
import brain from '../../assets/workshop-covers/brain.png';
import brainBanner from '../../assets/workshop-covers/brain-banner.png';
import memoryPalace from '../../assets/workshop-covers/memory-palace.png';
import memoryPalaceBanner from '../../assets/workshop-covers/memory-palace-banner.png';

// Pixel art in the world map's style (drawn by scripts/workshop-covers.mjs), by curated
// lesson id (src/data/curatedLessons.json). Shown at native size scaled up, pixelated.

/** Artwork for the workshops made by Coast, for catalogue cards. */
export const COVER_BY_ID = {
  'build-your-own-llm': llm,
  'build-a-rocket': rocket,
  'build-a-brain': brain,
  'memory-palace': memoryPalace,
};

/** The same scenes framed as a wide strip for the course banner, subject on the right. */
export const BANNER_BY_ID = {
  'build-your-own-llm': llmBanner,
  'build-a-rocket': rocketBanner,
  'build-a-brain': brainBanner,
  'memory-palace': memoryPalaceBanner,
};
