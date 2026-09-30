import { findContinueFolder, findStartFolder } from '../../utils/lessonProgress';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronDown, Flame, Focus, LayoutDashboard, Loader, LogOut, Move, Play, Plus, Sparkles, Timer, ZoomIn, ZoomOut, X, HelpCircle,
} from 'lucide-react';
import { formatTilesUnlockedLine } from '../../utils/mapRewardText';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import mascot from '../../assets/sessioncompletebird.svg';
import AppTopBar from '../AppNav/AppTopBar';
import MapCover from '../MapCover/MapCover';
import { tilesByFolder } from '../MapCover/mapCoverData';
import { primeMapData } from '../../utils/mapData';
import {
  computeLevel,
  getFullUnlock,
  getOrganicUnlock,
  getRegionName,
  getWorldMap,
  getDiscoveryOrder,
  visibleTreasureChests,
  WORLDS,
} from './mapTerrain';
import { buildLumenAnimSpec, drawLumenAnimations } from './lumenAnimations';
import { buildNeonAnimSpec, drawNeonAnimations } from './neonAnimations';
import { chartDistance } from './mapFog';
import { loadFogLayer, loadWorldCanvas, peekFogLayer, peekWorldCanvas } from './mapAsync';
import { discoveryStatus, newlyDiscovered } from './mapDiscovery';
import { drawBeacons, visibleBeacons } from './mapBeacons';
import { drawLightning } from './mapLightning';
import WorldIntro from './WorldIntro';
import MapTreasureModal from './MapTreasureModal';
import './MapTreasureModal.css';
import MapFocusSession from './MapFocusSession';
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
function computeCinematicFraming(unlocked, vp, cell, fallbackOrigin, featherPad = 3) {
  const bounds = getUnlockedTileBounds(unlocked);
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

/** Charted tiles for the world on screen: a finished level stays fully charted. */
function unlockedFor(mapJson, world) {
  // Unlock blooms from the world's own harbor origin — the backend grid
  // (size/origin) may differ from the generated world, so only its
  // reveal_radius (progress) is used here.
  if ((world.level || 1) < (mapJson?.map_level || 1)) return getFullUnlock(world).unlocked;
  return getOrganicUnlock(world.origin.x, world.origin.y, mapJson?.reveal_radius || 4, world.size, world).unlocked;
}

/**
 * Charted tiles + fog for the world on screen. Fog is painted in a worker:
 * until it arrives the previous layer of the same world stays up (so nothing
 * new is revealed early), and `onFog` fires when the new one is ready.
 */
function refreshUnlockCache(mapJson, world, unlockedRef, fogRef, onFog) {
  const unlocked = unlockedFor(mapJson, world);
  unlockedRef.current = unlocked;
  const ready = peekFogLayer(world, unlocked);
  if (ready) {
    fogRef.current = ready;
    return unlocked;
  }
  if (fogRef.current && fogRef.current.level !== world.level) fogRef.current = null;
  loadFogLayer(world, unlocked).then((layer) => {
    if (unlockedRef.current !== unlocked) return;
    fogRef.current = layer;
    onFog?.();
  });
  return unlocked;
}

const ANIMATIONS = {
  lumen: { build: buildLumenAnimSpec, draw: drawLumenAnimations },
  neon: { build: buildNeonAnimSpec, draw: drawNeonAnimations },
};
const animSpecs = new Map();
function animSpecFor(world) {
  if (!animSpecs.has(world)) animSpecs.set(world, ANIMATIONS[world.id]?.build(world) || null);
  return animSpecs.get(world);
}

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function readSeen(key) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? null : Number(v);
  } catch { return null; }
}
function writeSeen(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* storage may be blocked */ }
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

// Beyond the world's edge: the Reaches' cloud deck, the Meridian's night smog.
function drawViewportFog(ctx, width, height, level = 1) {
  ctx.fillStyle = (WORLDS[level] || WORLDS[1]).outside;
  ctx.fillRect(0, 0, width, height);
}

function isEditableKeyTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

