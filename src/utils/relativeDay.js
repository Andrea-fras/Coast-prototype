const DAY = 86400000;

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "12 Mar". */
export function relativeDay(iso) {
  const time = Date.parse(iso || '');
  if (!time) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(time);
  then.setHours(0, 0, 0, 0);
  const days = Math.round((today - then) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 28) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
