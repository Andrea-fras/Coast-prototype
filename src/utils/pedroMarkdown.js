// Pedro's markdown extensions, applied to the markdown tree before rendering.
//
//   ==key phrase==                 → <mark>: the highlighter
//   > [!QUESTION] Based on p. 8    → a callout card; the words after the marker are its title
//   > How many bridges …?
//
// Callout kinds: question, key, tip, mistake, example, note (plus common synonyms).
// While a reply streams, an unclosed ==… is shown as a highlight in progress, and a
// half-typed [!KIND marker is hidden until it is complete.

const KINDS = {
  question: 'question', q: 'question', try: 'question', practice: 'question', 'your-turn': 'question',
  key: 'key', important: 'key', definition: 'key', rule: 'key', remember: 'key', summary: 'key', takeaway: 'key',
  tip: 'tip', hint: 'tip',
  mistake: 'mistake', warning: 'mistake', caution: 'mistake', watch: 'mistake', careful: 'mistake',
  example: 'example', 'worked-example': 'example',
  note: 'note', info: 'note', slide: 'note', aside: 'note',
};

const MARKER = /^\s*\[!([a-z-]+)\][ \t]*([^\n]*)(?:\n|$)/i;
const PARTIAL_MARKER = /^\s*\[!?[a-z-]*\]?$/i;
const NO_TEXT = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html']);

function markNode(children) {
  return { type: 'mark', children, data: { hName: 'mark', hProperties: { className: ['pedro-hl'] } } };
}

// "==" opens only before a non-space and closes only after one, so "a == b" stays text.
// At the edge of a text node the neighbour decides: "==**directed** …==" opens before bold.
const OPENS = (text, i, next) => text.startsWith('==', i)
  && (i + 2 < text.length ? !/\s|=/.test(text[i + 2]) : Boolean(next) && next.type !== 'text');
const CLOSES = (text, i, prev) => text.startsWith('==', i)
  && (i > 0 ? !/\s|=/.test(text[i - 1]) : Boolean(prev) && prev.type !== 'text');

function highlightChildren(children) {
  const out = [];
  let mark = null; // the open highlight, collecting nodes until its closing ==
  const push = (node) => (mark ? mark.children : out).push(node);
  children.forEach((child, index) => {
    const prev = children[index - 1];
    const next = children[index + 1];
    if (child.type !== 'text') {
      if (child.children && !NO_TEXT.has(child.type)) child.children = highlightChildren(child.children);
      push(child);
      return;
    }
    const text = child.value;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (!mark && OPENS(text, i, next)) {
        if (i > start) push({ type: 'text', value: text.slice(start, i) });
        mark = markNode([]);
        out.push(mark);
        start = i + 2;
        i += 1;
      } else if (mark && CLOSES(text, i, prev)) {
        if (i > start) push({ type: 'text', value: text.slice(start, i) });
        mark = null;
        start = i + 2;
        i += 1;
      }
    }
    if (start < text.length) push({ type: 'text', value: text.slice(start) });
  });
  return out; // an unclosed highlight stays open to the end: it is still being written
}

function calloutKind(node) {
  const para = node.children?.[0];
  const first = para?.type === 'paragraph' ? para.children?.[0] : null;
  if (!first || first.type !== 'text') return null;
  const m = MARKER.exec(first.value);
  if (!m) {
    if (PARTIAL_MARKER.test(first.value) && para.children.length === 1) return { partial: true, para };
    return null;
  }
  const kind = KINDS[m[1].toLowerCase()] || 'note';
  first.value = first.value.slice(m[0].length);
  if (!first.value) para.children.shift();
  if (!para.children.length) node.children.shift();
  return { kind, title: m[2].trim() };
}

function visit(node) {
  if (!node.children || NO_TEXT.has(node.type)) return;
  if (node.type === 'blockquote') {
    const callout = calloutKind(node);
    if (callout?.partial) {
      node.children.shift(); // "[!QUES" mid-stream: hide it until the marker is complete
    } else if (callout) {
      node.data = {
        hName: 'aside',
        hProperties: { className: ['pedro-callout', `pedro-callout--${callout.kind}`],
          dataKind: callout.kind, dataTitle: callout.title },
      };
    }
  }
  if (['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete', 'link'].includes(node.type)) {
    node.children = highlightChildren(node.children);
    return;
  }
  node.children.forEach(visit);
}

export default function remarkPedro() {
  return (tree) => visit(tree);
}

export const CALLOUT_KINDS = ['question', 'key', 'tip', 'mistake', 'example', 'note'];
