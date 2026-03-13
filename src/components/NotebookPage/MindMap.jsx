import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

const COLORS = [
  '#6c5ce7', '#00b894', '#e17055', '#0984e3', '#fdcb6e',
  '#e84393', '#00cec9', '#d63031', '#74b9ff', '#a29bfe',
];

function buildTree(notebook) {
  const sections = notebook.sections || [];
  const root = { id: 'root', label: notebook.title, icon: notebook.icon || '📖', children: [] };

  sections.forEach((sec, si) => {
    const sNode = {
      id: `s-${si}`, label: sec.title, icon: sec.icon || '',
      sectionIdx: si, color: COLORS[si % COLORS.length], children: [],
    };
    (sec.subsections || []).forEach((sub, subi) => {
      const subNode = {
        id: `s-${si}-sub-${subi}`, label: sub.title,
        sectionIdx: si, color: COLORS[si % COLORS.length], children: [],
      };
      (sub.bullets || []).slice(0, 3).forEach((b, bi) => {
        const t = (b || '').replace(/<[^>]+>/g, '').trim();
        if (t.length > 3) subNode.children.push({
          id: `s-${si}-sub-${subi}-b-${bi}`,
          label: t.length > 55 ? t.slice(0, 52) + '...' : t,
          sectionIdx: si, color: COLORS[si % COLORS.length], children: [],
        });
      });
      sNode.children.push(subNode);
    });
    root.children.push(sNode);
  });
  return root;
}

function layoutNodes(tree, expanded) {
  const nodes = [];
  const edges = [];

  nodes.push({ ...tree, x: 0, y: 0, depth: 0 });

  const n = tree.children.length;
  const sectionRadius = Math.max(280, n * 42);

  tree.children.forEach((section, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    const sx = sectionRadius * Math.cos(a);
    const sy = sectionRadius * Math.sin(a);
    nodes.push({ ...section, x: sx, y: sy, depth: 1 });
    edges.push({ from: 'root', to: section.id, color: section.color });

    if (!expanded[section.id]) return;
    const subs = section.children;
    const subR = 200;
    const spread = Math.max(0.4, Math.min(0.9, subs.length * 0.25));

    subs.forEach((sub, si) => {
      const sa = a + (si - (subs.length - 1) / 2) * spread;
      const subX = sx + subR * Math.cos(sa);
      const subY = sy + subR * Math.sin(sa);
      nodes.push({ ...sub, x: subX, y: subY, depth: 2 });
      edges.push({ from: section.id, to: sub.id, color: section.color });

      if (!expanded[sub.id]) return;
      const leaves = sub.children;
      const leafR = 150;
      const lSpread = Math.max(0.45, leaves.length * 0.35);
      leaves.forEach((leaf, li) => {
        const la = sa + (li - (leaves.length - 1) / 2) * lSpread;
        nodes.push({ ...leaf, x: subX + leafR * Math.cos(la), y: subY + leafR * Math.sin(la), depth: 3 });
        edges.push({ from: sub.id, to: leaf.id, color: sub.color });
      });
    });
  });

  return { nodes, edges };
}

export default function MindMap({ notebook, onSectionClick, onClose }) {
  const tree = useMemo(() => buildTree(notebook), [notebook]);
  const canvasRef = useRef(null);
  const dragState = useRef({ panning: false, sx: 0, sy: 0, tx: 0, ty: 0 });

  const [cam, setCam] = useState({ x: 0, y: 0, z: 0.8 });
  const [expanded, setExpanded] = useState({});

  const { nodes, edges } = useMemo(() => layoutNodes(tree, expanded), [tree, expanded]);
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCam({ x: r.width / 2, y: r.height / 2, z: 0.8 });
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      setCam(p => {
        const nz = Math.max(0.15, Math.min(3, p.z * f));
        const r = el.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        return { x: mx - (mx - p.x) * (nz / p.z), y: my - (my - p.y) * (nz / p.z), z: nz };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    if (e.target.closest('.mm-card')) return;
    dragState.current = { panning: true, sx: e.clientX, sy: e.clientY, tx: cam.x, ty: cam.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragState.current.panning) return;
    const d = dragState.current;
    setCam(p => ({ ...p, x: d.tx + (e.clientX - d.sx), y: d.ty + (e.clientY - d.sy) }));
  };
  const onPointerUp = () => { dragState.current.panning = false; };

  const resetView = () => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (r) setCam({ x: r.width / 2, y: r.height / 2, z: 0.8 });
    setExpanded({});
  };

  const expandAll = () => {
    const all = {};
    const walk = (n) => { if (n.children?.length) all[n.id] = true; n.children?.forEach(walk); };
    walk(tree);
    setExpanded(all);
  };

  const handleToggle = (e, nodeId) => {
    e.stopPropagation();
    setExpanded(p => ({ ...p, [nodeId]: !p[nodeId] }));
  };

  const handleNavigate = (e, node) => {
    e.stopPropagation();
    if (node.sectionIdx !== undefined) onSectionClick(node.sectionIdx);
  };

  return (
    <div className="mm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mm-container">
        <div className="mm-header">
          <div className="mm-header-left">
            <span className="mm-header-icon">🧠</span>
            <h3 className="mm-title">Mind Map</h3>
          </div>
          <div className="mm-header-right">
            <button className="mm-action-btn" onClick={expandAll} title="Expand all">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 5L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <button className="mm-action-btn" onClick={resetView} title="Reset view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7h4M3 5v4M9 7h4M7 1v4M7 9v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </button>
            <button className="mm-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div
          className="mm-canvas"
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <svg
            className="mm-edge-layer"
            style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}
          >
            {edges.map(e => {
              const a = nodeMap[e.from], b = nodeMap[e.to];
              if (!a || !b) return null;
              return (
                <line
                  key={e.from + '-' + e.to}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.color} strokeWidth={a.depth === 0 ? 2.5 : 1.5} strokeOpacity={0.3}
                />
              );
            })}
          </svg>

          <div
            className="mm-node-layer"
            style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}
          >
            {nodes.map(node => {
              const d = node.depth;
              const hasKids = node.children?.length > 0;
              const isOpen = !!expanded[node.id];
              const cls = d === 0 ? 'mm-card-root' : d === 1 ? 'mm-card-section' : d === 2 ? 'mm-card-sub' : 'mm-card-leaf';

              return (
                <div
                  key={node.id}
                  className={`mm-card ${cls} ${isOpen ? 'mm-expanded' : ''}`}
                  style={{ '--c': node.color || '#6c5ce7', left: node.x, top: node.y }}
                  onClick={(e) => handleNavigate(e, node)}
                >
                  {d <= 1 && node.icon && <span className="mm-card-icon">{node.icon}</span>}
                  <span className="mm-card-label">{node.label}</span>
                  {hasKids && d > 0 && (
                    <span className="mm-card-toggle" onClick={(e) => handleToggle(e, node.id)}>
                      {isOpen ? '−' : '+'}
                    </span>
                  )}
                  {hasKids && d > 0 && !isOpen && (
                    <span className="mm-card-count" onClick={(e) => handleToggle(e, node.id)}>
                      {node.children.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mm-zoom-btns">
            <button onClick={() => setCam(p => ({ ...p, z: Math.min(3, p.z * 1.25) }))}>+</button>
            <button onClick={() => setCam(p => ({ ...p, z: Math.max(0.15, p.z * 0.8) }))}>−</button>
          </div>
        </div>

        <div className="mm-footer">
          Scroll to zoom · Drag to pan · Click topics to expand
        </div>
      </div>
    </div>
  );
}
