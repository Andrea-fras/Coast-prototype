import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from '../src/context/authState';
import FolderView from '../src/components/NotebookPage/FolderView';
if (location.hostname !== '127.0.0.1') throw Error('Use the isolated 127.0.0.1 origin.');
const root = createRoot(document.getElementById('fixture'));
const realFetch = window.fetch.bind(window);
const folder = 'Introduction to Mechanics';
const sources = [{ type: 'document', source_id: 'newton', title: 'Lecture 2 · Forces and motion', source_type: 'pdf', page_count: 28, oma_ingest_status: 'INGESTING' }];
const citation = { id: 'S1', source_id: 'newton', title: sources[0].title, filename: 'Lecture 2.pdf', page: 12, page_count: 28, source_type: 'pdf', excerpt: 'The net force acting on a body equals its mass multiplied by its acceleration: F = ma.' };
const groupedCitations = [citation, { ...citation, id:'S6', page:14 }, { ...citation, id:'S7', page:17 }];
const coverage = { ready_sources: 1, total_sources: 1, semantic_ready: false, sources: [{ ready: true }] };
const saved = [];
let postCount = 0, roadmapCalls = 0, pageRequested = null, failNext = false, cid = 'sources_fixture';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, options = {}) => {
  const u = new URL(url, location.href), path = u.pathname;
  if (path.endsWith('/uploads')) return json({ uploads: [] });
  if (path.endsWith('/sources')) return json({ sources });
  if (path.endsWith('/oma-ingest')) return json({ oma_enabled: true, ready_for_roadmap: false, sources: [] });
  if (path.endsWith('/lesson')) return json({ has_outline: false, content_ready: false });
  if (path.endsWith('/outline')) { roadmapCalls++; return json({}); }
  if (path.endsWith('/ask-sources/status')) return json(coverage);
  if (path.endsWith('/ask-sources/conversations')) return json(saved.length ? [{ conversation_id: cid, title: saved[0].content }] : []);
  if (path.endsWith('/ask-sources/history')) return json(saved);
  if (path.includes('/pages/')) {
    pageRequested = Number(path.split('/').at(-1));
    const canvas = document.createElement('canvas'); canvas.width = 780; canvas.height = 1020;
    const c = canvas.getContext('2d'); c.fillStyle = '#fffdf7'; c.fillRect(0,0,780,1020); c.fillStyle = '#293f58';
    c.font = '18px sans-serif'; c.fillText('MECHANICS • LECTURE 2',60,65); c.font = 'bold 36px sans-serif'; c.fillText('Newton’s second law',60,155);
    c.font = '22px sans-serif'; c.fillText('Net force = mass × acceleration',60,215); c.font = '48px serif'; c.fillText('F = ma',290,350);
    c.fillStyle = '#eedbb4'; c.fillRect(225,480,210,120); c.strokeStyle = '#293f58'; c.lineWidth = 5; c.beginPath(); c.moveTo(435,540); c.lineTo(590,540); c.lineTo(566,520); c.moveTo(590,540); c.lineTo(566,560); c.stroke();
    c.fillStyle = '#293f58'; c.font = '24px sans-serif'; c.fillText('m = 2 kg',272,550); c.fillText('F = 6 N',480,510);
    c.font = '20px sans-serif'; c.fillText('a = 3 m/s²',278,660); c.fillText('Lecture notes • Page '+pageRequested,60,955);
    return new Response(await new Promise(resolve => canvas.toBlob(resolve)), { headers: { 'Content-Type': 'image/png' } });
  }
  if (path.endsWith('/ask-sources') && options.method === 'POST') {
    postCount++; const body = JSON.parse(options.body);
    if (!saved.some(m => m.request_id === body.request_id)) saved.push({ role:'user', content:body.message, request_id:body.request_id, status: 'failed' });
    if (failNext) { failNext = false; return new Response('data: {"error":"Temporary interruption. Please retry."}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }); }
    const reply = 'Newton’s second law connects **force, mass and acceleration**:\n\n$$F = ma$$\n\nFor a fixed mass, doubling the net force doubles the acceleration. The word *net* matters: add all the forces acting on the object first. [[S1]]\n\nFor example, a **2 kg** object accelerating at **3 m/s²** needs a net force of **6 N**. [[S1]]\n\n- **Knowledge:** structured and unstructured data **[[S6], [S7]]**.\n- Another comparison [[S6, S7]].';
    saved.at(-1).status = 'complete'; saved.push({ role:'pedro', content:reply, citations:groupedCitations, coverage });
    const events = [{ conversation_id:cid, stage:'Finding relevant pages' }, { citations:groupedCitations, coverage }, { token:reply.slice(0,90) }, { token:reply.slice(90) }, { done:true, reply, citations:groupedCitations, conversation_id:cid, coverage }];
    const bytes = new TextEncoder().encode(events.map(e => 'data: '+JSON.stringify(e)+'\n\n').join(''));
    return new Response(new ReadableStream({ async start(controller) {
      for (let start=0;start<bytes.length;start+=71) { controller.enqueue(bytes.slice(start,start+71)); await tick(2); } controller.close();
    } }), { headers:{'Content-Type':'text/event-stream'} });
  }
  return realFetch(url, options);
};
const tick = (ms = 70) => new Promise(resolve => setTimeout(resolve, ms));
const until = async (predicate) => { for (let i=0;i<80;i++) { if (predicate()) return; await tick(); } throw Error('Timed out waiting for UI'); };
let checkCount=0;
const check = (value, label) => { if (!value) throw Error(label); checkCount++; document.getElementById('results').textContent += '✓ '+label+'\n'; };
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
const mount = () => root.render(<AuthContext.Provider value={{ token:'fixture', user:{id:999993} }}><FolderView folderName={folder} isCurated={false}/></AuthContext.Provider>);
const type = text => { const input=document.querySelector('.ask-composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text); input.dispatchEvent(new Event('input',{bubbles:true})); };
try {
  mount(); await until(() => button('Ask sources')); button('Ask sources').click(); await until(() => document.querySelector('.ask-empty'));
  check(!!document.querySelector('.ask-empty'), 'Ask sources opens before a roadmap exists');
  check(document.querySelector('.ask-coverage').textContent.includes('1 of 1'), 'Search readiness is independent of OMA indexing');
  type('How does Newton’s second law connect force and acceleration?'); await tick(); document.querySelector('.ask-composer button').click();
  await until(() => document.querySelector('.ask-citations'));
  check(document.querySelectorAll('.ask-message').length===2, 'Question and streamed answer appear once');
  check(!!document.querySelector('.katex'), 'Equations render in the source answer');
  check([...document.querySelectorAll('.ask-inline-citation')].filter(b=>b.textContent==='6'||b.textContent==='7').length===4, 'Both grouped citation styles render individual source buttons');
  check(!document.querySelector('.ask-messages').textContent.includes('[[S'), 'Grouped markers never remain as raw bracket text');
  document.querySelector('.ask-inline-citation').click(); await until(() => document.querySelector('.source-preview img'));
  check(pageRequested===12, 'Citation opens exactly page 12');
  check(document.querySelectorAll('.ask-message').length===2, 'Source opens beside the retained conversation');
  document.querySelector('[aria-label="Next page"]').click(); await until(() => pageRequested===13);
  check(pageRequested===13, 'Source viewer navigates to the next original page');
  document.querySelector('[aria-label="Close source"]').click();
  [...document.querySelectorAll('.ask-inline-citation')].find(b=>b.textContent==='7').click();
  await until(()=>pageRequested===17);
  check(pageRequested===17, 'Second grouped reference opens its own page 17');
  document.querySelector('[aria-label="Close source"]').click();
  saved[1].content += '\n\nLegacy reference [[S999]].';
  root.render(null); await tick(); mount(); await until(() => button('Ask sources')); button('Ask sources').click(); await until(() => document.querySelector('.ask-citations'));
  check(postCount===1, 'Returning restores saved messages without generating again');
  check([...document.querySelectorAll('.ask-inline-citation')].some(b=>b.textContent==='7'), 'Grouped references remain clickable in older saved messages');
  check(document.querySelector('.ask-citation-unavailable')?.textContent==='Reference unavailable', 'Missing legacy destinations are labelled without inventing a link');
  failNext=true; type('Can you explain the same example again?'); await tick(); document.querySelector('.ask-composer button').click(); await until(() => button('Retry answer'));
  check(!!button('Retry answer'), 'Interrupted answers expose a retry action');
  button('Retry answer').click(); await until(() => document.querySelectorAll('.ask-citations').length===2);
  check(saved.filter(m=>m.role==='user').length===2, 'Retry reuses the saved question ID');
  check(document.querySelectorAll('.ask-message').length===4, 'Retry replaces the failed attempt without duplicate bubbles');
  button('Guided lesson').click(); await tick(); button('Ask sources').click(); await tick();
  check(postCount===3 && roadmapCalls===0, 'Switching modes preserves chat and never starts lesson generation');
  document.querySelector('[aria-label="New source conversation"]').click(); await tick();
  check(!!document.querySelector('.ask-empty'), 'New conversation has a clean workspace');
  const picker=document.querySelector('[aria-label="Source conversation"]'); picker.click(); await tick();
  check(picker.getAttribute('aria-expanded')==='true' && !!document.querySelector('.ask-conversation-popover'), 'Conversation picker opens the Coast-styled dropdown');
  const list=document.querySelector('[role="listbox"]');
  list.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})); await tick();
  list.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await until(() => document.querySelectorAll('.ask-citations').length===2);
  check(document.querySelectorAll('.ask-message').length===4, 'History selector restores the earlier conversation');
  picker.click(); await tick(); document.querySelector('[role="listbox"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await tick();
  check(picker.getAttribute('aria-expanded')==='false' && document.activeElement===picker, 'Escape closes the conversation list and restores focus');
  picker.click(); await tick(); document.querySelector('.ask-composer textarea').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); await tick();
  check(!document.querySelector('[role="listbox"]'), 'Clicking outside dismisses the conversation list');
  const composer=document.querySelector('.ask-composer textarea'); composer.focus(); await tick();
  check(getComputedStyle(composer).outlineStyle==='none' && getComputedStyle(composer).boxShadow==='none', 'Textbox focus has no yellow outline or focus box');
  if (location.search.includes('picker')) picker.click();
  else if (!location.search.includes('chat-only')) document.querySelector('.ask-inline-citation').click();
  document.getElementById('status').textContent=`All ${checkCount} Ask sources UI checks passed`;
} catch (e) { document.getElementById('status').textContent='FAILED: '+e.message; console.error(e); }
