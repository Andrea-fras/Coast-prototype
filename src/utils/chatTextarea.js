const LINE_HEIGHT = 1.5;
const DEFAULT_ROWS = 3;
const MAX_HEIGHT_PX = 120;

/** How long after sending the user can unsend (cancel) their message. */
export const UNSEND_WINDOW_MS = 5000;

export function getChatTextareaMinHeightPx(fontSizePx = 14) {
  return Math.ceil(fontSizePx * LINE_HEIGHT * DEFAULT_ROWS);
}

/** Grow textarea from a 3-line minimum up to max height. */
export function resizeChatTextarea(el, minHeightPx) {
  if (!el) return;
  const min = minHeightPx ?? getChatTextareaMinHeightPx(
    parseFloat(getComputedStyle(el).fontSize) || 14,
  );
  el.style.height = 'auto';
  el.style.height = `${Math.max(min, Math.min(el.scrollHeight, MAX_HEIGHT_PX))}px`;
}
