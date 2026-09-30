// Handle provider punctuation variants in both streamed and saved answers.
const idPattern = 'S\\d+';
const itemPattern = `\\[\\s*${idPattern}\\s*\\]`;
const groupPattern = [
  `\\[\\s*${itemPattern}(?:\\s*[,;]\\s*${itemPattern})*\\s*\\]`,
  `\\[\\[\\s*${idPattern}(?:\\s*[,;]\\s*${idPattern})*\\s*\\]\\]`,
  `\\[\\s*${idPattern}(?:\\s*[,;]\\s*${idPattern})*\\s*\\]`,
].join('|');

export function citationNodes(text) {
  const nodes = [];
  let offset = 0;
  for (const match of text.matchAll(new RegExp(groupPattern, 'g'))) {
    if (match.index > offset) nodes.push({ type: 'text', value: text.slice(offset, match.index) });
    const ids = [...new Set(match[0].match(/S\d+/g))];
    ids.forEach((id, index) => {
      if (index) nodes.push({ type: 'text', value: ' ' });
      nodes.push({ type: 'link', url: `#source-${id}`, children: [{ type: 'text', value: id.slice(1) }] });
    });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) nodes.push({ type: 'text', value: text.slice(offset) });
  return nodes;
}

export default function remarkSourceCitations() {
  // Never turn a code example, equation, image label, or existing link into a button.
  const literal = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'link', 'linkReference', 'image', 'imageReference']);
  return function transform(node) {
    if (literal.has(node.type) || !node.children) return;
    node.children = node.children.flatMap(child => {
      if (child.type === 'text') return citationNodes(child.value);
      transform(child);
      return [child];
    });
  };
}
