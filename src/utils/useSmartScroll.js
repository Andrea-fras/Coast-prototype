import { useEffect, useRef, useCallback, useState } from 'react';

const BOTTOM_THRESHOLD = 80;

function isNearBottom(el) {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance < BOTTOM_THRESHOLD && el.scrollHeight > el.clientHeight;
}

/**
 * Lesson: document-style — start at top, no auto-scroll; "jump to latest" when scrolled up.
 * Messenger: bottom-pinned; follows stream while user is near bottom.
 */
export function useSmartScroll(mode, resetDeps = [], streamTick = 0) {
  const scrollRef = useRef(null);
  const isAtBottomRef = useRef(mode === 'messenger');
  const modeRef = useRef(mode);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = isNearBottom(el);
    isAtBottomRef.current = nearBottom;
    if (nearBottom) setHasNewMessage(false);
  }, []);

  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = true;
    setHasNewMessage(false);
    el.scrollTop = el.scrollHeight;
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    isAtBottomRef.current = true;
    setHasNewMessage(false);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (mode === 'lesson') {
      el.scrollTop = 0;
      isAtBottomRef.current = false;
    } else {
      el.scrollTop = el.scrollHeight;
      isAtBottomRef.current = true;
    }
    const frame = requestAnimationFrame(() => setHasNewMessage(false));
    return () => cancelAnimationFrame(frame);
  }, resetDeps);

  useEffect(() => {
    if (!streamTick) return;
    const el = scrollRef.current;
    if (!el) return;

    if (modeRef.current === 'messenger') {
      if (isAtBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    } else if (!isAtBottomRef.current) {
      const frame = requestAnimationFrame(() => setHasNewMessage(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [streamTick]);

  return { scrollRef, handleScroll, hasNewMessage, jumpToLatest, pinToBottom };
}
