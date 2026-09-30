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
