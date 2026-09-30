import { isSourceImage, imageUrl } from './sourceImageAccess';
import { hasNoteContent, sanitizeNotes } from './sanitizeNotes';
import notesHighlightCss from './notesHighlights.css?inline';
/** Shared helpers for rich lesson notes (contentEditable). */

export const NOTES_PANEL_WIDTH_KEY = 'coast_notes_panel_width';
export const NOTES_PANEL_MIN = 280;
export const NOTES_PANEL_DEFAULT = 340;

export function readStoredNotesWidth() {
  try {
    const n = parseInt(localStorage.getItem(NOTES_PANEL_WIDTH_KEY), 10);
    if (Number.isFinite(n) && n >= NOTES_PANEL_MIN) return n;
  } catch { /* ignore */ }
  return NOTES_PANEL_DEFAULT;
}

export function storeNotesWidth(px) {
  try {
    localStorage.setItem(NOTES_PANEL_WIDTH_KEY, String(Math.round(px)));
  } catch { /* ignore */ }
}

export function insertHtmlAtCursor(html) {
  if (!html) return;
  document.execCommand('insertHTML', false, sanitizeNotes(html));
}

export function insertImageFile(file, onInsert) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const src = reader.result;
    if (!src) return;
    const safeName = (file.name || 'image').replace(/"/g, '');
    insertHtmlAtCursor(
      `<img src="${src}" alt="${safeName}" class="notes-inline-img" />`,
    );
    onInsert?.();
  };
  reader.readAsDataURL(file);
}

export function extractImageFiles(dataTransfer) {
  if (!dataTransfer) return [];
  const files = [];
  if (dataTransfer.files?.length) {
    for (const f of dataTransfer.files) {
      if (f.type.startsWith('image/')) files.push(f);
    }
  }
  return files;
}

export function handleNotesDrop(e, onChange) {
  e.preventDefault();
  e.stopPropagation();

  const files = extractImageFiles(e.dataTransfer);
  if (files.length) {
    for (const file of files) insertImageFile(file, onChange);
    return true;
  }

  const html = e.dataTransfer.getData('text/html');
  if (html && /<img/i.test(html)) {
    insertHtmlAtCursor(html);
    onChange?.();
    return true;
  }

  const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (url && /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)/i.test(url.trim())) {
    insertHtmlAtCursor(`<img src="${url.trim()}" alt="" class="notes-inline-img" />`);
    onChange?.();
    return true;
  }

  return false;
}

export function handleNotesPaste(e, onChange) {
  e.preventDefault();
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          insertImageFile(file, onChange);
          return;
        }
      }
    }
  }
  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');
  insertHtmlAtCursor(html || escapeHtml(text).replace(/\n/g, '<br>'));
  onChange?.();
}

export function buildExportHtml({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 820px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.65; color: #111; }
  h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.25rem; margin-top: 2rem; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 0.35rem; }
  img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.75rem 0; }
  .lv-note-size-sm { font-size: 0.85rem; }
  .lv-note-size-lg { font-size: 1.15rem; }
  mark { border-radius: 2px; padding: 0 2px; }
  ${notesHighlightCss}
</style>
</head>
<body class="notes-content">
<h1>${escapeHtml(title)}</h1>
${sanitizeNotes(bodyHtml) || '<p><em>No notes yet.</em></p>'}
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function downloadNotesFile(filename, html, token) {
  // Export owned source images as actual image bytes, never an expiring access URL.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pending = new Map();
  for (const img of doc.querySelectorAll('img[src]')) {
    const src = imageUrl(img.getAttribute('src'));
    if (!isSourceImage(src)) continue;
    if (!pending.has(src)) pending.set(src, (async () => {
      const res = await fetch(src, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('An image could not be included. Your notes are safe; retry export.');
      const blob = await res.blob();
      if (!/^image\//.test(blob.type)) throw new Error('The source image is unavailable. Retry export.');
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the source image for export.'));
        reader.readAsDataURL(blob);
      });
    })());
    img.setAttribute('src', await pending.get(src));
  }
  html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildCombinedNotesHtml(notesList, folderTitles = {}) {
  const sections = notesList
    .filter((n) => hasNoteContent(n.content_html))
    .map((n) => {
      const title = folderTitles[n.folder_name] || n.folder_name;
      return `<h2>${escapeHtml(title)}</h2>\n${n.content_html}`;
    });
  return buildExportHtml({
    title: 'Coast — All Lesson Notes',
    bodyHtml: sections.join('\n<hr />\n') || '<p><em>No notes saved yet.</em></p>',
  });
}
