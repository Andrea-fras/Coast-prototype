import { useState, useEffect, useRef } from 'react';

/** Rate-limit a fast-changing value (e.g. SSE tokens) for expensive renders like markdown. */
export function useThrottledValue(value, intervalMs) {
  const [throttled, setThrottled] = useState(value);
  const lastUpdateRef = useRef(0);
  const timeoutRef = useRef(null);
  const hadValueRef = useRef(false);

  useEffect(() => {
    if (intervalMs <= 0) {
      hadValueRef.current = false;
      return;
    }

    const isFirst = Boolean(value) && !hadValueRef.current;
    if (value) hadValueRef.current = true;

    const flush = () => {
      lastUpdateRef.current = Date.now();
      setThrottled(value);
    };

    if (isFirst) {
      timeoutRef.current = setTimeout(flush, 0);
      return () => clearTimeout(timeoutRef.current);
    }

    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= intervalMs) {
      timeoutRef.current = setTimeout(flush, 0);
      return () => clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(flush, intervalMs - elapsed);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, intervalMs]);

  return intervalMs <= 0 ? value : throttled;
}
