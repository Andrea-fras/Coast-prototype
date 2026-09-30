import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from '../src/context/authState';
import FolderView from '../src/components/NotebookPage/FolderView';

// Mock transport only. The actual FolderView, upload queue, and prepare orchestrator run unchanged.
if (location.hostname !== '127.0.0.1') throw Error('Run this isolated fixture at 127.0.0.1, not the signed-in localhost origin.');
const uid = 999991, folder = 'Lecture upload check';
const priorUser = localStorage.getItem('coast_user');
const restoreUser = () => {
  if (priorUser && JSON.parse(priorUser).id !== uid) localStorage.setItem('coast_user', priorUser);
  else localStorage.removeItem('coast_user');
};
localStorage.setItem('coast_user', JSON.stringify({ id: uid }));
for (const key of Object.keys(sessionStorage)) if (key.includes(String(uid))) sessionStorage.removeItem(key);
const root = createRoot(document.getElementById('fixture'));
const sources = [], records = new Map(), transfers = [];
let outlinePosts = 0, outlineReady = false, sectionReady = false, sourcesChanged = 0, releaseOutline;
const outlineGate = new Promise(resolve => { releaseOutline = resolve; });
const sections = [{ title: 'Stacks and queues', learning_objectives: ['Compare stack and queue ordering'], key_topics: ['LIFO', 'FIFO'] }];
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
window.fetch = async (url, options = {}) => {
  const path = new URL(url, location.href).pathname;
  if (path.endsWith('/uploads')) {
    if (options.method === 'POST') {
      const rows = JSON.parse(options.body).files.map(f => ({ ...f, status: 'queued' }));
      rows.forEach(r => records.set(r.upload_id, r)); return response({ uploads: rows });
    }
    return response({ uploads: [...records.values()] });
  }
  if (path.endsWith('/sources')) return response({ sources });
  if (path.endsWith('/embed')) return response({});
  if (path.endsWith('/oma-ingest')) return response({ oma_enabled: true, ready_for_roadmap: true, sources: [] });
  if (path.endsWith('/outline')) {
    outlinePosts++; await outlineGate; outlineReady = true;
    return response({ sections, total_sections: 1, outline_source: 'oma_progressive' });
  }
  if (path.endsWith('/lesson')) return response({ has_outline: outlineReady, content_ready: sectionReady,
    sections: outlineReady ? sections : [], total_sections: 1, current_section: 0,
    section_preparation: { ready_pages: sectionReady ? 8 : 2, total_pages: 8 } });
  throw Error('Unexpected fixture request: ' + path);
};
class UploadXHR {
  upload = {};
  open() {} setRequestHeader() {}
  send(body) { this.id = body.get('upload_id'); records.get(this.id).status = 'processing'; transfers.push(this); }
  abort() { this.onabort?.(); }
  complete() {
    const row = records.get(this.id), id = 'src_' + sources.length;
    sources.push({ type: 'document', source_id: id, title: row.filename.replace('.pdf', ''),
      source_type: 'pdf', page_count: 20, oma_ingest_status: 'COMPLETE' });
    Object.assign(row, { status: 'complete', source_id: id });
    this.status = 200; this.responseText = JSON.stringify({ source_id: id }); this.onload();
  }
}
window.XMLHttpRequest = UploadXHR;
const tick = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
const check = (value, label) => {
  if (!value) throw Error(label);
  document.getElementById('results').textContent += '✓ ' + label + '\n';
};
const mount = () => root.render(<AuthContext.Provider value={{ token: 'fixture-token', user: { id: uid } }}>
  <FolderView folderName={folder} isCurated={false} onSourcesChanged={() => { sourcesChanged++; }} />
</AuthContext.Provider>);
const generate = () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Generate roadmap'));
try {
  mount(); await tick(200);
  const dt = new DataTransfer();
  for (let i = 1; i <= 5; i++) dt.items.add(new File(['fixture'], `Lecture ${i}.pdf`, { type: 'application/pdf' }));
  const input = document.querySelector('input[type="file"][multiple]'); input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  check(document.querySelectorAll('.fv-v2-upload-pending').length === 5, 'All five selected files are visible immediately');
  for (let i = 0; i < 4; i++) { transfers[i].complete(); await tick(); }
  root.render(null); await tick(); mount(); await tick(250);
  check(document.querySelectorAll('.fv-v2-upload-pending').length === 1, 'Leaving and returning preserves the fifth pending file');
  check(generate()?.disabled, 'Generate is disabled until every selected upload finishes');
  check(sourcesChanged === 0, 'Upload completion does not trigger the parent remount callback');
  transfers[4].complete(); await tick(250);
  check(!generate()?.disabled, 'Generate becomes available once all five sources are saved');
  generate().click(); await tick(200);
  check(outlinePosts === 1, 'One roadmap request is submitted');
  let bar = document.querySelector('[role="progressbar"]');
  check(bar && !bar.hasAttribute('aria-valuenow'), 'Roadmap generation has no invented percentage');
  root.render(null); await tick(); mount(); await tick(400);
  check(document.querySelector('.fv-v2-prepare-status')?.textContent.includes('Designing'), 'Returning during generation restores its current stage');
  check(outlinePosts === 1, 'Returning does not generate a second roadmap');
  document.getElementById('status').textContent = 'Upload + navigation checks passed · Roadmap stage';
  const next = document.getElementById('next'); next.hidden = false;
  next.onclick = async () => {
    try {
      if (!outlineReady) {
        releaseOutline(); await tick(250);
        bar = document.querySelector('[role="progressbar"]');
        check(bar?.getAttribute('aria-valuenow') === '25', 'First-section progress reflects 2 of 8 prepared pages');
        document.getElementById('status').textContent = 'First section preparing';
        next.textContent = 'Make first section ready';
      } else {
        sectionReady = true; await tick(2000);
        check([...document.querySelectorAll('button')].some(button => button.textContent === 'Start lesson' && !button.disabled), 'A ready first section exposes an enabled Start lesson button');
        document.getElementById('status').textContent = 'All 11 upload UI checks passed'; next.hidden = true;
        restoreUser();
      }
    } catch (error) { document.getElementById('status').textContent = 'FAILED: ' + error.message; console.error(error); }
  };
  setTimeout(() => next.onclick(), 1200);
  setTimeout(() => next.onclick(), 3600);
} catch (error) {
  document.getElementById('status').textContent = 'FAILED: ' + error.message; console.error(error);
}
