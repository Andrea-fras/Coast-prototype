import React, { useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

function extractKeywords(section) {
  const text = [
    section.title || '',
    section.content || '',
    ...(section.subsections || []).flatMap(s => [
      s.title || '',
      s.content || '',
      ...(s.bullets || []),
    ]),
  ].join(' ').toLowerCase();

  const stops = new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','shall','can',
    'of','in','to','for','with','on','at','by','from','as','into','through','during',
    'before','after','above','below','between','under','again','further','then','once',
    'and','but','or','nor','not','no','so','if','when','while','that','this','it','its',
    'they','them','their','we','our','you','your','he','she','his','her','what','which',
    'who','whom','how','where','why','each','every','all','both','few','more','most',
    'other','some','such','than','too','very','just','also','about','up','out','like',
    'same','different','new','old','first','last','long','great','little','own','right',
    'big','high','small','large','next','early','young','important','use','used','using',
    'one','two','three','way','make','made','think','know','get','got','see','take',
    'come','go','say','said','much','many','well','only','still','even','back','over',
    'must','need','want','because','here','there','example','called',
  ]);

  const words = text.match(/[a-z]{3,}/g) || [];
  const freq = {};
  words.forEach(w => {
    if (!stops.has(w)) freq[w] = (freq[w] || 0) + 1;
  });

  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w);
}

function buildGraph(sections, notebookColor) {
  const keywordsPerSection = sections.map(s => new Set(extractKeywords(s)));
  const cx = 0, cy = 0;
  const radius = Math.max(220, sections.length * 55);

  const nodes = sections.map((section, i) => {
    const angle = (2 * Math.PI * i) / sections.length - Math.PI / 2;
    return {
      id: `s-${i}`,
      data: {
        label: `${section.icon || ''} ${section.title}`.trim(),
        sectionIdx: i,
      },
      position: {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      },
      style: {
        background: notebookColor || '#6c5ce7',
        color: '#fff',
        border: 'none',
        borderRadius: '12px',
        padding: '10px 16px',
        fontSize: '13px',
        fontWeight: 600,
        fontFamily: "'Nunito', sans-serif",
        maxWidth: '180px',
        textAlign: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
        cursor: 'pointer',
      },
    };
  });

  const edges = [];
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const shared = [...keywordsPerSection[i]].filter(k => keywordsPerSection[j].has(k));
      if (shared.length >= 2) {
        const strength = Math.min(shared.length / 4, 1);
        edges.push({
          id: `e-${i}-${j}`,
          source: `s-${i}`,
          target: `s-${j}`,
          animated: shared.length >= 4,
          style: {
            stroke: notebookColor || '#6c5ce7',
            strokeWidth: 1.5 + strength * 2,
            opacity: 0.3 + strength * 0.5,
          },
          label: shared.slice(0, 2).join(', '),
          labelStyle: { fontSize: 10, fill: '#888' },
          labelBgStyle: { fill: 'rgba(255,255,255,0.85)', rx: 4 },
          labelBgPadding: [4, 3],
        });
      }
    }

    if (i < sections.length - 1) {
      const exists = edges.find(e =>
        (e.source === `s-${i}` && e.target === `s-${i + 1}`) ||
        (e.source === `s-${i + 1}` && e.target === `s-${i}`)
      );
      if (!exists) {
        edges.push({
          id: `seq-${i}`,
          source: `s-${i}`,
          target: `s-${i + 1}`,
          style: { stroke: '#ccc', strokeWidth: 1, strokeDasharray: '5 5' },
          type: 'straight',
        });
      }
    }
  }

  return { nodes, edges };
}

export default function ConceptMap({ notebook, onSectionClick, onClose }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(notebook.sections || [], notebook.color),
    [notebook]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_, node) => {
    if (node.data?.sectionIdx !== undefined && onSectionClick) {
      onSectionClick(node.data.sectionIdx);
    }
  }, [onSectionClick]);

  return (
    <div className="concept-map-overlay">
      <div className="concept-map-container">
        <div className="concept-map-header">
          <h3 className="concept-map-title">Concept Map: {notebook.title}</h3>
          <button className="concept-map-close" onClick={onClose}>✕</button>
        </div>
        <div className="concept-map-graph">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={2}
            attributionPosition="bottom-left"
          >
            <Background color="#e0e0e0" gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={notebook.color || '#6c5ce7'}
              maskColor="rgba(0,0,0,0.1)"
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        </div>
        <p className="concept-map-hint">
          Click a topic to jump to that section. Drag nodes to rearrange. Lines show shared concepts.
        </p>
      </div>
    </div>
  );
}
