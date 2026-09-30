import { API_URL } from '../config';

export function isSourceImage(url) {
  try {
    const parsed = new URL(url, API_URL || window.location.origin);
    const api = new URL(API_URL || window.location.origin, window.location.origin);
    return parsed.origin === api.origin && /^\/api\/(source-images\/\d+|oma\/images\/[a-zA-Z0-9_]+|source-pages\/[a-zA-Z0-9_-]+\/\d+)$/.test(parsed.pathname);
  } catch { return false; }
}
export function imageUrl(url, access = '') {
  if (!isSourceImage(url)) return url;
  const parsed = new URL(url, API_URL || window.location.origin);
  parsed.searchParams.delete('access');
  if (access) parsed.searchParams.set('access', access);
  return parsed.href;
}
export function mapNoteImages(html, access = '') {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  for (const img of doc.querySelectorAll('img[src]')) {
    if (isSourceImage(img.getAttribute('src'))) img.setAttribute('src', imageUrl(img.getAttribute('src'), access));
  }
  return doc.body.innerHTML;
}
