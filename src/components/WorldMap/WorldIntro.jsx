import React, { useEffect, useRef, useState } from 'react';
import { Sailboat, Zap } from 'lucide-react';
import { getOrganicUnlock, getWorldMap, WORLDS } from './mapTerrain';
import { loadFogLayer, loadWorldCanvas } from './mapAsync';
import { getLandmarks } from './mapLandmarks';

/** What each world says as the student arrives. */
const ARRIVAL = {
  lumen: {
    leaving: 'Every tile, every island. Time to sail somewhere new.',
    blurb: (l, f) => `A bigger world in finer detail. ${l} landmarks and ${f} smaller finds are hidden under the clouds, and every section you master lifts a little more.`,
    go: 'Set sail',
    Icon: Sailboat,
  },
  neon: {
    leaving: 'Every tile, every island. Now something is glowing beyond the horizon…',
    blurb: (l, f) => `A megacity that never sleeps. ${l} landmarks and ${f} smaller finds are hidden in the smog, and every section you master clears a little more.`,
    go: 'Enter the city',
    Icon: Zap,
  },
};

/**
 * Plays once when a student reaches a new world: the old level is celebrated,
 * then the camera sinks through the clouds (or smog) onto the new harbour.
 */
export default function WorldIntro({ level, onDone }) {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState(0);
  const world = getWorldMap(level);
  const landmarks = getLandmarks(world).filter((l) => !l.start && !l.minor).length;
  const finds = getLandmarks(world).filter((l) => l.minor).length;
  const copy = ARRIVAL[world.id] || ARRIVAL.lumen;
  const GoIcon = copy.Icon;

  useEffect(() => {
    const t = window.setTimeout(() => setPhase(1), 2800);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const { unlocked } = getOrganicUnlock(world.origin.x, world.origin.y, 9, world.size, world);
    let frame;
    let cancelled = false;
    // Art and fog are painted in a worker; the text shows straight away.
    Promise.all([loadWorldCanvas(world), loadFogLayer(world, unlocked, { keep: false }), loadFogLayer(world, new Set(), { keep: false })])
      .then(([src, fog, solid]) => {
        if (cancelled) return;
        const start = performance.now();
        const draw = (now) => {
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          const dpr = window.devicePixelRatio || 1;
          if (canvas.width !== Math.round(w * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
          }
          const ctx = canvas.getContext('2d');
          const t = still ? 9 : (now - start) / 1000;
          const p = Math.min(1, t / 9);
          const e = 1 - (1 - p) ** 3;
          // Screen px per tile: from high above the clouds down to the harbour,
          // never so high that the edge of the world shows.
          const cover = Math.max(w, h) / (world.size * 0.55);
          const cell = (cover + e * Math.max(0, 20 - cover)) * dpr;
          const ox = canvas.width / 2 - (world.origin.x + 0.5) * cell;
          const oy = canvas.height * 0.34 - (world.origin.y + 0.5) * cell;
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = WORLDS[world.level]?.outside || '#8a93bf';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const size = world.size * cell;
          ctx.drawImage(src, ox, oy, size, size);
          ctx.drawImage(fog.canvas, ox, oy, size, size);
          // Solid cloud first; it parts over the harbour when the new world is named.
          const part = still ? 1 : Math.min(1, Math.max(0, (t - 2.6) / 2.2));
          if (part < 1) {
            ctx.globalAlpha = 1 - part * part * (3 - 2 * part);
            ctx.drawImage(solid.canvas, ox, oy, size, size);
            ctx.globalAlpha = 1;
          }
          if (!still && p < 1) frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [world]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && phase === 1) onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onDone]);

  return (
    <div className="wm-intro" role="dialog" aria-modal="true" aria-labelledby="wm-intro-title">
      <canvas ref={canvasRef} className="wm-intro__bg" aria-hidden />
      <div className={`wm-intro__veil${phase ? ' is-open' : ''}`} aria-hidden />
      <div className="wm-intro__card" key={phase}>
        {phase === 0 ? (
          <>
            <span className="wm-intro__kicker">Level {level - 1} complete</span>
            <h2 id="wm-intro-title">You charted all of {WORLDS[level - 1]?.name}</h2>
            <p>{copy.leaving}</p>
          </>
        ) : (
          <>
            <span className="wm-intro__kicker">Level {level}</span>
            <h2 id="wm-intro-title">{WORLDS[level]?.name}</h2>
            <p>{copy.blurb(landmarks, finds)}</p>
            <button type="button" className="wm-intro__go" onClick={onDone} autoFocus>
              <GoIcon size={18} aria-hidden /> {copy.go}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
