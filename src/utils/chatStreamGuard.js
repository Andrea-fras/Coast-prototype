/** Abort any in-flight chat stream and return a new generation id. */
export function beginChatStream(abortRef, generationRef) {
  if (abortRef.current) {
    abortRef.current.abort();
  }
  const controller = new AbortController();
  abortRef.current = controller;
  generationRef.current += 1;
  return { controller, streamId: generationRef.current };
}

export function isActiveStream(generationRef, streamId) {
  return generationRef.current === streamId;
}

export function endChatStream(abortRef, controller, generationRef, streamId) {
  if (abortRef.current === controller) {
    abortRef.current = null;
  }
  return generationRef.current === streamId;
}

/** Stop an in-flight Pedro response (user-initiated cancel). */
export function cancelChatStream(abortRef, generationRef) {
  generationRef.current += 1;
  if (abortRef.current) {
    abortRef.current.abort();
    abortRef.current = null;
  }
}
