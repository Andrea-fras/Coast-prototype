import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from '../src/context/authState';
import NotebookPage from '../src/components/NotebookPage/NotebookPage';
import RichNotesEditor from '../src/components/NotebookPage/RichNotesEditor';
import { hasNoteContent, sanitizeNotes } from '../src/utils/sanitizeNotes';
import { buildExportHtml } from '../src/utils/notesEditor';

// Exercise the real library/editor with isolated student records; no live API writes.
if (location.hostname !== '127.0.0.1') throw Error('Use the isolated 127.0.0.1 origin.');
const root = createRoot(document.getElementById('fixture'));
const id = 999994;
const records = new Map();
const writes = [];
let folders = [], lastHtml = '', count = 0;
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, options = {}) => {
  const path = new URL(url, location.href).pathname;
  if (path === '/api/notebooks/folders') return json(folders);
  if (path === '/api/lessons/summary') return json({});
  if (path === '/api/lesson-notes/all') return json({ notes: [...records].map(([folder_name, content_html]) => ({ folder_name, content_html })) });
  const match = path.match(/\/api\/folders\/([^/]+)\/lesson-notes$/);
  if (match) {
    const folder = decodeURIComponent(match[1]);
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      writes.push({ folder, ...body }); records.set(folder, body.content_html);
    }
    return json({ content_html: records.get(folder) || '', revision: 'fixture-' + writes.length });
  }
  throw Error('Unexpected fixture request: ' + path);
};
const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  throw Error('Timed out waiting for notes UI');
};
const check = (condition, label) => {
  if (!condition) throw Error(label);
  count++; document.getElementById('results').textContent += 'PASS ' + label + '\n';
};
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const wrap = node => <AuthContext.Provider value={{ token: 'fixture', user: { id } }}>{node}</AuthContext.Provider>;
const reset = async () => {
  root.render(null); await tick();
  window.dispatchEvent(new Event('coast-account-changed'));
};
const library = async () => {
  await reset(); root.render(wrap(<NotebookPage />));
  await until(() => button('Notes')); await tick(); button('Notes').click();
  await until(() => document.querySelector('.lib-notes') && !document.querySelector('.lib-notes .lib-loading'));
};
// The Notes tab lists one card per lesson with notes; a card opens that lesson's editor.
const noteCards = () => [...document.querySelectorAll('.lib-note')];
export function EditorFixture({ html }) {
  const [value, setValue] = useState(html);
  return <RichNotesEditor contentHtml={value} onChange={next => { lastHtml = next; setValue(next); }} />;
}
const editor = () => document.querySelector('.rich-notes-editor');
const mountEditor = async html => {
  await reset(); root.render(wrap(<EditorFixture html={html} />));
  await until(() => editor()?.textContent); await tick();
};
const select = node => {
  editor().focus();
  const range = document.createRange(); range.selectNodeContents(node);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
};
const darkInk = node => getComputedStyle(node).color === 'rgb(23, 23, 23)';
const palette = [
  ['yellow', '#fef08a', 'rgb(254, 240, 138)'],
  ['green', '#bbf7d0', 'rgb(187, 247, 208)'],
  ['pink', '#fbcfe8', 'rgb(251, 207, 232)'],
  ['blue', '#bfdbfe', 'rgb(191, 219, 254)'],
];
try {
  for (const key of Object.keys(localStorage)) if (key.startsWith(`coast_note_draft_${id}:`)) localStorage.removeItem(key);
  await library();
  check(noteCards().length === 0 && !document.querySelector('.lib-notes__start'), 'A fresh student has no phantom premade notes');
  check(writes.length === 0, 'Opening the notes library creates no saved notes');
  // Notes from a guided course the student no longer sees (the first set was retired) stay reachable.
  const premade = 'Memory Palace';
  records.set(premade, '<p>My saved memory palace notes.</p>');
  records.set('The Polya Method', '<p><br></p>');
  await library();
  check(noteCards().length === 1 && noteCards()[0].textContent.includes('memory palace'), 'Real premade notes remain accessible; empty saved entries are hidden');
  noteCards()[0].click();
  await until(() => editor()?.textContent.includes('memory palace'));
  check(editor().textContent.includes('memory palace'), 'Saved notes outside the lesson list open from their card');
  check(!hasNoteContent('<p>&nbsp;<br></p>') && hasNoteContent('<img src="/fixture.png">'), 'Empty formatting is ignored, while image-only notes count as content');
  await mountEditor(palette.map(([name, hex]) => `<p><span style="background-color:${hex}"><font color="#ffffff"><b>${name} highlight</b></font></span></p>`).join('') + '<p style="background-color:#111;color:white">Dark pasted block</p>');
  check([...editor().querySelectorAll('b')].every(darkInk), 'Existing highlights override nested white text in all four colours');
  check(getComputedStyle(editor().lastElementChild).color === 'rgb(255, 255, 255)', 'Unrelated dark backgrounds retain their white text');
  for (const [name, , rgb] of palette) {
    await mountEditor('<p>Highlight this phrase.</p>');
    select(editor().firstElementChild);
    document.querySelector(`[aria-label="Highlight ${name}"]`).click(); await tick();
    const span = [...editor().querySelectorAll('[style]')].find(n => n.style.backgroundColor === rgb);
    check(span && darkInk(span) && window.getSelection().toString() === 'Highlight this phrase.', `${name}: selected text stays readable without losing the selection`);
  }
  document.execCommand('undo'); await tick();
  check(![...editor().querySelectorAll('[style]')].some(n => n.style.backgroundColor), 'Native undo reverses the highlight');
  select(editor().firstElementChild);
  document.querySelector('[aria-label="Highlight yellow"]').click(); await tick();
  document.querySelector('[title="Clear formatting"]').click(); await tick();
  check(![...editor().querySelectorAll('[style]')].some(n => n.style.backgroundColor) && !darkInk(editor().firstElementChild), 'Clear formatting restores the normal readable text colour');
  const legacy = '<p><span style="background-color: #fef08a"><b style="color:white">Exported highlight</b></span></p>';
  const frame = document.createElement('iframe');
  const loaded = new Promise(resolve => { frame.onload = resolve; });
  frame.srcdoc = buildExportHtml({ title: 'Notes', bodyHtml: sanitizeNotes(legacy) });
  document.body.append(frame); await loaded;
  check(frame.contentWindow.getComputedStyle(frame.contentDocument.querySelector('b')).color === 'rgb(23, 23, 23)', 'Exported notes preserve readable highlights');
  frame.remove();
  folders = ['Introduction to Mechanics'];
  records.set(folders[0], '<h2>Newton’s second law</h2><p>The <span style="background-color: #fef08a">net force</span> is the sum of all forces acting on an object.</p><p><span style="background-color: #bbf7d0">F = ma</span> connects force, mass and acceleration.</p><h2>What I want to remember</h2><p>For a fixed mass, <span style="background-color: #fbcfe8">doubling the force doubles the acceleration.</span></p><p>A 2 kg object accelerating at 3 m/s² needs <span style="background-color: #bfdbfe">6 N of net force.</span></p>');
  await library();
  await until(() => noteCards().length === 2);
  noteCards().find(n => n.textContent.includes(folders[0])).click();
  await until(() => editor()?.textContent.includes('Newton'));
  select(editor().querySelector('h2'));
  document.querySelector('[aria-label="Highlight green"]').click(); await tick(1150);
  check(writes.some(w => w.folder === folders[0] && w.content_html.includes('Newton') && w.content_html.includes('background-color')), 'Editing an actual lesson saves the highlight to that student’s note');
  check(!!lastHtml, 'The editor emits formatted HTML for persistence');
  window.getSelection().removeAllRanges();
  document.getElementById('status').textContent = `All ${count} notes UI checks passed`;
} catch (error) {
  document.getElementById('status').textContent = 'FAILED: ' + error.message;
  console.error(error);
}
