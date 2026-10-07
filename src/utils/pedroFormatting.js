// Pedro writes math as \( … \) inline and \[ … \] displayed; a $ is always a currency sign. The
// renderer reads math only between double dollars (single-dollar math is switched off, so a price
// can never become a formula), so formatPedroForDisplay writes Pedro's formulas that way. It also
// quotes a callout written without its > markers, so "[!QUESTION] Practice" never shows as raw
// text (the server does the same before saving: pedro_context.repair_formatting).

const CALLOUT_LINE = /^\[![A-Za-z-]+\]/;
const CALLOUT_MARK = /\[!(?:question|key|tip|mistake|example|note)\]/i;
const CODE = /(^```[\s\S]*?^```|`[^`\n]+`)/m; // code keeps its text
const DISPLAY = /\\\[([\s\S]+?)\\\]/g;
const INLINE = /\\\(((?:(?!\n[ \t>]*\n)[\s\S])+?)\\\)/g; // never across a blank line

function quoteCallouts(text) {
  const lines = [];
  for (const line of text.split('\n')) { // "Nice work. [!QUESTION] Practice …": the box starts on its own line
    const m = CALLOUT_MARK.exec(line);
    if (m && line.slice(0, m.index).replace(/[ >\t]/g, '')) {
      lines.push(line.slice(0, m.index).trimEnd(), '', line.slice(m.index));
    } else {
      lines.push(line);
    }
  }
  let k = 0;
  while (k < lines.length) {
    if (!CALLOUT_LINE.test(lines[k])) { k += 1; continue; }
    const question = lines[k].slice(2).toLowerCase().startsWith('question'); // a question closes the reply; it may hold blank lines
    let j = k;
    for (; j < lines.length; j += 1) {
      const line = lines[j];
      if (j > k && (/^#{1,6}\s|^\[[A-Z_]{4,}/.test(line) || CALLOUT_LINE.test(line)
        || line.trimStart().startsWith('>') || (!question && !line.trim()))) break; // a heading, a hidden tag, another box, or a blank line
      lines[j] = line.trim() ? `> ${line}` : '>';
    }
    k = j;
  }
  return lines.join('\n');
}

const tex = (s) => s.replace(/µ/g, '\\mu{}'); // KaTeX has no µ glyph in math

function mathForRenderer(text) {
  return text
    .replace(DISPLAY, (match, body, at, whole) => {
      const lineStart = whole.lastIndexOf('\n', at - 1) + 1;
      const lead = whole.slice(lineStart, at); // "> " inside a callout
      const lineEnd = whole.indexOf('\n', at + match.length);
      const rest = whole.slice(at + match.length, lineEnd === -1 ? undefined : lineEnd);
      if (/[^ \t>]/.test(lead) || rest.trim()) return `$$${tex(body.trim())}$$`; // inside a sentence: inline
      if (body.includes('\n')) return `$$${tex(body)}$$`; // "\[" and "\]" on lines of their own
      return `$$\n${lead}${tex(body.trim())}\n${lead}$$`;
    })
    .replace(INLINE, (_, body) => `$$${tex(body.trim())}$$`);
}

// A last line of only "=" or "-" would underline the line above it into a heading; until the
// next character arrives it can't be told from the start of a highlight or a list item.
const UNFINISHED_LINE = /\n[ \t>]*[=-]+[ \t]*$/;

/** Pedro's reply as the renderer reads it. While streaming, a formula still being written is held
 *  back until it closes, so raw LaTeX never flashes up, and so is a line that has only just begun. */
export function formatPedroForDisplay(text, { streaming = false } = {}) {
  if (!text) return text;
  const quoted = text.includes('[!') ? quoteCallouts(text) : text;
  const parts = quoted.split(CODE);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = mathForRenderer(parts[i]);
    if (streaming) {
      const open = parts[i].search(/\\[([]/);
      if (open !== -1) return (parts.slice(0, i).join('') + parts[i].slice(0, open)).replace(UNFINISHED_LINE, '');
    }
  }
  return streaming ? parts.join('').replace(UNFINISHED_LINE, '') : parts.join('');
}
