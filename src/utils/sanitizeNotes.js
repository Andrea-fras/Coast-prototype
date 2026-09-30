import { mapNoteImages } from './sourceImageAccess';
import DOMPurify from 'dompurify';

export function sanitizeNotes(html) {
  return mapNoteImages(DOMPurify.sanitize(String(html || ''), {
    ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's',
      'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'mark', 'font', 'a', 'img', 'sub', 'sup'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'color', 'size', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  }));
}

export function hasNoteContent(html) {
  if (!html) return false;
  const template = document.createElement('template');
  template.innerHTML = sanitizeNotes(html);
  return Boolean(
    template.content.textContent.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
    || template.content.querySelector('img[src], hr'),
  );
}
