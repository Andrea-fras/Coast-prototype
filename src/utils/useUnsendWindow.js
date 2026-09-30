import { useState, useRef, useCallback, useEffect } from 'react';
import { UNSEND_WINDOW_MS } from './chatTextarea';

/** Brief window after the user sends where they can unsend their message. */
export function useUnsendWindow() {
  const [canUnsend, setCanUnsend] = useState(false);
  const timerRef = useRef(null);

  const clearUnsendWindow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCanUnsend(false);
  }, []);

  const startUnsendWindow = useCallback(() => {
    clearUnsendWindow();
    setCanUnsend(true);
    timerRef.current = setTimeout(() => {
      setCanUnsend(false);
      timerRef.current = null;
    }, UNSEND_WINDOW_MS);
  }, [clearUnsendWindow]);

  useEffect(() => () => clearUnsendWindow(), [clearUnsendWindow]);

  return { canUnsend, startUnsendWindow, clearUnsendWindow };
}
