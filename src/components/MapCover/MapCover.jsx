import React, { useEffect, useRef } from 'react';
import { getWorldMap, WORLDS } from '../WorldMap/mapTerrain';
import { loadFogLayer, loadWorldCanvas, peekFogLayer, peekWorldCanvas } from '../WorldMap/mapAsync';
import { chartedArea, frontierSpot } from './mapCoverData';
import './MapCover.css';

/**
 * A crop of the student's own world: the tiles a course (or one section) charted,
 * centred, with the fog of war around them exactly as on the map.
 *
 * tiles      world tiles to feature; empty → the coastline where charting will start
 * highlight  dim other charted land so these tiles stand out
 * seed       picks a stable coastline spot when there are no tiles yet
 */
export default function MapCover({ mapData, tiles = null, highlight = true, seed = '', className = '', maxTile = 20, label }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !mapData) return undefined;

    const featured = tiles?.length ? tiles : [frontierSpot(mapData, seed)];
    const world = getWorldMap(featured[0].level || mapData.map_level || 1);
    const { unlocked } = chartedArea(mapData, world);
    let source = peekWorldCanvas(world);
    let fog = peekFogLayer(world, unlocked)?.canvas || null;
    const featuredKeys = tiles?.length && highlight ? new Set(tiles.map((t) => `${t.x},${t.y}`)) : null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of featured) {
      minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x);
      minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y);
    }
    const midX = (minX + maxX + 1) / 2;
    const midY = (minY + maxY + 1) / 2;

    const draw = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width < 2 || height < 2 || !source || !fog) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      // Fit the featured land with a little sea around it; whole device pixels per tile keep it crisp.
      const fit = Math.min(width / (maxX - minX + 5), height / (maxY - minY + 5));
      const tilePx = Math.max(8, Math.min(maxTile, fit));
      const td = Math.max(2, Math.round(tilePx * dpr));
      const spanX = canvas.width / td;
      const spanY = canvas.height / td;
      const startX = midX - spanX / 2;
      const startY = midY - spanY / 2;

      ctx.fillStyle = (WORLDS[world.level] || WORLDS[1]).outside;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const k = source.width / world.size;
      ctx.drawImage(source, startX * k, startY * k, spanX * k, spanY * k, 0, 0, canvas.width, canvas.height);
      // The same fog as the map: clouds over the Reaches, smog over the Meridian.
      const kf = fog.width / world.size;
      ctx.drawImage(fog, startX * kf, startY * kf, spanX * kf, spanY * kf, 0, 0, canvas.width, canvas.height);

      const x0 = Math.floor(startX);
      const y0 = Math.floor(startY);
      for (let y = y0; y <= y0 + Math.ceil(spanY) + 1; y += 1) {
        for (let x = x0; x <= x0 + Math.ceil(spanX) + 1; x += 1) {
          const key = `${x},${y}`;
          // Round both edges so neighbouring tiles meet exactly (overlaps would draw a grid).
          const px = Math.round((x - startX) * td);
          const py = Math.round((y - startY) * td);
          const w = Math.round((x + 1 - startX) * td) - px;
          const h = Math.round((y + 1 - startY) * td) - py;
          if (unlocked.has(key) && featuredKeys && !featuredKeys.has(key)) {
            ctx.globalAlpha = 0.42;
            ctx.fillStyle = '#0d0f14';
            ctx.fillRect(px, py, w, h);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    let alive = true;
    // Level 2 art and fog arrive from the map worker; draw as soon as both are here.
    if (!source || !fog) {
      Promise.all([loadWorldCanvas(world), loadFogLayer(world, unlocked)]).then(([art, layer]) => {
        if (!alive) return;
        source = art;
        fog = layer.canvas;
        draw();
      });
    }
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [mapData, tiles, highlight, seed, maxTile]);

  return (
    <div ref={wrapRef} className={`map-cover ${className}`.trim()} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <canvas ref={canvasRef} className="map-cover__canvas" />
    </div>
  );
}
