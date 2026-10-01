import { WIDGETS } from './registry';

/** "rocket {\"scene\": \"flight\"}" → { id: 'rocket', params: { scene: 'flight' } }, or null. */
export function parseWidget(source) {
  const m = /^\s*([a-z][\w-]*)\s*(\{[\s\S]*\})?\s*$/i.exec(source || '');
  if (!m) return null;
  let params = {};
  if (m[2]) {
    try { params = JSON.parse(m[2]); } catch { params = {}; }
  }
  return { id: m[1].toLowerCase(), params: params && typeof params === 'object' ? params : {} };
}

// Pedro places a lab with a ```widget block. Now and then he drops the backticks, and the student
// would see "widget neuron {...}" as text instead of the lab. A bare "widget" line followed by a
// known lab gets its fences back. (The server repairs what it saves the same way:
// pedro_context.repair_widget_blocks.)
const BARE_WIDGET = new RegExp(
  `^[ \\t]*widget(?:[ \\t]*\\n(?:[ \\t]*\\n)?|[ \\t]+)[ \\t]*(${Object.keys(WIDGETS).join('|')})\\b[ \\t]*(\\{[^\\n]*\\})?[ \\t]*$`, 'gm');

export function repairWidgetBlocks(text) {
  if (!text || !text.includes('widget')) return text;
  return text.replace(BARE_WIDGET, (_, id, params) => `\`\`\`widget\n${id}${params ? ` ${params}` : ''}\n\`\`\``);
}
