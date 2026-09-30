import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from '../src/context/authState';
import FolderView from '../src/components/NotebookPage/FolderView';
import LessonView from '../src/components/NotebookPage/LessonView';
import NotesWorkspace from '../src/components/NotebookPage/NotesWorkspace';

if (location.hostname !== '127.0.0.1') throw Error('Use the isolated 127.0.0.1 origin.');
const root=createRoot(document.getElementById('fixture')), id=999996, folder='Introduction to Mechanics';
const records=new Map([[folder,{content_html:'<p>Existing lesson notes.</p>',revision:'initial'}],['Other lesson',{content_html:'<p>Other lesson only.</p>',revision:'initial'}]]);
const writes=[], history=[];
let failSave=false, releaseAnswer, checks=0, posts=0;
const source={type:'document',source_id:'forces',title:'Lecture 2 · Forces and motion',source_type:'pdf',page_count:28};
const citation={...source,id:'S1',page:12,excerpt:'F = ma'};
const coverage={ready_sources:1,total_sources:1,semantic_ready:true};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(url,options={})=>{
  const path=new URL(url,location.href).pathname;
  if(path.endsWith('/uploads'))return json({uploads:[]});
  if(path.endsWith('/sources'))return json({sources:[source]});
  if(path.endsWith('/oma-ingest'))return json({oma_enabled:true,ready_for_roadmap:true,sources:[]});
  if(path.endsWith('/lesson'))return json({has_outline:true,content_ready:true,current_section:0,total_sections:1,is_complete:false,section_verified:false,sections:[{title:'Newton’s second law'}],section_progress:[{mastery_pct:null}]});
  if(path.endsWith('/section-chat/0'))return json({conversation_id:'lesson-fixture',messages:[{role:'pedro',content:'Let’s look at how force changes acceleration.'}]});
  if(path.endsWith('/lesson-notes')){
    const name=decodeURIComponent(path.split('/')[3]), note=records.get(name);
    if(options.method==='PUT'){
      if(failSave){failSave=false;return json({},503);}
      const body=JSON.parse(options.body);
      if(body.revision!==note.revision)return json({},409);
      writes.push({folder:name,...body});records.set(name,{content_html:body.content_html,revision:'saved-'+writes.length});
    }
    return json(records.get(name));
  }
  if(path==='/api/lesson-notes/all')return json({notes:[...records].map(([folder_name,note])=>({folder_name,...note}))});
  if(path.endsWith('/ask-sources/status'))return json(coverage);
  if(path.endsWith('/ask-sources/conversations'))return json(history.length?[{conversation_id:'source-fixture',title:history[0].content}]:[]);
  if(path.endsWith('/ask-sources/history'))return json(history);
  if(path.includes('/pages/'))return json({text:'Original source page: net force equals mass × acceleration.'});
  if(path.endsWith('/ask-sources')&&options.method==='POST'){
    posts++;
    const body=JSON.parse(options.body), reply='The net force equals mass multiplied by acceleration. [[S1]]';
    history.push({role:'user',content:body.message});
    return new Response(new ReadableStream({async start(controller){
      await new Promise(resolve=>{releaseAnswer=resolve;});
      history.push({role:'pedro',content:reply,citations:[citation]});
      const events=[{citations:[citation]},{token:reply},{done:true,reply,citations:[citation],conversation_id:'source-fixture',coverage}];
      controller.enqueue(new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')));controller.close();
    }}),{headers:{'Content-Type':'text/event-stream'}});
  }
  throw Error('Unexpected fixture request: '+path);
};
const tick=(ms=60)=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async condition=>{for(let i=0;i<100;i++){if(condition())return;await tick();}throw Error('Timed out waiting for shared notes');};
const check=(value,label)=>{if(!value)throw Error(label);checks++;document.getElementById('results').textContent+='PASS '+label+'\n';};
const wrap=node=><AuthContext.Provider value={{token:'fixture',user:{id}}}><div className="dark">{node}</div></AuthContext.Provider>;
const button=text=>[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===text);
const editor=()=>document.querySelector('.rich-notes-editor');
const edit=html=>{editor().innerHTML=html;editor().dispatchEvent(new Event('input',{bubbles:true}));};
const mount=async node=>{root.render(null);await tick();root.render(wrap(node));await tick();};
const ask=async(name=folder)=>{
  await mount(<FolderView folderName={name} isCurated={false}/>);
  await until(()=>button('Ask sources'));button('Ask sources').click();
  await until(()=>document.querySelector('[aria-label="Lesson notes"]'));
};
const openNotes=async()=>{
  const toggle=document.querySelector('[aria-label="Lesson notes"]');toggle.focus();toggle.click();
  await until(()=>editor()?.getAttribute('contenteditable')==='true');
};
try{
  await ask();await openNotes();
  check(editor().textContent==='Existing lesson notes.','Ask sources opens the existing notebook for this lesson');
  check(writes.length===0,'Opening notes does not create or overwrite a note');
  edit('<p>Remember: net force is the sum of all forces.</p>');await tick();
  document.querySelector('[aria-label="Close lesson notes"]').click();
  await until(()=>writes.length===1);
  check(writes[0].folder===folder,'Closing before the autosave delay saves to the correct lesson');
  await openNotes();
  check(editor().textContent.includes('net force'),'Reopening retains the latest edit');
  document.querySelector('.ask-notes-panel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();
  check(!document.querySelector('.ask-notes-panel')&&document.activeElement.getAttribute('aria-label')==='Lesson notes','Escape closes notes and restores keyboard focus');
  const input=document.querySelector('.ask-composer textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Explain Newton’s second law');
  input.dispatchEvent(new Event('input',{bubbles:true}));await tick();document.querySelector('[aria-label="Send source question"]').click();
  await until(()=>releaseAnswer);await openNotes();editor().focus();releaseAnswer();
  await until(()=>document.querySelector('.ask-citations'));await tick();
  check(document.activeElement===editor(),'A finished Pedro answer does not steal the note cursor');
  edit('<p>Remember: F = ma.</p>');await tick();document.querySelector('.ask-inline-citation').click();
  await until(()=>document.querySelector('.source-preview'));
  check(!document.querySelector('.ask-notes-panel'),'A source citation opens without two panels overlapping');
  document.querySelector('[aria-label="Close source"]').click();await until(()=>editor());
  check(editor().textContent==='Remember: F = ma.','Closing the source restores the notepad and its draft');
  failSave=true;edit('<p>Saved across all learning modes.</p>');
  await until(()=>document.querySelector('.ask-notes-error'));
  check(editor().textContent.includes('all learning modes'),'A failed save keeps the text and shows a visible retry');
  button('Retry save').click();await until(()=>!document.querySelector('.ask-notes-error'));
  check(records.get(folder).content_html.includes('all learning modes'),'Retry saves the preserved note');
  button('Guided lesson').click();await tick();
  check(!document.querySelector('.ask-notes-panel'),'Switching learning modes hides the notepad');
  button('Ask sources').click();await until(()=>editor());
  check(editor().textContent.includes('all learning modes')&&posts===1,'Returning to Ask sources restores notes without regenerating an answer');
  await mount(<LessonView folderName={folder}/>);
  await until(()=>document.querySelector('[title="My Notes"]'));document.querySelector('[title="My Notes"]').click();
  await until(()=>editor()?.textContent.includes('all learning modes'));
  check(editor().textContent.includes('all learning modes'),'Guided lessons read the same saved note');
  edit('<p>Added while studying with Pedro.</p>');await tick();
  await mount(<NotesWorkspace folders={[folder]}/>);
  await until(()=>[...document.querySelectorAll('.lib-note')].some(n=>n.textContent.includes(folder)));
  [...document.querySelectorAll('.lib-note')].find(n=>n.textContent.includes(folder)).click();
  await until(()=>editor()?.textContent.includes('Added while studying'));
  check(editor().textContent.includes('Added while studying'),'The Notes library sees edits from the lesson');
  await ask('Other lesson');await openNotes();
  check(editor().textContent==='Other lesson only.','A different lesson never inherits this note');
  await ask();await openNotes();
  check(editor().textContent.includes('Added while studying'),'Ask sources sees subsequent edits made in guided lessons');
  document.getElementById('status').textContent='All '+checks+' shared-notes UI checks passed';
}catch(error){document.getElementById('status').textContent='FAILED: '+error.message;console.error(error);}