export default function WorldMap({
  isHome = false,
  overlayActive = false,
  onClose,
  onOpenLessons,
  onContinueLesson,
  onOpenCourse,
  onNavigate,
  onOpenControlCenter,
}) {
  const { token, user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [continueLesson, setContinueLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [dragging, setDragging] = useState(false);
  const [mapFocus, setMapFocus] = useState(false);
  const [focusSession, setFocusSession] = useState(false);
  const focusRef = useRef(false);
  focusRef.current = focusSession;
  const [showTip, setShowTip] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [progressToast, setProgressToast] = useState(null);
  const [activeChest, setActiveChest] = useState(null);
  // Which world is on screen: null follows the student's current level.
  const [viewLevel, setViewLevel] = useState(null);
  const [status, setStatus] = useState(null);
  const [beaconIds, setBeaconIds] = useState([]);
  const [discoveries, setDiscoveries] = useState([]);
  const [revealChip, setRevealChip] = useState(null);
  const [activeMarker, setActiveMarker] = useState(null);
  const [worldIntro, setWorldIntro] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
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
  const fogRef = useRef(null);
  const beaconsRef = useRef([]);
  const revealRef = useRef(null);
  const cameraTweenRef = useRef(null);
  const viewLevelRef = useRef(null);
  const motionRef = useRef(!prefersReducedMotion());
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
  viewLevelRef.current = viewLevel;

  useEffect(() => {
    document.body.classList.add('wm-open');
    return () => {
      document.body.classList.remove('wm-open');
      removeTileInspectLayer();
    };
  }, []);

  useEffect(() => {
    if (overlayActive) closeTileInspect();
  }, [overlayActive, closeTileInspect]);

  // One-time hint, fades out after a few seconds
  useEffect(() => {
    const t = window.setTimeout(() => setShowTip(false), 7000);
    return () => window.clearTimeout(t);
  }, []);

  /**
   * Put the right world on screen and recompute everything derived from the
   * payload: charted tiles, fog layer, discoveries and beacons.
   */
  const applyWorld = useCallback((mapJson) => {
    const mapLevel = mapJson?.map_level || 1;
    const level = Math.min(viewLevelRef.current ?? mapLevel, mapLevel);
    const world = getWorldMap(level);
    const switched = worldRef.current !== world;
    worldRef.current = world;
    const markReady = () => {
      const ok = Boolean(peekWorldCanvas(world) && fogRef.current?.level === (world.level || 1));
      setWorldReady(ok);
      if (ok) renderRef.current?.(performance.now() / 1000);
    };
    const unlocked = refreshUnlockCache(mapJson, world, unlockedRef, fogRef, markReady);
    loadWorldCanvas(world).then(markReady);
    markReady();
    const complete = level < mapLevel;
    const next = discoveryStatus(world, mapJson, { complete });
    const beacons = visibleBeacons(next.items, chartDistance(world.size, unlocked), world.size);
    beaconsRef.current = beacons;
    setStatus(next);
    setBeaconIds(beacons.map((b) => b.id));
    return { world, switched, status: next, complete };
  }, []);

  /**
   * Tween the camera so tile (x, y) sits in the middle of the viewport. The
   * pan target is worked out when the flight starts (first frame), so it is
   * right even if the map is still sizing itself when this is called.
   */
  const flyTo = useCallback((x, y, dur = 900) => {
    cameraTweenRef.current = { x, y, dur, start: null, from: null };
  }, []);

  const finishReveal = useCallback(() => {
    const r = revealRef.current;
    if (!r) return;
    revealRef.current = null;
    setRevealing(false);
    writeSeen(r.seenKey, r.to);
    setRevealChip({ tiles: r.to - r.from, key: r.start });
    window.setTimeout(() => setRevealChip((c) => (c?.key === r.start ? null : c)), 4200);
    if (r.found.length) setDiscoveries((q) => [...q, ...r.found]);
  }, []);

  /** Lift the fog over tiles [from, to) of the discovery order, with sparkles. */
  const startReveal = useCallback((world, from, to, found, seenKey) => {
    const { keys } = getDiscoveryOrder(world);
    const n = to - from;
    const xs = new Int16Array(n);
    const ys = new Int16Array(n);
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i += 1) {
      const key = keys[from + i];
      const c = key.indexOf(',');
      xs[i] = +key.slice(0, c);
      ys[i] = +key.slice(c + 1);
      sx += xs[i];
      sy += ys[i];
    }
    const beforeSet = new Set(keys.slice(0, from));
    const motion = motionRef.current;
    setRevealing(true);
    const reveal = {
      world, from, to, xs, ys, found, seenKey,
      before: peekFogLayer(world, beforeSet, { keep: false }),
      start: null, // set on the first frame both fog layers are ready
      dur: motion ? Math.min(3800, 1500 + n * 2.5) : 1,
    };
    revealRef.current = reveal;
    if (!reveal.before) loadFogLayer(world, beforeSet, { keep: false }).then((layer) => { reveal.before = layer; });
    // Frame the newly charted area; the discovery banner can fly to each find.
    flyTo(sx / n, sy / n, 1100);
  }, [flyTo]);

  const loadStats = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/api/stats?tz_offset=${-new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((next) => { if (next) setStats(next); })
      .catch(() => {});
  }, [token]);

  const load = useCallback(() => {
    if (!token) return;
    // Refresh progress without blanking the map or resetting its camera.
    fetch(`${API_URL}/api/map?compact=true`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!res.ok) throw new Error('Map could not be loaded'); return res.json(); })
      .then((mapJson) => {
        setData(mapJson);
        primeMapData(mapJson);
        const { world, status: st, complete } = applyWorld(mapJson);
        const mapLevel = mapJson.map_level || 1;
        // First visit to a new world: the intro plays before any reveal.
        const introKey = user?.id ? `coast_world_intro_v2:${user.id}` : null;
        const introSeen = introKey ? readSeen(introKey) : null;
        if (mapLevel >= 2 && introKey && (introSeen ?? 1) < mapLevel) {
          setWorldIntro({ level: mapLevel, key: introKey });
        }
        // Reveal whatever was charted since the student last looked.
        if (complete || !user?.id) return;
        const seenKey = `coast_map_seen:${user.id}:${world.id}`;
        const count = unlockedRef.current.size;
        const prev = readSeen(seenKey);
        if (prev == null || prev > count) writeSeen(seenKey, count);
        else if (prev < count && !revealRef.current) {
          startReveal(world, prev, count, newlyDiscovered(st.items, prev, count), seenKey);
        }
      })
      .catch(() => { if (!dataRef.current) setData(null); })
      .finally(() => setLoading(false));
    fetch(`${API_URL}/api/lessons/summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : {})
      .then((lessons) => setContinueLesson(
        findContinueFolder(Object.keys(lessons), lessons) || findStartFolder(Object.keys(lessons), lessons),
      ))
      .catch(() => {});
    loadStats();
  }, [token, user?.id, applyWorld, startReveal, loadStats]);

  useEffect(() => { load(); }, [load]);

  // Lessons and chat open over the map, which stays mounted: refresh the streak on the way back.
  useEffect(() => { if (!overlayActive) loadStats(); }, [overlayActive, loadStats]);

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
    closeTileInspect();
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
  }, [clampPan, closeTileInspect]);

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

  // Everything in the marker layer carrying data-tx/ty (chests, landmarks,
  // popovers) is pinned to its tile as the camera moves.
  const syncTreasureMarkers = useCallback(() => {
    const layer = markersRef.current;
    if (!layer) return;
    const cell = cellRef.current;
    const z = zoomRef.current;
    const { x: panX, y: panY } = panRef.current;
    layer.querySelectorAll('[data-tx]').forEach((el) => {
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
    const now = performance.now();

    // Camera tween (fly to a discovery / follow a reveal).
    const tween = cameraTweenRef.current;
    if (tween && !dragStart.current) {
      if (tween.start == null) {
        tween.start = now;
        tween.from = { ...panRef.current };
      }
      const to = {
        x: (tween.x + 0.5) * cell * z - vp.clientWidth / 2,
        y: (tween.y + 0.5) * cell * z - vp.clientHeight / 2,
      };
      const p = Math.min(1, (now - tween.start) / tween.dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      panRef.current = clampPan(
        tween.from.x + (to.x - tween.from.x) * e,
        tween.from.y + (to.y - tween.from.y) * e,
      );
      if (p >= 1) {
        cameraTweenRef.current = null;
        setPan(panRef.current);
      }
    }

    // Art and fog come from a worker: until they (and a pending reveal's
    // "before" fog) are ready, keep the last frame rather than show a spoiler.
    const art = peekWorldCanvas(world);
    const fog = fogRef.current?.level === (world.level || 1) ? fogRef.current : null;
    const pendingReveal = revealRef.current;
    if (!art || !fog || (pendingReveal && pendingReveal.world === world && !pendingReveal.before)) return;
    if (pendingReveal && pendingReveal.start == null) pendingReveal.start = now;

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
    drawViewportFog(ctx, canvas.width, canvas.height, world.level);

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

    // Blit only the visible part of a world-sized layer.
    const blit = (img) => {
      const k = img.width / size;
      ctx.drawImage(
        img,
        vx0 * k, vy0 * k, (vx1 - vx0) * k, (vy1 - vy0) * k,
        vx0 * cell, vy0 * cell, (vx1 - vx0) * cell, (vy1 - vy0) * cell,
      );
    };

    // The pre-rendered pixel-art world (cached offscreen canvas).
    blit(art);

    const motion = motionRef.current;
    const unlocked = unlockedRef.current;
    // Ambient life: gulls and lighthouse beams in the Reaches, traffic and the
    // maglev in the Meridian.
    ANIMATIONS[world.id]?.draw(ctx, {
      world, unlocked, time, cell, vx0, vy0, vx1, vy1, spec: animSpecFor(world), motion,
    });

    // Fog of war: one pre-rendered layer (clouds or smog, with the glimpse band).
    blit(fog.canvas);

    // A reveal in progress: tiles not yet uncovered keep the old fog,
    // and the moving edge sparkles.
    const reveal = revealRef.current;
    if (reveal && reveal.world === world) {
      const p = Math.min(1, (now - reveal.start) / reveal.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const n = reveal.to - reveal.from;
      const shown = Math.floor(n * e);
      if (shown < n) {
        ctx.save();
        ctx.beginPath();
        for (let i = shown; i < n; i += 1) {
          const x = reveal.xs[i];
          const y = reveal.ys[i];
          if (x < vx0 - 1 || x > vx1 || y < vy0 - 1 || y > vy1) continue;
          ctx.rect(x * cell, y * cell, cell, cell);
        }
        ctx.clip();
        blit(reveal.before.canvas);
        ctx.restore();
      }
      const spark = Math.max(2, Math.round(cell / 6));
      for (let i = Math.max(0, shown - 60); i < shown; i += 3) {
        const age = (shown - i) / 60;
        const sx = (reveal.xs[i] + 0.5) * cell + Math.sin(i * 1.7) * cell * 0.3;
        const sy = (reveal.ys[i] + 0.5) * cell - age * cell * 0.8;
        const tint = world.id === 'neon' ? '39,230,255' : '255,236,170';
        ctx.fillStyle = i % 2 ? `rgba(${tint},${1 - age})` : `rgba(255,255,255,${1 - age})`;
        ctx.fillRect(Math.round(sx), Math.round(sy), spark, spark);
      }
      if (p >= 1) finishReveal();
    }

    // The Meridian's polluted smog is full of lightning.
    if (world.fog === 'smog') {
      drawLightning(ctx, { world, dist: fog.dist, time, cell, vx0, vy0, vx1, vy1, motion });
    }

    // Beacons reach over the fog: smoke, lights, a floating island…
    if (beaconsRef.current.length) {
      drawBeacons(ctx, { items: beaconsRef.current, time, cell, motion, night: world.id === 'neon' });
    }

    const mapLevel = d.map_level || 1;
    // The explorer steps out of frame while the focus timer is up.
    const player = (world.level || 1) === mapLevel && !focusRef.current
      ? backendToWorld(d.player, d.origin, world) : null;
    if (player) {
      const bob = motion ? Math.sin(time * 3.2) * 1.5 : 0;
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
  }, [syncTreasureMarkers, clampPan, finishReveal]);

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
    if (loading || !data || overlayActive) return undefined;
    let frame;
    let lastAnimFrame = 0;
    const tick = (t) => {
      const dragging = Boolean(dragStart.current);
      if (!document.hidden && (dragging || t - lastAnimFrame >= 33)) {
        renderRef.current?.(t / 1000);
        if (!dragging) lastAnimFrame = t;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loading, data, overlayActive]);

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
      if (j.reveal_radius != null) applyWorld(j);
      if (j.player) setData(j);
    } catch { /* Keep the last confirmed player position after a failed move. */ }
    setMoving(false);
  }, [token, moving, applyWorld]);

  useEffect(() => {
    if (focusSession) return undefined;
    const onKey = (e) => {
      if (overlayActive) return;
      if (isEditableKeyTarget(e.target)) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); move(0, -1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(0, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1, 0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, focusSession, overlayActive]);

  // ── Cinematic camera while a focus session is active ──
  // Drifts within charted waters; framing tightens when little is unlocked.
  useEffect(() => {
    if (!focusSession || loading || !data) return undefined;
    const vp = viewportRef.current;
    if (!vp) return undefined;

    closeTileInspect();
    const saved = { pan: { ...panRef.current }, zoom: zoomRef.current };
    const cell = cellRef.current;
    const framing = computeCinematicFraming(unlockedRef.current, vp, cell, worldRef.current?.origin || { x: 80, y: 80 });
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

    if (moved < 6) setActiveMarker(null);
    if (moved < 6 && dataRef.current?.player) {
      const tile = screenToTile(e.clientX, e.clientY);
      if (tile) {
        const key = `${tile.x},${tile.y}`;
        if (unlockedRef.current.has(key)) {
          // tile_sections is keyed on the backend grid — translate back.
          // Level 2+ tiles carry a "2:" prefix; level 1 keeps plain "x,y".
          const world = worldRef.current;
          const level = world?.level || 1;
          const bo = dataRef.current.origins?.[level]
            || ((dataRef.current.map_level || 1) === level ? dataRef.current.origin : null)
            || world?.origin || { x: 72, y: 79 };
          const local = world
            ? `${tile.x - world.origin.x + bo.x},${tile.y - world.origin.y + bo.y}`
            : key;
          const backendKey = level > 1 ? `${level}:${local}` : local;
          const ref = dataRef.current.tile_sections?.[backendKey];
          const section = typeof ref === 'number' ? dataRef.current.section_catalog?.[ref] : ref;
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
    // Any touch skips a reveal in progress and stops a camera flight.
    if (revealRef.current) finishReveal();
    cameraTweenRef.current = null;
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

  const folderTiles = useMemo(() => (data ? tilesByFolder(data) : {}), [data]);
  const continueTiles = continueLesson ? folderTiles[continueLesson.name]?.all || null : null;

  const mapLevel = data?.map_level || 1;
  const shownLevel = Math.min(viewLevel ?? mapLevel, mapLevel);
  const shownWorld = worldRef.current;
  const openedChestSet = new Set(data?.treasures?.opened_ids || []);
  const mapSize = shownWorld?.size || 144;
  const unlockedNow = (data && shownWorld) ? unlockedFor(data, shownWorld) : new Set();
  const visibleChests = shownWorld
    ? visibleTreasureChests(shownWorld, unlockedNow, openedChestSet)
    : [];
  const beaconSet = new Set(beaconIds);
  const landmarkMarkers = (status?.items || []).filter((it) => it.kind !== 'chest'
    && (it.discovered || beaconSet.has(it.id)));
  const markerItem = activeMarker ? (status?.items || []).find((it) => it.id === activeMarker.id) || null : null;
  const nextFind = shownLevel === mapLevel ? status?.next || null : null;

  useLayoutEffect(() => {
    syncTreasureMarkers();
  }, [syncTreasureMarkers, visibleChests.length, landmarkMarkers.length, markerItem, pan, zoom, loading]);

  // Switching worlds re-frames the camera on the new world's harbour.
  useEffect(() => {
    if (!dataRef.current) return;
    const { world, switched } = applyWorld(dataRef.current);
    if (!switched) return;
    updateCellSize();
    const onLevel = (world.level || 1) === (dataRef.current.map_level || 1);
    centerOnPlayer(onLevel ? backendToWorld(dataRef.current.player, dataRef.current.origin, world) : world.origin);
    renderRef.current?.(performance.now() / 1000);
  }, [viewLevel, applyWorld, updateCellSize, centerOnPlayer]);

  // Discovery banners take turns; each stays long enough to read.
  useEffect(() => {
    if (!discoveries.length) return undefined;
    const t = window.setTimeout(() => setDiscoveries((q) => q.slice(1)), 9000);
    return () => window.clearTimeout(t);
  }, [discoveries]);

  const levelInfo = computeLevel(data);
  const xpPct = levelInfo.xpMax > 0 ? Math.min(100, Math.round((levelInfo.xp / levelInfo.xpMax) * 100)) : 0;
  const week = Array.isArray(stats?.week) ? stats.week : [];
  const todayIdx = week.reduce((last, day, i) => (day.status !== 'future' ? i : last), -1);
  // "Current region" follows the camera, so panning around names the place you're looking at.
  const vpEl = viewportRef.current;
  const centerTile = vpEl && shownWorld ? {
    x: Math.max(0, Math.min(mapSize - 1, Math.floor((pan.x + vpEl.clientWidth / 2) / (zoom * cellRef.current)))),
    y: Math.max(0, Math.min(mapSize - 1, Math.floor((pan.y + vpEl.clientHeight / 2) / (zoom * cellRef.current)))),
  } : backendToWorld(data?.player, data?.origin, shownWorld);
  const regionName = getRegionName(centerTile, shownWorld);
  const displayName = user?.name || user?.email?.split('@')[0] || 'Explorer';
  const streak = stats?.streak ?? 0;
  // A streak from yesterday is still alive until midnight; it lights up once they study today.
  const streakLit = streak > 0 && stats?.studied_today !== false;
  const totalMapTiles = mapSize * mapSize;
  const chartProgressPct = totalMapTiles > 0
    ? Math.min(100, Math.round((unlockedNow.size / totalMapTiles) * 100))
    : 0;
  const sectionsLabel = (n) => (n <= 1 ? 'next section' : `~${n} sections`);
  const currentDiscovery = discoveries[0] || null;

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
            {!worldReady && (
              <div className="wm-loading wm-loading-full wm-loading-world" role="status">
                <Loader size={28} className="spinning" />
                <span>Charting {WORLDS[shownLevel]?.name || 'the coast'}…</span>
              </div>
            )}
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
              className={`wm-treasure-markers${zoom < 0.8 ? ' is-far' : ''}${revealing ? ' is-revealing' : ''}${worldReady ? '' : ' is-loading'}${focusSession ? ' is-hidden' : ''}`}
              aria-hidden={visibleChests.length === 0 && landmarkMarkers.length === 0}
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
              {landmarkMarkers.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`wm-landmark${it.discovered ? ' is-found' : ' is-rumour'}${it.kind === 'find' ? ' is-find' : ''}${markerItem?.id === it.id ? ' is-active' : ''}`}
                  data-tx={it.x}
                  data-ty={it.y}
                  aria-label={it.discovered ? it.name : `Undiscovered place: ${it.teaser}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMarker((m) => (m?.id === it.id ? null : it));
                  }}
                >
                  {it.discovered
                    ? <span className="wm-landmark__name">{it.name}</span>
                    : <span className="wm-landmark__q" aria-hidden>?</span>}
                </button>
              ))}
              {markerItem && (
                <div
                  className={`wm-landmark-card${markerItem.discovered ? '' : ' is-rumour'}`}
                  data-tx={markerItem.x}
                  data-ty={markerItem.y}
                  role="dialog"
                  aria-label={markerItem.discovered ? markerItem.name : 'Undiscovered place'}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button type="button" className="wm-landmark-card__close" aria-label="Close" onClick={() => setActiveMarker(null)}>
                    <X size={14} />
                  </button>
                  <span className="wm-landmark-card__kicker">
                    {markerItem.discovered ? (markerItem.kind === 'find' ? 'Find' : 'Landmark') : 'Undiscovered'}
                  </span>
                  {markerItem.discovered ? (
                    <>
                      <strong>{markerItem.name}</strong>
                      <p>{markerItem.lore}</p>
                    </>
                  ) : (
                    <>
                      <strong>{markerItem.teaser}</strong>
                      <p>
                        {markerItem.sectionsAway <= 1
                          ? 'Master one more section to lift the fog here.'
                          : `About ${markerItem.sectionsAway} mastered sections away.`}
                      </p>
                      {nextFind?.id === markerItem.id && (
                        <span className="wm-landmark-card__bar"><i style={{ width: `${Math.round((nextFind.progress || 0) * 100)}%` }} /></span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!focusSession && (
      <div className={`wm-ui ${mapFocus ? 'wm-focus-mode' : ''}`}>
        <AppTopBar current="map" onNavigate={onNavigate} hideNav={mapFocus} />

        <aside className="wm-left-stack">
          <div className="wm-profile-wrap" ref={profileRef}>
            <button
              type="button"
              className="wm-me wm-glass-card"
              data-tour="profile"
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileMenu((v) => !v);
              }}
              aria-expanded={showProfileMenu}
              aria-haspopup="menu"
              tabIndex={mapFocus ? -1 : 0}
              aria-hidden={mapFocus}
            >
              <span className="wm-me__head">
                <img src={mascot} alt="" className="wm-me__avatar" />
                <span className="wm-me__who">
                  <span className="wm-me__name">{displayName}</span>
                  <span className="wm-me__sub">Level {levelInfo.level} explorer</span>
                </span>
                <ChevronDown size={16} className="wm-me__chev" aria-hidden />
              </span>
              <span className="wm-me__xp">
                <span className="wm-me__ring" aria-hidden>
                  <svg viewBox="0 0 36 36">
                    <defs>
                      <linearGradient id="wm-amber" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#ffb503" />
                        <stop offset="1" stopColor="#ff7b02" />
                      </linearGradient>
                    </defs>
                    <circle className="wm-me__ring-track" cx="18" cy="18" r="15" pathLength="100" />
                    <circle className="wm-me__ring-fill" cx="18" cy="18" r="15" pathLength="100" style={{ strokeDashoffset: 100 - xpPct }} />
                  </svg>
                  <b>{levelInfo.level}</b>
                </span>
                <span className="wm-me__xp-text">
                  <span><b>{levelInfo.xp}</b> / {levelInfo.xpMax} XP</span>
                  <span className="wm-xp-bar"><span className="wm-xp-fill" style={{ width: `${xpPct}%` }} /></span>
                </span>
              </span>
              <span className={`wm-me__streak ${streakLit ? 'hot' : 'cold'}`}>
                <span className="wm-me__streak-head">
                  <Flame size={18} className={streakLit ? 'wm-streak-flame' : 'wm-streak-flame-dormant'} aria-hidden />
                  <span className="wm-me__streak-text">
                    {streak === 0 ? 'Study today to start a streak'
                      : streakLit ? <><b>{streak}-day</b> streak</>
                        : <><b>{streak}-day</b> streak · study today to keep it</>}
                  </span>
                  <span className="wm-me__streak-short" aria-hidden>{streak}</span>
                </span>
                {week.length > 0 && (
                  <span className="wm-week" aria-label="This week">
                    {week.map((day, i) => (
                      <span
                        key={day.label}
                        className={`wm-week__day wm-week__day--${day.status}${i === todayIdx ? ' wm-week__day--today' : ''}`}
                      >
                        {day.label.charAt(0)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>

            {showProfileMenu && !mapFocus && (
              <div className="wm-profile-menu" role="menu">
                <div className="wm-profile-menu-name">{displayName}</div>
                {onOpenControlCenter && (
                  <button
                    type="button"
                    className="wm-profile-menu-logout wm-profile-menu-admin"
                    role="menuitem"
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenControlCenter();
                    }}
                  >
                    <LayoutDashboard size={16} />
                    <span>Control Center</span>
                  </button>
                )}
                <button
                  type="button"
                  className="wm-profile-menu-logout"
                  role="menuitem"
                  onClick={() => {
                    setShowProfileMenu(false);
                    window.dispatchEvent(new CustomEvent('coast:start-tour'));
                  }}
                >
                  <HelpCircle size={16} />
                  <span>Take the tour</span>
                </button>
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

          <div className="wm-map-controls wm-glass-card" data-tour="map-controls">
            <button
              type="button"
              className={`wm-zoom-btn wm-focus-btn ${mapFocus ? 'active' : ''}`}
              onClick={() => {
                setMapFocus((v) => !v);
                setShowProfileMenu(false);
              }}
              aria-label={mapFocus ? 'Exit map focus' : 'Focus map'}
              aria-pressed={mapFocus}
              title={mapFocus ? 'Show cards' : 'Hide cards to explore the map'}
            >
              <Focus size={19} />
            </button>
            <button type="button" className="wm-zoom-btn" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
              <ZoomIn size={19} />
            </button>
            <button type="button" className="wm-zoom-btn" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
              <ZoomOut size={19} />
            </button>
          </div>
        </aside>

        {!mapFocus && (
        <div className="wm-right-stack">
          {revealChip && (
            <div className="wm-reveal-chip" role="status" key={revealChip.key}>
              <Sparkles size={14} aria-hidden /> +{revealChip.tiles.toLocaleString()} tiles charted
            </div>
          )}
          {nextFind && (
            <button
              type="button"
              className="wm-next-find-mobile wm-glass-card"
              onClick={() => {
                flyTo(nextFind.x, nextFind.y);
                setActiveMarker(nextFind);
              }}
            >
              <Sparkles size={14} aria-hidden />
              <span className="wm-next-find-mobile__text">{nextFind.teaser}</span>
              <em>{sectionsLabel(nextFind.sectionsAway)}</em>
              <span className="wm-next-find-mobile__bar" aria-hidden>
                <i style={{ width: `${Math.max(4, Math.round((nextFind.progress || 0) * 100))}%` }} />
              </span>
            </button>
          )}
          <section className="wm-next wm-glass-card" data-tour="next-step">
            <div className="wm-next__cover">
              <MapCover mapData={data} tiles={continueTiles} seed={continueLesson?.name || 'next-step'} maxTile={16} />
              <span className="wm-next__tag"><i aria-hidden />Your next step</span>
            </div>
            <div className="wm-next__body">
              {continueLesson ? (() => {
                const meta = continueLesson.meta || {};
                const total = meta.total_sections || meta.section_progress?.length || 0;
                const current = Math.min(meta.current_section || 0, Math.max(total - 1, 0));
                const done = (meta.section_progress || []).filter((p, i) => p?.mastered || i < (meta.current_section || 0)).length;
                return (
                  <>
                    <span className="wm-next__course">{formatFolderLabel(continueLesson.name)}</span>
                    <h2>{meta.current_section_title || `Section ${current + 1}`}</h2>
                    {total > 0 && (
                      <span className="wm-next__segs" aria-label={`Section ${current + 1} of ${total}`}>
                        {Array.from({ length: total }, (_, i) => {
                          const prog = meta.section_progress?.[i];
                          const cls = prog?.mastered || i < (meta.current_section || 0) ? 'done' : i === current ? 'now' : '';
                          return <i key={i} className={cls} />;
                        })}
                      </span>
                    )}
                    <span className="wm-next__meta">
                      <span>Section {current + 1} of {total}</span>
                      <span>{Math.max(total - done, 0)} to go</span>
                    </span>
                    <button type="button" className="wm-next__cta" onClick={() => onContinueLesson?.(continueLesson.name)}>
                      <Play size={17} /> {meta.last_studied_at || (meta.current_section || 0) > 0 ? 'Continue lesson' : 'Start lesson'}
                    </button>
                    <button type="button" className="wm-next__link" onClick={() => onOpenCourse?.(continueLesson.name)}>
                      See the whole roadmap
                    </button>
                  </>
                );
              })() : (
                <>
                  <h2>Your next discovery awaits</h2>
                  <p className="wm-next__empty">Turn your lecture slides into a lesson with Pedro.</p>
                  <button type="button" className="wm-next__cta" onClick={() => onOpenLessons?.()}>
                    <Plus size={17} /> Create a lesson
                  </button>
                </>
              )}
            </div>
          </section>

          <div className="wm-region wm-glass-card" data-tour="region">
            <div className="wm-region__head">
              <span className="wm-region__title">
                <span className="wm-region__name">{regionName}</span>
                <span className="wm-region__sub">
                  {WORLDS[shownLevel]?.short} · {chartProgressPct}% charted
                </span>
              </span>
              {mapLevel >= 2 && (
                <div className="wm-worlds" role="tablist" aria-label="Choose a world">
                  {Array.from({ length: mapLevel }, (_, i) => i + 1).map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      role="tab"
                      aria-selected={shownLevel === lv}
                      aria-label={`Level ${lv}: ${WORLDS[lv]?.name}`}
                      title={WORLDS[lv]?.name}
                      className={`wm-worlds__tab${shownLevel === lv ? ' is-active' : ''}`}
                      onClick={() => {
                        setActiveMarker(null);
                        setViewLevel(lv === mapLevel ? null : lv);
                      }}
                    >
                      {lv}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="wm-region__line" aria-hidden>
              <i style={{ width: `${chartProgressPct}%` }} />
            </span>
            {nextFind ? (
              <button
                type="button"
                className="wm-next-find"
                title={nextFind.teaser}
                onClick={() => {
                  flyTo(nextFind.x, nextFind.y);
                  setActiveMarker(nextFind);
                }}
              >
                <Sparkles size={13} aria-hidden />
                <span className="wm-next-find__teaser">{nextFind.teaser}</span>
                <span className="wm-next-find__eta">{sectionsLabel(nextFind.sectionsAway)}</span>
              </button>
            ) : shownLevel < mapLevel ? (
              <div className="wm-region__done"><Check size={13} aria-hidden /> Fully charted</div>
            ) : null}
          </div>

          <button
            type="button"
            className="wm-timer-launch wm-glass-card"
            onClick={() => setFocusSession(true)}
          >
            <span className="wm-timer-launch-icon">
              <Timer size={20} />
            </span>
            <span className="wm-timer-launch-text">
              <span className="wm-timer-launch-title">Study timer</span>
              <span className="wm-timer-launch-sub">Start a focus session</span>
            </span>
            <span className="wm-timer-launch-play">
              <Play size={15} />
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

      {currentDiscovery && !focusSession && !worldIntro && (
        <div className={`wm-discovery wm-glass-card${currentDiscovery.kind === 'chest' ? ' is-chest' : ''}`} role="status" key={currentDiscovery.id}>
          <span className="wm-discovery__kicker">
            <Sparkles size={13} aria-hidden />
            {currentDiscovery.kind === 'chest' ? 'Treasure spotted' : currentDiscovery.kind === 'find' ? 'New find' : 'New discovery'}
          </span>
          <h3>{currentDiscovery.name}</h3>
          <p>{currentDiscovery.lore || 'A treasure chest washed up here. Open it for bonus XP.'}</p>
          <div className="wm-discovery__actions">
            <button
              type="button"
              className="wm-discovery__go"
              onClick={() => {
                flyTo(currentDiscovery.x, currentDiscovery.y);
                if (currentDiscovery.kind !== 'chest') setActiveMarker(currentDiscovery);
                setDiscoveries((q) => q.slice(1));
              }}
            >
              Show me
            </button>
            <button type="button" className="wm-discovery__skip" onClick={() => setDiscoveries((q) => q.slice(1))}>
              {discoveries.length > 1 ? `Next (${discoveries.length - 1} more)` : 'Close'}
            </button>
          </div>
        </div>
      )}

      {worldIntro && (
        <WorldIntro
          level={worldIntro.level}
          onDone={() => {
            writeSeen(worldIntro.key, worldIntro.level);
            setWorldIntro(null);
            setViewLevel(null);
          }}
        />
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
          {formatTilesUnlockedLine(progressToast.map) && (
            <div className="wm-progress-toast-map">
              {formatTilesUnlockedLine(progressToast.map)}
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
