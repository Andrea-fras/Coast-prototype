/** Read SSE across arbitrary network boundaries; success requires an explicit done event. */
export async function readSourceChatStream(response, onEvent) {
  if (!response.body) throw new Error('The answer stream was unavailable. Please retry.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;
  const consume = block => {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const event = JSON.parse(data);
    onEvent(event);
    if (event.error) throw new Error(event.error);
    if (event.done) done = true;
  };
  try {
    while (true) {
      const result = await reader.read();
      buffer = (buffer + decoder.decode(result.value, { stream: !result.done })).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
      if (result.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!done) throw new Error('The connection ended before Pedro finished. Your question is saved; please retry.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
