const PREFIX = '#lesson-source/';
const TARGET = /^#lesson-source\/([a-zA-Z0-9_-]+)\/(\d+)$/;

export function resolveLessonCitation(href, sources = []) {
  const match = TARGET.exec(href || '');
  if (!match) return null;
  const source = sources.find(s => s.source_id === match[1]);
  const page = Number(match[2]);
  if (!source || !['pdf', 'pptx'].includes(source.source_type)
    || !Number.isSafeInteger(page) || page < 1 || page > source.page_count) return null;
  return { ...source, page };
}

export function isLessonCitation(href) {
  return typeof href === 'string' && href.startsWith(PREFIX);
}

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const inlineTypes = new Set(['text', 'strong', 'emphasis', 'delete']);
const plain = node => node.type === 'text' ? node.value : (node.children || []).map(plain).join('');
const isInlineText = node => inlineTypes.has(node.type)
  && (!node.children || node.children.every(isInlineText));

function sliceInline(nodes, start, end) {
  let offset = 0;
  const result = [];
  for (const node of nodes) {
    const length = plain(node).length;
    const from = Math.max(0, start - offset), to = Math.min(length, end - offset);
    if (from < to) {
      result.push(node.type === 'text' ? { type: 'text', value: node.value.slice(from, to) }
        : { ...node, children: sliceInline(node.children, from, to) });
    }
    offset += length;
  }
  return result;
}

// Old conversations have prose citations, sometimes with a bold/italic title.
// Match only a unique exact title/filename plus a valid page. Never fuzzy-match.
export default function remarkLessonCitations({ sources = [] } = {}) {
  const aliases = new Map();
  for (const source of sources) {
    for (const title of [source.title, source.filename]) {
      for (const alias of [title, title?.replace(/\.(pdf|pptx)$/i, '')]) {
        if (!alias?.trim()) continue;
        const key = alias.trim().toLowerCase();
        if (!aliases.has(key)) aliases.set(key, new Map());
        aliases.get(key).set(source.source_id, source);
      }
    }
  }
  const patterns = [...aliases].filter(([, candidates]) => candidates.size === 1)
    .sort(([a], [b]) => b.length - a.length)
    .map(([alias, candidates]) => ({
      source: [...candidates.values()][0],
      pattern: new RegExp('(?<![\\p{L}\\p{N}_])' + escapeRegex(alias).replace(/\s+/g, '\\s+')
        + '[”’"\']?\\s*[,;:·|]?\\s+(?:pp?\\.?|pages?|slides?)\\s*(\\d+)'
        + '(?:\\s*[-–]\\s*(\\d+))?(?!\\d|\\.\\d)', 'giu'),
    }));

  function linkRun(nodes) {
    const text = nodes.map(plain).join('');
    const matches = [];
    for (const { source, pattern } of patterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const start = match.index, end = start + match[0].length;
        const page = Number(match[1]), lastPage = Number(match[2] || match[1]);
        const url = PREFIX + source.source_id + '/' + page;
        if (!resolveLessonCitation(url, sources) || lastPage < page || lastPage > source.page_count
          || matches.some(m => start < m.end && end > m.start)) continue;
        matches.push({ start, end, url });
      }
    }
    if (!matches.length) return nodes;
    const result = [];
    let offset = 0;
    for (const match of matches.sort((a, b) => a.start - b.start)) {
      result.push(...sliceInline(nodes, offset, match.start),
        { type: 'link', url: match.url, children: sliceInline(nodes, match.start, match.end) });
      offset = match.end;
    }
    return [...result, ...sliceInline(nodes, offset, text.length)];
  }

  return tree => {
    function walk(node) {
      // Existing links, diagrams, maths and code must not become nested citations.
      if (!node.children || ['link', 'linkReference', 'image', 'code', 'inlineCode', 'math', 'inlineMath'].includes(node.type)) return;
      const children = [];
      let run = [];
      const flush = () => { children.push(...linkRun(run)); run = []; };
      for (const child of node.children) {
        if (isInlineText(child)) run.push(child);
        else { flush(); walk(child); children.push(child); }
      }
      flush();
      node.children = children;
    }
    if (patterns.length) walk(tree);
  };
}
