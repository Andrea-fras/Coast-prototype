import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BookOpen, ChevronRight, Compass, Flame, Focus, Loader, LogOut, Map as MapIcon,
  MessageCircle, Move, Play, Target, Timer, ZoomIn, ZoomOut, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import mascot from '../../assets/sessioncompletebird.svg';
import coastLogo from '../../assets/Coastlogo-white-full.svg';
import {
  buildFogFeather,
  buildObjectives,
  computeLevel,
  getOrganicUnlock,
  getRegionName,
  getWorldCanvas,
  getWorldMap,
  visibleTreasureChests,
} from './mapTerrain';
import { buildAnimationSpec, drawMapAnimations, drawTileGrid } from './mapAnimations';
import MapTreasureModal from './MapTreasureModal';
import './MapTreasureModal.css';
import MapFocusSession from './MapFocusSession';
import '../Dashboard/Dashboard.css';
import './WorldMap.css';

const MAP_SCALE = 5;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const DEFAULT_ZOOM = 1.35;

function formatFolderLabel(folder) {
  if (!folder) return '';
  return folder
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const TILE_INSPECT_LAYER_ID = 'wm-tile-inspect-layer';

function removeTileInspectLayer() {
  document.getElementById(TILE_INSPECT_LAYER_ID)?.remove();
}

function mountTileInspectLayer(payload, onClose) {
  removeTileInspectLayer();
  const layer = document.createElement('div');
  layer.id = TILE_INSPECT_LAYER_ID;

  if (payload.highlight) {
    const hi = document.createElement('div');
    hi.className = 'wm-tile-highlight';
    const { left, top, width, height } = payload.highlight;
    hi.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${width}px;height:${height}px;pointer-events:none;margin:0;transform:none;`;
    layer.appendChild(hi);
  }

  if (payload.popup) {
    const popup = document.createElement('div');
    popup.className = 'wm-tile-popup';
    popup.setAttribute('role', 'dialog');
    popup.style.cssText = `position:fixed;left:${payload.popup.left}px;top:${payload.popup.top}px;pointer-events:auto;margin:0;transform:none;`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'wm-tile-popup-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClose();
    });
    popup.appendChild(closeBtn);

    const isHarbor = payload.section?.folder === '__harbor__'
      || payload.section?.section_index === -1;

    if (payload.section?.title) {
      if (isHarbor) {
        const section = document.createElement('span');
        section.className = 'wm-tile-popup-section';
        section.textContent = payload.section.title || 'Harbor Home';
        popup.appendChild(section);

        const note = document.createElement('span');
        note.className = 'wm-tile-popup-note';
        note.textContent = 'Starting waters — your journey begins here';
        popup.appendChild(note);
      } else {
        const lesson = document.createElement('span');
        lesson.className = 'wm-tile-popup-lesson';
        lesson.textContent = formatFolderLabel(payload.section.folder);
        popup.appendChild(lesson);

        const section = document.createElement('span');
        section.className = 'wm-tile-popup-section';
        section.textContent = `Section ${(payload.section.section_index ?? 0) + 1} · ${payload.section.title}`;
        popup.appendChild(section);

        const note = document.createElement('span');
        note.className = 'wm-tile-popup-note';
        note.textContent = 'Unlocked when you mastered this section';
        popup.appendChild(note);
      }
    } else {
      const section = document.createElement('span');
      section.className = 'wm-tile-popup-section';
      section.textContent = 'Charted waters';
      popup.appendChild(section);

      const note = document.createElement('span');
      note.className = 'wm-tile-popup-note';
      note.textContent = 'Explored from Harbor Home — master sections to tag new tiles';
      popup.appendChild(note);
    }

    layer.appendChild(popup);
  }

  document.body.appendChild(layer);
}

function computeCellSize(tileCount, vpW, vpH) {
  const minMapPx = Math.max(vpW, vpH) * MAP_SCALE;
  return Math.min(24, Math.max(8, Math.ceil(minMapPx / tileCount)));
}

function getUnlockedTileBounds(unlocked) {
  if (!unlocked?.size) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of unlocked) {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    halfW: Math.max(1, (maxX - minX) / 2),
    halfH: Math.max(1, (maxY - minY) / 2),
  };
}

/** Frame cinematic drift to charted waters — tighter when little is unlocked. */
function computeCinematicFraming(unlocked, vp, cell, featherPad = 3) {
  const bounds = getUnlockedTileBounds(unlocked);
  const fallbackOrigin = { x: 72, y: 79 };
  if (!bounds || !vp?.clientWidth) {
    return {
      origin: fallbackOrigin,
      roamX: 2.5,
      roamY: 2.5,
      minX: fallbackOrigin.x - 5,
      maxX: fallbackOrigin.x + 5,
      minY: fallbackOrigin.y - 5,
      maxY: fallbackOrigin.y + 5,
      zoomMin: 2.05,
      zoomMax: 2.45,
    };
  }

  const pad = featherPad;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minY = bounds.minY - pad;
  const maxY = bounds.maxY + pad;
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;

  const fitZoomX = vp.clientWidth / (cell * spanX * 1.08);
  const fitZoomY = vp.clientHeight / (cell * spanY * 1.08);
  const zoomMax = Math.min(MAX_ZOOM, Math.max(1.4, Math.min(fitZoomX, fitZoomY)));
  const zoomMin = Math.min(zoomMax, Math.max(1.25, zoomMax * 0.9));

  return {
    origin: { x: bounds.cx, y: bounds.cy },
    roamX: Math.max(1.5, bounds.halfW * 0.3),
    roamY: Math.max(1.5, bounds.halfH * 0.3),
    minX,
    maxX,
    minY,
    maxY,
    zoomMin,
    zoomMax,
  };
}

function clampCameraCenter(cx, cy, z, vp, cell, minX, maxX, minY, maxY) {
  const halfVpTx = (vp.clientWidth / 2) / (cell * z);
  const halfVpTy = (vp.clientHeight / 2) / (cell * z);
  const slack = 0.88;
  const loX = minX + halfVpTx * slack;
  const hiX = maxX - halfVpTx * slack;
  const loY = minY + halfVpTy * slack;
  const hiY = maxY - halfVpTy * slack;
  let x = cx;
  let y = cy;
  if (loX <= hiX) x = Math.max(loX, Math.min(hiX, x));
  else x = (minX + maxX) / 2;
  if (loY <= hiY) y = Math.max(loY, Math.min(hiY, y));
  else y = (minY + maxY) / 2;
  return { cx: x, cy: y };
}

function refreshUnlockCache(mapJson, world, unlockedRef, fogFeatherRef) {
  // Unlock blooms from the world's own harbor origin — the backend grid
  // (size/origin) may differ from the generated world, so only its
  // reveal_radius (progress) is used here.
  const size = world.size;
  const origin = world.origin;
  const { unlocked, frontier } = getOrganicUnlock(
    origin.x, origin.y, mapJson?.reveal_radius || 4, size, world,
  );
  unlockedRef.current = unlocked;
  fogFeatherRef.current = buildFogFeather(unlocked, frontier, size);
}

/** Translate a backend-grid position (origin-relative) onto the world grid. */
function backendToWorld(pos, backendOrigin, world) {
  if (!pos || !world) return null;
  const bo = backendOrigin || world.origin;
  const o = world.origin;
  const max = world.size - 1;
  return {
    x: Math.max(0, Math.min(max, pos.x - bo.x + o.x)),
    y: Math.max(0, Math.min(max, pos.y - bo.y + o.y)),
  };
}

// Fog-of-war: each tile is one flat grey, with diagonal stripes emerging
// at tile granularity — chunky pixel-art zigzag that scales with zoom.
// Tiles are over-drawn by 1px so no antialiasing seams appear.
const FOG_BG = '#33373e';
const FOG_BG_ALT = '#383c44';

function fogTileColor(x, y) {
  return ((x + y) % 6 + 6) % 6 < 3 ? FOG_BG : FOG_BG_ALT;
}

function drawViewportFog(ctx, width, height) {
  ctx.fillStyle = FOG_BG;
  ctx.fillRect(0, 0, width, height);
}

export default function WorldMap({
  isHome = false,
  onClose,
  onOpenLessons,
  onOpenChat,
}) {
  const { token, user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [dragging, setDragging] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const [mapFocus, setMapFocus] = useState(false);
  const [focusSession, setFocusSession] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [progressToast, setProgressToast] = useState(null);
  const [activeChest, setActiveChest] = useState(null);
  const [markerTick, setMarkerTick] = useState(0);
  const tileInspectOpenRef = useRef(false);
  const hasInitialCenterRef = useRef(false);

  const closeTileInspect = useCallback(() => {
    tileInspectOpenRef.current = false;
    removeTileInspectLayer();
  }, []);

  const openTileInspect = useCallback((payload) => {
    tileInspectOpenRef.current = true;
    mountTileInspectLayer(payload, closeTileInspect);
  }, [closeTileInspect]);

  const showProgressReward = useCallback((reward) => {
    if (!reward?.xp_gained) return;
    setProgressToast(reward);
    window.setTimeout(() => setProgressToast(null), 6000);
  }, []);

  const viewportRef = useRef(null);
  const profileRef = useRef(null);
  const canvasRef = useRef(null);
  const markersRef = useRef(null);
  const worldRef = useRef(null);
  const cellRef = useRef(10);
  const unlockedRef = useRef(new Set());
  const fogFeatherRef = useRef(new Map());
  const animSpecRef = useRef(null);
  const renderRef = useRef(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const dragStart = useRef(null);
  const panSyncRaf = useRef(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const dataRef = useRef(data);

  // During an active drag the pointer handler owns panRef — don't clobber it
  // from stale React state when something else triggers a re-render.
  if (!dragStart.current) {
    panRef.current = pan;
  }
  zoomRef.current = zoom;
  dataRef.current = data;

  useEffect(() => {
    document.body.classList.add('wm-open');
    return () => {
      document.body.classList.remove('wm-open');
      removeTileInspectLayer();
    };
  }, []);

  // One-time hint, fades out after a few seconds
  useEffect(() => {
    const t = window.setTimeout(() => setShowTip(false), 7000);
    return () => window.clearTimeout(t);
  }, []);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/map`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_URL}/api/stats`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
    ])
      .then(([mapJson, statsJson]) => {
        setData(mapJson);
        setStats(statsJson);
        worldRef.current = getWorldMap();
        animSpecRef.current = buildAnimationSpec(worldRef.current);
        refreshUnlockCache(mapJson, worldRef.current, unlockedRef, fogFeatherRef);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onProgress = (e) => {
      showProgressReward(e.detail);
      load();
    };
    window.addEventListener('coast-map-progress', onProgress);
    try {
      const pending = sessionStorage.getItem('coast_map_progress');
      if (pending) {
        showProgressReward(JSON.parse(pending));
        sessionStorage.removeItem('coast_map_progress');
        load();
      }
    } catch { /* ignore */ }
    return () => window.removeEventListener('coast-map-progress', onProgress);
  }, [load, showProgressReward]);

  useEffect(() => {
    if (!showProfileMenu) return undefined;
    const onDocClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDocClick);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onDocClick);
    };
  }, [showProfileMenu]);

  const updateCellSize = useCallback(() => {
    const vp = viewportRef.current;
    const world = worldRef.current;
    if (!vp || !world) return;
    cellRef.current = computeCellSize(world.size, vp.clientWidth, vp.clientHeight);
  }, []);

  const clampPan = useCallback((x, y, z = zoomRef.current) => {
    const vp = viewportRef.current;
    const world = worldRef.current;
    if (!vp || !world) return { x, y };
    const cell = cellRef.current;
    const mapPx = world.size * cell * z;
    const maxX = Math.max(0, mapPx - vp.clientWidth);
    const maxY = Math.max(0, mapPx - vp.clientHeight);
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }, []);

  const applyZoom = useCallback((nextZoom, anchorSx, anchorSy) => {
    const z0 = zoomRef.current;
    const z1 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    if (Math.abs(z1 - z0) < 0.001) return;

    const { x: panX, y: panY } = panRef.current;
    const worldX = (anchorSx + panX) / z0;
    const worldY = (anchorSy + panY) / z0;
    const newPan = clampPan(worldX * z1 - anchorSx, worldY * z1 - anchorSy, z1);

    zoomRef.current = z1;
    panRef.current = newPan;
    renderRef.current?.(performance.now() / 1000);
    setZoom(z1);
    setPan(newPan);
  }, [clampPan]);

  const centerOnPlayer = useCallback((player) => {
    const vp = viewportRef.current;
    if (!vp || !player) return;
    const cell = cellRef.current;
    const z = zoomRef.current;
    const worldX = player.x * cell + cell / 2;
    const worldY = player.y * cell + cell / 2;
    const newPan = clampPan(
      worldX * z - vp.clientWidth / 2,
      worldY * z - vp.clientHeight / 2,
      z,
    );
    panRef.current = newPan;
    setPan(newPan);
  }, [clampPan]);

  const syncTreasureMarkers = useCallback(() => {
    const layer = markersRef.current;
    if (!layer) return;
    const cell = cellRef.current;
    const z = zoomRef.current;
    const { x: panX, y: panY } = panRef.current;
    layer.querySelectorAll('.wm-treasure-marker').forEach((el) => {
      const tx = Number(el.dataset.tx);
      const ty = Number(el.dataset.ty);
      if (Number.isNaN(tx) || Number.isNaN(ty)) return;
      el.style.left = `${tx * cell * z - panX + (cell * z) / 2}px`;
      el.style.top = `${ty * cell * z - panY + (cell * z) / 2}px`;
    });
  }, []);

  const render = useCallback((time = 0) => {
    const canvas = canvasRef.current;
    const vp = viewportRef.current;
    const d = dataRef.current;
    const world = worldRef.current;
    if (!canvas || !vp || !d || !world?.mapData) return;

    const cell = cellRef.current;
    const z = zoomRef.current;
    const size = world.size;

    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;
    if (canvasSizeRef.current.w !== vpW || canvasSizeRef.current.h !== vpH) {
      canvas.width = vpW;
      canvas.height = vpH;
      canvasSizeRef.current = { w: vpW, h: vpH };
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawViewportFog(ctx, canvas.width, canvas.height);

    const { x: panX, y: panY } = panRef.current;

    ctx.save();
    ctx.translate(-panX, -panY);
    ctx.scale(z, z);
    ctx.imageSmoothingEnabled = false;

    const worldLeft = panX / z;
    const worldTop = panY / z;
    const worldRight = (panX + canvas.width) / z;
    const worldBottom = (panY + canvas.height) / z;
    const vx0 = Math.max(0, Math.floor(worldLeft / cell) - 1);
    const vy0 = Math.max(0, Math.floor(worldTop / cell) - 1);
    const vx1 = Math.min(size, Math.ceil(worldRight / cell) + 1);
    const vy1 = Math.min(size, Math.ceil(worldBottom / cell) + 1);

    // Blit the pre-rendered pixel-art world (cached offscreen canvas).
    const worldCanvas = getWorldCanvas(world);
    ctx.drawImage(
      worldCanvas,
      0, 0, worldCanvas.width, worldCanvas.height,
      0, 0, size * cell, size * cell,
    );

    // Ambient life — water glints, birds, campfires, lighthouse beams, etc.
    drawMapAnimations(ctx, {
      world,
      unlocked: unlockedRef.current,
      time,
      cell,
      vx0,
      vy0,
      vx1,
      vy1,
      animSpec: animSpecRef.current,
    });

    drawTileGrid(ctx, {
      unlocked: unlockedRef.current,
      cell,
      vx0,
      vy0,
      vx1,
      vy1,
    });

    // Fog of war — flat per-tile greys in diagonal stripes, feathered near
    // the charted edge so the map dissolves into fog instead of a hard border.
    const unlocked = unlockedRef.current;
    const feather = fogFeatherRef.current;
    for (let y = vy0; y < vy1; y += 1) {
      for (let x = vx0; x < vx1; x += 1) {
        const key = `${x},${y}`;
        if (unlocked.has(key)) continue;
        const alpha = feather.get(key);
        if (alpha != null) ctx.globalAlpha = alpha;
        ctx.fillStyle = fogTileColor(x, y);
        ctx.fillRect(x * cell - 0.5, y * cell - 0.5, cell + 1, cell + 1);
        if (alpha != null) ctx.globalAlpha = 1;
      }
    }

    const player = backendToWorld(d.player, d.origin, world);
    if (player) {
      const bob = Math.sin(time * 3.2) * 1.5;
      ctx.font = `${cell + 4}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(
        '🧭',
        player.x * cell + cell / 2,
        player.y * cell + cell / 2 + bob,
      );
      ctx.shadowBlur = 0;
    }

    ctx.restore();
    syncTreasureMarkers();
  }, [syncTreasureMarkers]);

  renderRef.current = render;

  useEffect(() => {
    if (!data || loading) return;
    updateCellSize();
    if (!hasInitialCenterRef.current) {
      centerOnPlayer(backendToWorld(data.player, data.origin, worldRef.current));
      hasInitialCenterRef.current = true;
    }
    render();
  }, [data, loading, updateCellSize, centerOnPlayer, render]);

  useEffect(() => {
    if (loading) hasInitialCenterRef.current = false;
  }, [loading]);

  useEffect(() => {
    if (loading || !data) return undefined;
    let frame;
    let lastAnimFrame = 0;
    const tick = (t) => {
      const dragging = Boolean(dragStart.current);
      if (dragging || t - lastAnimFrame >= 33) {
        renderRef.current?.(t / 1000);
        if (!dragging) lastAnimFrame = t;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loading, data]);

  useEffect(() => {
    const onResize = () => {
      updateCellSize();
      setPan(p => clampPan(p.x, p.y));
      renderRef.current?.(performance.now() / 1000);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateCellSize, clampPan]);

  const move = useCallback(async (dx, dy) => {
    if (moving || !token) return;
    setMoving(true);
    try {
      const res = await fetch(`${API_URL}/api/map/move`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dx, dy }),
      });
      const j = await res.json();
      if (j.reveal_radius != null) {
        worldRef.current = worldRef.current || getWorldMap();
        refreshUnlockCache(j, worldRef.current, unlockedRef, fogFeatherRef);
      }
      if (j.player) setData(j);
    } catch {}
    setMoving(false);
  }, [token, moving]);

  useEffect(() => {
    if (focusSession) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); move(0, -1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(0, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1, 0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, focusSession]);

  // ── Cinematic camera while a focus session is active ──
  // Drifts within charted waters; framing tightens when little is unlocked.
  useEffect(() => {
    if (!focusSession || loading || !data) return undefined;
    const vp = viewportRef.current;
    if (!vp) return undefined;

    closeTileInspect();
    const saved = { pan: { ...panRef.current }, zoom: zoomRef.current };
    const cell = cellRef.current;
    const framing = computeCinematicFraming(unlockedRef.current, vp, cell);
    const {
      origin: camOrigin,
      roamX,
      roamY,
      minX,
      maxX,
      minY,
      maxY,
      zoomMin,
      zoomMax,
    } = framing;
    const start = performance.now();
    let frame;

    const tick = (now) => {
      const t = (now - start) / 1000;
      const blend = Math.min(1, t / 3.5);
      const e = blend * blend * (3 - 2 * blend);

      const breath = 0.5 + 0.5 * Math.sin(t * 0.045 + 0.8);
      const cinZoom = zoomMin + (zoomMax - zoomMin) * breath;
      const cinX = camOrigin.x + roamX * Math.sin(t * 0.037);
      const cinY = camOrigin.y + roamY * Math.sin(t * 0.029 + 1.9);

      const savedCx = (saved.pan.x + vp.clientWidth / 2) / saved.zoom / cell;
      const savedCy = (saved.pan.y + vp.clientHeight / 2) / saved.zoom / cell;

      const z = saved.zoom + (cinZoom - saved.zoom) * e;
      const blended = clampCameraCenter(
        savedCx + (cinX - savedCx) * e,
        savedCy + (cinY - savedCy) * e,
        z,
        vp,
        cell,
        minX,
        maxX,
        minY,
        maxY,
      );

      const p = clampPan(
        blended.cx * cell * z - vp.clientWidth / 2,
        blended.cy * cell * z - vp.clientHeight / 2,
        z,
      );
      zoomRef.current = z;
      panRef.current = p;
      renderRef.current?.(now / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      zoomRef.current = saved.zoom;
      panRef.current = saved.pan;
      setZoom(saved.zoom);
      setPan(saved.pan);
      renderRef.current?.(performance.now() / 1000);
    };
  }, [focusSession, loading, data, clampPan, closeTileInspect]);

  const screenToTile = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cell = cellRef.current;
    const z = zoomRef.current;
    const { x: panX, y: panY } = panRef.current;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const x = Math.floor((sx + panX) / z / cell);
    const y = Math.floor((sy + panY) / z / cell);
    return { x, y };
  };

  const viewportAnchor = () => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0 };
    return { sx: canvas.clientWidth / 2, sy: canvas.clientHeight / 2 };
  };

  const wheelZoom = useCallback((clientX, clientY, deltaY, ctrlKey) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    // Trackpad scroll = pan-ish deltas; pinch (ctrl+wheel on Mac) = smooth zoom steps.
    const scale = ctrlKey
      ? Math.exp(-deltaY * 0.01)
      : (deltaY > 0 ? 0.92 : 1.08);
    applyZoom(zoomRef.current * scale, sx, sy);
  }, [applyZoom]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || loading) return;

    const onWheel = (e) => {
      // Mac trackpad pinch sends wheel + ctrlKey; block it from browser page zoom.
      const isPinch = e.ctrlKey;
      const isMouseWheel = e.deltaMode === 1 || Math.abs(e.deltaY) >= 48;
      if (!isPinch && !isMouseWheel) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      wheelZoom(e.clientX, e.clientY, e.deltaY, isPinch);
    };

    // Safari trackpad pinch fires gesture events instead of wheel.
    const gestureBase = { zoom: DEFAULT_ZOOM };
    const onGestureStart = (e) => {
      e.preventDefault();
      gestureBase.zoom = zoomRef.current;
    };
    const onGestureChange = (e) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      applyZoom(gestureBase.zoom * e.scale, sx, sy);
    };

    const onGestureEnd = (e) => e.preventDefault();

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('gesturestart', onGestureStart, { passive: false });
    vp.addEventListener('gesturechange', onGestureChange, { passive: false });
    vp.addEventListener('gestureend', onGestureEnd, { passive: false });

    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
    };
  }, [loading, wheelZoom, applyZoom]);

  const zoomBy = (factor) => {
    const { sx, sy } = viewportAnchor();
    applyZoom(zoomRef.current * factor, sx, sy);
  };

  const finishPointerInteraction = useCallback((e) => {
    if (!dragStart.current) return;

    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    const moved = Math.hypot(dx, dy);

    setPan(panRef.current);

    if (moved < 6 && dataRef.current?.player) {
      const tile = screenToTile(e.clientX, e.clientY);
      if (tile) {
        const key = `${tile.x},${tile.y}`;
        if (unlockedRef.current.has(key)) {
          // tile_sections is keyed on the backend grid — translate back.
          const world = worldRef.current;
          const bo = dataRef.current.origin || world?.origin || { x: 72, y: 79 };
          const backendKey = world
            ? `${tile.x - world.origin.x + bo.x},${tile.y - world.origin.y + bo.y}`
            : key;
          const section = dataRef.current.tile_sections?.[backendKey];
          const canvas = canvasRef.current;
          const rect = canvas?.getBoundingClientRect();
          const cell = cellRef.current;
          const z = zoomRef.current;
          const { x: panX, y: panY } = panRef.current;
          const tilePx = tile.x * cell * z - panX;
          const tilePy = tile.y * cell * z - panY;
          const size = cell * z;
          openTileInspect({
            section,
            highlight: rect ? {
              left: rect.left + tilePx,
              top: rect.top + tilePy,
              width: size,
              height: size,
            } : null,
            popup: {
              left: Math.min(e.clientX + 12, window.innerWidth - 280),
              top: Math.min(e.clientY + 12, window.innerHeight - 140),
            },
          });
        } else {
          closeTileInspect();
        }
      }
    }

    dragStart.current = null;
    setDragging(false);
    if (panSyncRaf.current) {
      cancelAnimationFrame(panSyncRaf.current);
      panSyncRaf.current = null;
    }

    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture?.(e.pointerId)) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch { /* ignore */ }
    }
  }, [closeTileInspect, openTileInspect, screenToTile]);

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.hypot(dx, dy) > 6 && tileInspectOpenRef.current) {
      closeTileInspect();
    }
    panRef.current = clampPan(
      dragStart.current.panX - dx,
      dragStart.current.panY - dy,
    );
    renderRef.current?.(performance.now() / 1000);
    if (!panSyncRaf.current) {
      panSyncRaf.current = requestAnimationFrame(() => {
        panSyncRaf.current = null;
        setPan(panRef.current);
      });
    }
  };

  const handlePointerUp = (e) => {
    finishPointerInteraction(e);
  };

  const handlePointerCancel = (e) => {
    finishPointerInteraction(e);
  };

  const handleTreasureComplete = useCallback((result) => {
    setData((prev) => {
      if (!prev) return prev;
      const opened = new Set(prev.treasures?.opened_ids || []);
      if (result.chest_id) opened.add(result.chest_id);
      return {
        ...prev,
        total_xp: result.total_xp ?? prev.total_xp,
        level: result.level ?? prev.level,
        xp: result.xp ?? prev.xp,
        xp_max: result.xp_max ?? prev.xp_max,
        treasures: {
          ...(prev.treasures || {}),
          opened_ids: [...opened],
        },
      };
    });
    if (result.xp_gained) {
      showProgressReward({ xp_gained: result.xp_gained, treasure: true });
    }
  }, [showProgressReward]);

  const openedChestSet = new Set(data?.treasures?.opened_ids || []);
  const worldOrigin = worldRef.current?.origin || { x: 72, y: 79 };
  const mapSize = worldRef.current?.size || 144;
  const { unlocked: unlockedForChests } = (data && worldRef.current)
    ? getOrganicUnlock(
      worldOrigin.x, worldOrigin.y, data.reveal_radius || 4, mapSize, worldRef.current,
    )
    : { unlocked: new Set() };
  const visibleChests = worldRef.current
    ? visibleTreasureChests(worldRef.current, unlockedForChests, openedChestSet)
    : [];

  useLayoutEffect(() => {
    syncTreasureMarkers();
  }, [syncTreasureMarkers, visibleChests, pan, zoom, loading]);

  const levelInfo = computeLevel(data);
  const regionName = getRegionName(
    backendToWorld(data?.player, data?.origin, worldRef.current),
    worldRef.current,
  );
  const objectives = buildObjectives(data, worldRef.current);
  const displayName = user?.name || user?.email?.split('@')[0] || 'Explorer';
  const streak = stats?.streak ?? 0;
  const totalMapTiles = mapSize * mapSize;
  const tilesCharted = unlockedForChests.size;
  const chartProgressPct = totalMapTiles > 0
    ? Math.min(100, Math.round((tilesCharted / totalMapTiles) * 100))
    : 0;

  return (
    <div className={`wm-overlay wm-fullscreen ${isHome ? 'wm-home' : ''}`}>
      <div className="wm-viewport wm-viewport-full" ref={viewportRef}>
        {loading ? (
          <div className="wm-loading wm-loading-full">
            <Loader size={32} className="spinning" />
            <span>Charting the coast...</span>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className={`wm-canvas wm-canvas-full ${dragging ? 'dragging' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
            <div
              ref={markersRef}
              className="wm-treasure-markers"
              aria-hidden={visibleChests.length === 0}
            >
              {visibleChests.map((chest) => (
                  <button
                    key={chest.id}
                    type="button"
                    className="wm-treasure-marker"
                    data-tx={chest.x}
                    data-ty={chest.y}
                    title={chest.name}
                    aria-label={`Open ${chest.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveChest(chest);
                    }}
                  >
                    <span className="wm-treasure-marker-icon">🧳</span>
                    <span className="wm-treasure-marker-label">{chest.name}</span>
                  </button>
              ))}
            </div>
          </>
        )}
      </div>

      {!focusSession && (
      <div className={`wm-ui ${mapFocus ? 'wm-focus-mode' : ''}`} data-theme="dark">
        <header className="wm-topbar">
          <div className="wm-logo">
            <img src={coastLogo} alt="Coast" className="wm-logo-img" />
          </div>
          {!mapFocus && (
          <nav className={`rp-card wm-nav-island ${navOpen ? 'open' : 'collapsed'}`}>
            <button
              type="button"
              className="wm-nav-toggle"
              onClick={() => setNavOpen(v => !v)}
              aria-label={navOpen ? 'Collapse navigation' : 'Expand navigation'}
            >
              <ChevronRight size={18} className="wm-nav-chevron" />
            </button>
            <div className="wm-nav-items">
              <button type="button" className="wm-nav-item active" aria-current="page">
                <span className="wm-nav-icon"><MapIcon size={22} /></span>
                {navOpen && <span className="wm-nav-label">Map</span>}
              </button>
              <button type="button" className="wm-nav-item" onClick={onOpenLessons}>
                <span className="wm-nav-icon"><BookOpen size={22} /></span>
                {navOpen && <span className="wm-nav-label">Lessons</span>}
              </button>
              <button type="button" className="wm-nav-item" onClick={onOpenChat}>
                <span className="wm-nav-icon"><MessageCircle size={22} /></span>
                {navOpen && <span className="wm-nav-label">Chat</span>}
              </button>
            </div>
          </nav>
          )}
        </header>

        <aside className="wm-left-stack">
          <div className="wm-profile-wrap" ref={profileRef}>
            <button
              type="button"
              className="rp-card card streak-card wm-profile-card"
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileMenu((v) => !v);
              }}
              aria-expanded={showProfileMenu}
              aria-haspopup="menu"
              tabIndex={mapFocus ? -1 : 0}
              aria-hidden={mapFocus}
            >
              <div className="wm-profile-header">
                <img src={mascot} alt="Pedro" className="rp-briefing-avatar" />
                <div className="rp-briefing-title">
                  <span className="rp-briefing-name">{displayName}</span>
                  <span className="rp-briefing-sub">
                    Level {levelInfo.level} · {levelInfo.xp} / {levelInfo.xpMax} XP
                  </span>
                </div>
              </div>
              <div className="wm-xp-bar">
                <div
                  className="wm-xp-fill"
                  style={{ width: `${(levelInfo.xp / levelInfo.xpMax) * 100}%` }}
                />
              </div>
              <h3 className={`wm-streak-heading ${streak > 0 ? 'hot' : 'cold'}`}>
                Streak
                {streak > 0 && <Flame size={20} className="wm-streak-flame" aria-hidden />}
              </h3>
              {streak > 0 ? (
                <div className="streak-stat streak-active">
                  <span className="streak-num">{streak}</span>
                  <span className="streak-label">
                    {streak === 1 ? 'day exploring' : 'days exploring'}
                  </span>
                </div>
              ) : (
                <div className="streak-stat streak-zero">
                  <Flame size={28} className="wm-streak-flame-dormant" aria-hidden />
                  <span className="streak-goal-text">
                    1 focus session today lights the flame
                  </span>
                </div>
              )}
            </button>

            {showProfileMenu && !mapFocus && (
              <div className="wm-profile-menu" role="menu">
                <div className="wm-profile-menu-name">{displayName}</div>
                <button
                  type="button"
                  className="wm-profile-menu-logout"
                  role="menuitem"
                  onClick={() => logout()}
                >
                  <LogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>

          <div className="rp-card wm-map-controls">
            <button
              type="button"
              className={`wm-zoom-btn wm-focus-btn ${mapFocus ? 'active' : ''}`}
              onClick={() => {
                setMapFocus((v) => !v);
                setShowProfileMenu(false);
              }}
              aria-label={mapFocus ? 'Exit map focus' : 'Focus map'}
              aria-pressed={mapFocus}
            >
              <Focus size={20} />
            </button>
            <button type="button" className="wm-zoom-btn" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
              <ZoomIn size={20} />
            </button>
            <button type="button" className="wm-zoom-btn" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
              <ZoomOut size={20} />
            </button>
          </div>
        </aside>

        {!mapFocus && (
        <div className="wm-right-stack">
          <div className="rp-card wm-region-card">
            <h3 className="wm-region-heading">
              <Compass size={24} className="wm-region-icon" />
              Current Region
            </h3>
            <span className="wm-region-name">{regionName}</span>
            <div className="wm-chart-progress">
              <div className="wm-chart-progress-head">
                <span className="wm-chart-progress-label">
                  {tilesCharted.toLocaleString()} of {totalMapTiles.toLocaleString()} tiles charted
                </span>
              </div>
              <div className="wm-chart-progress-track" aria-hidden>
                <div
                  className="wm-chart-progress-fill"
                  style={{ width: `${chartProgressPct}%` }}
                />
              </div>
            </div>
            <div className="rp-review-stats wm-region-stats">
              <div className="rp-review-stat">
                <span className="rp-review-stat-val">{data?.sections_mastered || 0}</span>
                <span className="rp-review-stat-lbl">Mastered</span>
              </div>
              <div className="rp-review-stat">
                <span className="rp-review-stat-val">{levelInfo.level}</span>
                <span className="rp-review-stat-lbl">Level</span>
              </div>
            </div>
            {objectives.length > 0 && (
              <div className="wm-objectives">
                <span className="wm-objectives-head">
                  <Target size={16} />
                  Quests
                </span>
                <ul className="wm-quest-list">
                  {objectives.map(obj => (
                    <li
                      key={obj.id}
                      className={`wm-quest${obj.done ? ' wm-quest--done' : ''}`}
                    >
                      <span className={`wm-quest-check${obj.done ? ' wm-quest-check--done' : ''}`} aria-hidden />
                      <div className="wm-quest-body">
                        <span className="wm-quest-label">{obj.label}</span>
                        {obj.progress != null && obj.progressMax != null && !obj.done && (
                          <div className="wm-quest-progress">
                            <div className="wm-quest-progress-track">
                              <div
                                className="wm-quest-progress-fill"
                                style={{
                                  width: `${Math.min(100, Math.round((obj.progress / obj.progressMax) * 100))}%`,
                                }}
                              />
                            </div>
                            <span className="wm-quest-progress-text">
                              {obj.progress.toLocaleString()} / {obj.progressMax.toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className="wm-quest-rewards">
                          {obj.reward && (
                            <span className="wm-quest-reward">{obj.reward}</span>
                          )}
                          {obj.bonusReward && (
                            <span className="wm-quest-reward wm-quest-reward--bonus">
                              {obj.bonusReward}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            className="rp-card wm-timer-launch"
            onClick={() => setFocusSession(true)}
          >
            <span className="wm-timer-launch-icon">
              <Timer size={24} />
            </span>
            <span className="wm-timer-launch-text">
              <span className="wm-timer-launch-title">Study Timer</span>
              <span className="wm-timer-launch-sub">Start a focus session</span>
            </span>
            <span className="wm-timer-launch-play">
              <Play size={16} />
            </span>
          </button>
        </div>
        )}

        {!mapFocus && (
        <div className={`rp-card wm-tip${showTip ? '' : ' wm-tip--hide'}`} aria-hidden={!showTip}>
          <Move size={16} />
          <span>Drag to pan · Click a charted tile to inspect · Arrow keys to walk</span>
        </div>
        )}

      </div>
      )}

      <MapFocusSession
        active={focusSession}
        onClose={() => setFocusSession(false)}
      />

      {activeChest && (
        <MapTreasureModal
          chest={activeChest}
          token={token}
          onClose={() => setActiveChest(null)}
          onComplete={handleTreasureComplete}
        />
      )}

      {progressToast && !mapFocus && !focusSession && (
        <div className="wm-progress-toast" role="status">
          <div className="wm-progress-toast-title">
            {progressToast.treasure
              ? 'Treasure chest opened!'
              : progressToast.lesson_complete
                ? 'Lesson complete!'
                : 'Section complete!'}
          </div>
          <div className="wm-progress-toast-xp">+{progressToast.xp_gained} XP</div>
          {progressToast.map?.explored_delta_pct > 0 && (
            <div className="wm-progress-toast-map">
              Map expanded +{progressToast.map.explored_delta_pct}% explored
            </div>
          )}
          {progressToast.lesson_complete && (
            <div className="wm-progress-toast-bonus">Major map expansion unlocked</div>
          )}
        </div>
      )}

      {!isHome && onClose && !mapFocus && !focusSession && (
        <button type="button" className="wm-close wm-close-float" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>
      )}
    </div>
  );
}
