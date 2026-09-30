/** Uploads belong to the account/folder, not to a mounted page. No tokens or file bytes are persisted. */
export function createSourceUploadQueue({ baseUrl, fetchImpl = (...args) => fetch(...args),
  xhrFactory = () => new XMLHttpRequest(), storage, concurrency = 3 } = {}) {
  const folders = new Map();
  let active = 0;
  const keyFor = (userId, folder) => `${userId}:${encodeURIComponent(folder)}`;
  const terminal = item => ['complete', 'cancelled'].includes(item.status);
  const path = folder => `${baseUrl}/api/folders/${encodeURIComponent(folder)}`;
  function state(userId, folder) {
    const key = keyFor(userId, folder);
    if (!folders.has(key)) {
      let saved = [];
      try { saved = JSON.parse(storage?.getItem(`coast_uploads_${key}`) || '[]'); } catch { /* unavailable storage */ }
      saved = saved.map(e => ['registering', 'sending'].includes(e.status)
        ? { ...e, status: 'failed', error: 'Upload interrupted. Retry this file or remove it.' } : e);
      folders.set(key, { key, userId, folder, entries: saved, listeners: new Set(), snapshot: [], revision: 0, syncId: 0 });
      publish(folders.get(key));
    }
    return folders.get(key);
  }
  function publish(s) {
    s.snapshot = s.entries.filter(e => e.status !== 'cancelled').map(e => ({
      upload_id: e.upload_id, filename: e.filename, size_bytes: e.size_bytes,
      source_id: e.source_id, status: e.status, percent: e.percent, error: e.error,
      canRetry: !terminal(e) && !e.xhr && ['failed', 'queued'].includes(e.status),
      hasFile: !!e.file,
    }));
    try { storage?.setItem(`coast_uploads_${s.key}`, JSON.stringify(s.snapshot.filter(e => !terminal(e)))); } catch { /* server keeps registered files */ }
    for (const listener of s.listeners) listener(s.snapshot);
  }
  async function json(s, endpoint, options = {}) {
    let res;
    try {
      res = await fetchImpl(path(s.folder) + endpoint, {
        ...options, headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', ...options.headers },
      });
    } catch {
      throw new Error('No connection. Retry this file when you’re back online.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not update uploads. Try again.');
    return body;
  }
  async function sync(userId, folder, token) {
    const s = state(userId, folder); s.token = token;
    const revision = s.revision, syncId = ++s.syncId;
    const { uploads = [] } = await json(s, '/uploads');
    // A slow poll must not undo a transfer, retry or removal that finished after it began.
    if (revision !== s.revision || syncId !== s.syncId) return s.snapshot;
    for (const row of uploads) {
      let entry = s.entries.find(e => e.upload_id === row.upload_id);
      if (!entry) { entry = { ...row }; s.entries.push(entry); }
      else {
        const localStatus = entry.status;
        const localError = entry.error;
        Object.assign(entry, row);
        if (row.status === 'queued' && (entry.xhr || localStatus === 'failed')) {
          entry.status = localStatus; entry.error = localError;
        }
      }
      if (terminal(entry)) entry.file = null;
    }
    publish(s);
    return s.snapshot;
  }
  async function register(s, entries) {
    s.revision++;
    const body = await json(s, '/uploads', { method: 'POST', body: JSON.stringify({ files: entries.map(e => ({
      upload_id: e.upload_id, filename: e.filename, size_bytes: e.size_bytes,
    })) }) });
    for (const row of body.uploads) {
      const entry = entries.find(e => e.upload_id === row.upload_id);
      Object.assign(entry, row);
      if (terminal(entry)) entry.file = null;
    }
    s.revision++;
    publish(s); pump();
  }
  function send(s, entry) {
    s.revision++;
    active++;
    const xhr = xhrFactory(); entry.xhr = xhr; entry.status = 'sending'; entry.percent = 0; entry.error = null;
    publish(s);
    let settled = false;
    const finish = async (error, result) => {
      if (settled) return; settled = true;
      s.revision++;
      active--; entry.xhr = null;
      if (entry.status !== 'cancelled') {
        if (result) Object.assign(entry, { status: 'complete', source_id: result.source_id, file: null, error: null });
        else {
          entry.status = 'failed'; entry.error = error || 'Upload interrupted. Retry this file.';
          try { await sync(s.userId, s.folder, s.token); } catch { /* show the retryable error */ }
        }
      }
      publish(s); pump();
    };
    xhr.open('POST', path(s.folder) + '/upload');
    xhr.timeout = 15 * 60 * 1000;
    xhr.setRequestHeader('Authorization', `Bearer ${s.token}`);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) entry.percent = Math.round(100 * event.loaded / event.total);
      if (entry.percent === 100) entry.status = 'processing';
      publish(s);
    };
    xhr.upload.onload = () => { entry.status = 'processing'; publish(s); };
    xhr.onload = () => {
      let result = {};
      try { result = JSON.parse(xhr.responseText); } catch { /* invalid server response */ }
      if (xhr.status >= 200 && xhr.status < 300 && result.source_id) finish(null, result);
      else finish(typeof result.detail === 'string' ? result.detail : 'Upload failed. Retry this file.');
    };
    xhr.onerror = () => finish('Connection lost during upload. Retry this file.');
    xhr.ontimeout = () => finish('This upload is taking too long. Checking its status…');
    xhr.onabort = () => finish('Upload interrupted. Retry this file.');
    const data = new FormData(); data.append('file', entry.file); data.append('upload_id', entry.upload_id);
    try { xhr.send(data); } catch { finish('Could not send this file. Retry the upload.'); }
  }
  function pump() {
    for (const s of folders.values()) for (const e of s.entries) {
      if (active >= concurrency) return;
      if (e.status === 'queued' && e.file && !e.xhr && !e.removing) send(s, e);
    }
  }
  return {
    get: (userId, folder) => state(userId, folder).snapshot,
    subscribe(userId, folder, listener) {
      const s = state(userId, folder); s.listeners.add(listener); listener(s.snapshot);
      return () => s.listeners.delete(listener);
    },
    hasUnfinished(userId, folder) { return state(userId, folder).entries.some(e => !terminal(e)); },
    sync,
    async enqueue(userId, folder, token, files) {
      const s = state(userId, folder); s.token = token;
      const entries = Array.from(files, file => ({ upload_id: crypto.randomUUID(), filename: file.name,
        size_bytes: file.size, file, status: 'registering' }));
      s.entries.push(...entries); publish(s);
      try {
        const request = register(s, entries);
        for (const e of entries) e.registration = request;
        await request;
      }
      catch (error) { for (const e of entries) { e.status = 'failed'; e.error = error.message; } publish(s); }
    },
    async retry(userId, folder, token, id, file) {
      const s = state(userId, folder); s.token = token;
      const e = s.entries.find(item => item.upload_id === id);
      if (!e || e.xhr || terminal(e)) return;
      if (file && (file.name !== e.filename || file.size !== e.size_bytes)) throw new Error(`Select the original file: ${e.filename}`);
      e.file = file || e.file;
      if (!e.file) throw new Error(`Select ${e.filename} again to retry.`);
      e.status = 'registering'; e.error = null; publish(s);
      try { e.registration = register(s, [e]); await e.registration; }
      catch (error) { e.status = 'failed'; e.error = error.message; publish(s); }
    },
    async remove(userId, folder, token, id) {
      const s = state(userId, folder); s.token = token;
      const e = s.entries.find(item => item.upload_id === id);
      if (e) { e.removing = true; await e.registration?.catch(() => {}); }
      try { await json(s, '/uploads/' + encodeURIComponent(id), { method: 'DELETE' }); }
      catch (error) {
        // An unregistered file can still be removed locally; don't hide a completed server source.
        if (!error.message.includes('Upload not found')) {
          if (e) e.removing = false;
          throw error;
        }
      }
      s.revision++;
      if (e) { e.status = 'cancelled'; e.file = null; e.xhr?.abort(); }
      publish(s); pump();
    },
  };
}
