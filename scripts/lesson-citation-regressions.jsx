import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from '../src/context/authState';
import LessonView from '../src/components/NotebookPage/LessonView';
import { lessonChatKey } from '../src/utils/studentCache';

if (location.hostname !== '127.0.0.1') throw Error('Use the isolated 127.0.0.1 origin.');
const id = 999995, folder = 'Citation fixture';
const root = createRoot(document.getElementById('fixture'));
const sources = [
  { source_id:'src_mechanics', title:'Lecture 2 · Forces and motion', filename:'Forces.pdf', source_type:'pdf', page_count:28 },
  { source_id:'src_energy', title:'Energy and work', filename:'Energy.pptx', source_type:'pptx', page_count:4 },
];
const explanation = '## Newton’s second law\nThe net force acting on a body equals its mass multiplied by its acceleration.\n\n$$F = ma$$\n\n[Lecture 2 · p. 12](#lesson-source/src_mechanics/12)\n\nFor a fixed mass, doubling the net force doubles the acceleration.\n\n(Source: **Lecture 2 · Forces and motion**, page 14)\n\nCompare this with **Energy and work**, slide 2.\n\n[Unavailable page](#lesson-source/src_mechanics/99)';
const history = [{role:'pedro', content: explanation + '\n\n' + Array(6).fill('**Worked example:** a 2 kg object accelerating at 3 m/s² needs a net force of 6 N.').join('\n\n')}];
let posts = 0, pageRequested, missing = false, checks = 0, noteHtml = '<p>My note stays here.</p>';
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
const tick = (ms=60) => new Promise(resolve=>setTimeout(resolve,ms));
window.fetch = async (url, options={}) => {
  const path = new URL(url,location.href).pathname;
  if (path.endsWith('/lesson')) return json({has_outline:true,content_ready:true,current_section:1,total_sections:2,is_complete:false,section_verified:false,
    sections:[{title:'Foundations'},{title:'Forces and motion'}],section_progress:[{mastery_pct:100},{mastery_pct:null}],source_references:sources});
  if (path.endsWith('/section-chat/1')) return json({conversation_id:'fixture',messages:history});
  if (path.endsWith('/section-chat/0')) return json({conversation_id:'past-fixture',messages:[{role:'pedro',content:'Previously: Forces.pdf, page 3.'}]});
  if (path.endsWith('/all-feedback')) return json({sections:[]});
  if (path.endsWith('/lesson-notes')) {
    if(options.method==='PUT') noteHtml=JSON.parse(options.body).content_html;
    return json({content_html:noteHtml,revision:'fixture'});
  }
  if (path.includes('/pages/')) {
    pageRequested = Number(path.split('/').at(-1));
    if (missing) return json({detail:'Removed'},404);
    if(path.includes('src_energy')) return json({text:'Work = force × displacement',page:pageRequested,source_type:'pptx'});
    const canvas=document.createElement('canvas');canvas.width=650;canvas.height=850;
    const c=canvas.getContext('2d');c.fillStyle='#fffdf7';c.fillRect(0,0,650,850);c.fillStyle='#283a50';
    c.font='17px sans-serif';c.fillText('MECHANICS • LECTURE 2',48,60);
    c.font='bold 32px sans-serif';c.fillText('Newton’s second law',48,155);
    c.font='23px sans-serif';c.fillText('Net force = mass × acceleration',48,220);
    c.font='50px serif';c.fillText('F = ma',240,360);
    c.font='20px sans-serif';c.fillText('Original lecture • Page '+pageRequested,48,790);
    return new Response(await new Promise(r=>canvas.toBlob(r)),{headers:{'Content-Type':'image/png'}});
  }
  if (path==='/api/chat/stream') {
    posts++;
    const body=JSON.parse(options.body), reply='The same relationship applies here. [Forces · p. 12](#lesson-source/src_mechanics/12)';
    history.push({role:'user',content:body.message},{role:'pedro',content:reply});
    return new Response(new ReadableStream({async start(controller) {
      const emit=data=>controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify(data)+'\n\n'));
      emit({token:reply.slice(0,66)});await tick(180);emit({token:reply.slice(66)});await tick(180);
      emit({done:true,conversation_id:'fixture',section_verified:false});controller.close();
    }}),{headers:{'Content-Type':'text/event-stream'}});
  }
  throw Error('Unexpected request '+path);
};
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await tick();}throw Error('Timed out waiting for lesson UI');};
const check=(condition,label)=>{if(!condition)throw Error(label);checks++;document.getElementById('results').textContent+='PASS '+label+'\n';};
const mount=()=>root.render(<AuthContext.Provider value={{token:'fixture',user:{id}}}><div className="dark"><LessonView folderName={folder}/></div></AuthContext.Provider>);
const close=()=>document.querySelector('[aria-label="Close source"]').click();
const cite=()=>document.querySelector('.lesson-citation');
try {
  sessionStorage.removeItem(lessonChatKey(id,folder));
  mount();await until(()=>document.querySelectorAll('.lesson-citation').length===3);
  check(document.querySelectorAll('.lesson-citation').length===3,'Saved structured and legacy citations link only to valid pages');
  const input=document.querySelector('.lv-input');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'My unfinished question');
  input.dispatchEvent(new Event('input',{bubbles:true}));await tick();
  const chat=document.querySelector('.lv-chat-area');chat.scrollTop=120;
  cite().focus();cite().click();await until(()=>document.querySelector('.source-preview img'));
  check(pageRequested===12 && document.querySelector('.source-preview h3').textContent===sources[0].title,'Citation opens the correct lecture at page 12');
  check(document.querySelector('.lv-input').value==='My unfinished question' && chat.scrollTop>0,'Opening a reference retains the chat position and unsent question');
  check(!document.querySelector('.source-excerpt'),'Lesson references do not display an empty retrieved passage');
  document.querySelector('[aria-label="Next page"]').click();await until(()=>pageRequested===13);
  document.querySelector('[aria-label="Previous page"]').click();await until(()=>pageRequested===12);
  check(pageRequested===12,'Original pages can be browsed in both directions');
  document.querySelector('.source-preview').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
  check(!document.querySelector('.source-preview') && document.activeElement===cite(),'Escape returns keyboard focus to the citation');
  [...document.querySelectorAll('.lesson-citation')].find(n=>n.textContent.includes('slide 2')).click();await until(()=>document.querySelector('.source-preview pre'));
  check(document.querySelector('.source-preview-nav').textContent.includes('Slide 2 of 4'),'PowerPoint references open the correct numbered slide');
  close();await tick();
  document.querySelector('[title="My Notes"]').click();await until(()=>document.querySelector('.rich-notes-editor')?.textContent.includes('My note'));
  cite().click();await until(()=>document.querySelector('.source-preview'));close();await tick();
  check(document.querySelector('.rich-notes-editor')?.textContent==='My note stays here.','The notes panel is restored when a source is closed');
  document.querySelector('[title="My Notes"]').click();await tick();
  missing=true;cite().click();await until(()=>document.querySelector('.source-preview [role="alert"]'));
  check(document.querySelector('.source-preview [role="alert"]').textContent.includes('no longer available'),'A removed file produces an honest unavailable message');
  close();missing=false;await tick();
  document.querySelector('[aria-label="Send message"]').click();await until(()=>posts===1 && document.querySelectorAll('.lesson-citation').length===4);
  await until(()=>!document.querySelector('.lv-input').disabled);
  check(document.querySelectorAll('.lesson-citation').length===4,'A streamed answer renders its citation once');
  root.render(null);await tick();mount();await until(()=>document.querySelectorAll('.lesson-citation').length===4);
  check(posts===1,'Reopening restores saved citations without another AI request');
  document.querySelector('[title="Sections"]').click();await tick();
  [...document.querySelectorAll('.lv-sidebar-item')].find(n=>n.textContent.includes('Foundations')).click();
  await until(()=>cite()?.textContent.includes('p. 3'));cite().click();await until(()=>document.querySelector('.source-preview img'));
  check(pageRequested===3,'Past-section references resolve to their original source page');
  close();document.querySelector('.lv-back-current-btn').click();await until(()=>document.querySelectorAll('.lesson-citation').length===4);
  chat.scrollTop=0;cite().click();await until(()=>document.querySelector('.source-preview img'));
  document.getElementById('status').textContent='All '+checks+' lesson reference UI checks passed';
} catch(error) {document.getElementById('status').textContent='FAILED: '+error.message;console.error(error);}
