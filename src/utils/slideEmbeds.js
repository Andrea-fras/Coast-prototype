// Pedro shows a slide as ![what it shows](/api/source-pages/<source>/<page>). Now and then he writes
// the description and forgets the address, and the reply shows the raw "![…]". He cites a page
// just before he embeds it, so that citation says which slide was meant.
const PAGE_REF = /(?:#lesson-source|\/api\/source-pages)\/([A-Za-z0-9_-]+)\/(\d+)/g;
const LINKLESS = /!\[([^\]\n]{1,400})\](?!\s*\()/g;

function lastRef(text) {
  let last = null;
  for (const m of text.matchAll(PAGE_REF)) last = m;
  return last;
}

export function repairSlideEmbeds(text, { streaming = false } = {}) {
  if (!text || !text.includes('![')) return text;
  return text
    // "![…](#lesson-source/x/20)": the citation form used as an image address.
    .replace(/(!\[[^\]\n]{1,400}\])\s*\(#lesson-source\//g, '$1(/api/source-pages/')
    // "![…] (/api/source-pages/…)": a space breaks the image.
    .replace(/(!\[[^\]\n]{1,400}\])\s+(\(\/api\/source-pages\/)/g, '$1$2')
    .replace(LINKLESS, (match, alt, offset, whole) => {
      const rest = whole.slice(offset + match.length);
      if (streaming && !rest.trim()) return match; // its address may be the next thing to arrive
      const ref = lastRef(whole.slice(Math.max(0, offset - 2000), offset)) || [...rest.slice(0, 400).matchAll(PAGE_REF)][0];
      return ref ? `![${alt}](/api/source-pages/${ref[1]}/${ref[2]})` : '';
    });
}
