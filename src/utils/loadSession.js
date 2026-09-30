// Bound both the request and response-body read; preserve credentials on outages.
export async function loadSession(url, token, { signal, timeoutMs = 10000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Session service unavailable');
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
