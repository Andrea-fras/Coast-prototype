import { useState, useRef, useCallback } from 'react';

/** After this gap with no new tokens, hide the typing cursor. The reply is complete only when the
 *  server says so (its done event or the end of the stream): Pedro can pause mid-answer. */
export const STREAM_TOKEN_IDLE_MS = 650;

/** RAF-batched token buffer for SSE streaming (max ~60fps UI updates). */
export function useStreamBuffer() {
  const [streamingText, setStreamingText] = useState('');
  const [tokenIdle, setTokenIdle] = useState(false);
  const tokenBufferRef = useRef('');
  const rafIdRef = useRef(null);
  const fullTextRef = useRef('');
  const idleTimerRef = useRef(null);

  const resetIdleTimer = useCallback(() => {
    setTokenIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setTokenIdle(true);
      idleTimerRef.current = null;
    }, STREAM_TOKEN_IDLE_MS);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setTokenIdle(false);
  }, []);

  const flushBuffer = useCallback(() => {
    rafIdRef.current = null;
    if (!tokenBufferRef.current) return;
    fullTextRef.current += tokenBufferRef.current;
    tokenBufferRef.current = '';
    setStreamingText(fullTextRef.current);
  }, []);

  const appendToken = useCallback((token) => {
    if (!token) return;
    tokenBufferRef.current += token;
    resetIdleTimer();
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(flushBuffer);
    }
  }, [flushBuffer, resetIdleTimer]);

  const resetStream = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    tokenBufferRef.current = '';
    fullTextRef.current = '';
    clearIdleTimer();
    setStreamingText('');
  }, [clearIdleTimer]);

  const finalizeStream = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (tokenBufferRef.current) {
      fullTextRef.current += tokenBufferRef.current;
      tokenBufferRef.current = '';
    }
    const final = fullTextRef.current;
    fullTextRef.current = '';
    clearIdleTimer();
    setStreamingText('');
    return final;
  }, [clearIdleTimer]);

  return {
    streamingText,
    tokenIdle,
    appendToken,
    resetStream,
    finalizeStream,
  };
}
