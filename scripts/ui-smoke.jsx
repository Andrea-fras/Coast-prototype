// Isolated UI smoke page. All API calls are mocked; never connects to real accounts/models.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import '../src/index.css';
import { getOrganicUnlock, getWorldMap, tileAt } from '../src/components/WorldMap/mapTerrain';
// ?onboarding starts as a brand-new student (welcome → guided tour → Pedro hello).
// ?control opens the admin Control Center (beta codes panel) with mocked admin data.
const controlMode = new URLSearchParams(location.search).has('control');
const user = { id: 999994, name: 'Alex', email: 'fixture@example.invalid', is_admin: controlMode,
  onboarding_completed: !new URLSearchParams(location.search).has('onboarding') };
const betaCodes = [
  {code:'COAST-7KQ4-M9XP', note:'Ada (physics)', status:'used', created_at:'2026-09-20T10:00:00', used_email:'ada@example.invalid', used_at:'2026-09-21T09:30:00'},
  {code:'COAST-H2RD-8WQE', note:'ML society', status:'unused', created_at:'2026-09-22T10:00:00', used_email:null, used_at:null},
  {code:'COAST-Z3NB-4TYC', note:'', status:'revoked', created_at:'2026-09-22T11:00:00', used_email:null, used_at:null},
];
const codeCounts = () => ({unused: betaCodes.filter((c) => c.status === 'unused').length,
  used: betaCodes.filter((c) => c.status === 'used').length, revoked: betaCodes.filter((c) => c.status === 'revoked').length});
// ?logged-out shows the sign-in / sign-up screens (add &mode=signup for the beta-code form).
if (new URLSearchParams(location.search).has('logged-out')) {
  localStorage.removeItem('coast_user');
  localStorage.removeItem('coast_token');
} else {
  localStorage.setItem('coast_user', JSON.stringify(user));
  localStorage.setItem('coast_token', 'ui-fixture');
}
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
const sections = [{title:'Forces and motion'}, {title:'Energy and work'}, {title:'Conservation'}];
const progress = [{mastery_pct:100, mastered:true}, {mastery_pct:0}, {mastery_pct:0}];
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const summary = {has_outline:true, total_sections:3, current_section:1, section_progress:progress,
  current_section_title:'Energy and work', last_studied_at:daysAgo(0.1), is_complete:false};
// ?empty-library shows a brand-new student's library (one untouched course, no charted land).
const emptyLibrary = new URLSearchParams(location.search).has('empty-library');
const mastered = (titles, daysBack) => ({has_outline:true, total_sections:titles.length, current_section:titles.length,
  section_progress:titles.map(() => ({mastery_pct:100, mastered:true})), ever_mastered:true, is_complete:true,
  current_section_title:titles[titles.length - 1], last_studied_at:daysAgo(daysBack)});
const COURSES = emptyLibrary ? {Physics:{has_outline:true, total_sections:3, current_section:0, section_progress:[], current_section_title:'Forces and motion'}} : {
  Physics: summary,
  'Linear Algebra': mastered(['Vectors', 'Matrices', 'Determinants', 'Eigenvectors'], 3),
  'Cell Biology': {has_outline:true, total_sections:5, current_section:2, section_progress:[{mastery_pct:100, mastered:true}, {mastery_pct:100, mastered:true}, {mastery_pct:35, attempted:true}],
    current_section_title:'Membrane transport, osmosis, and the electrochemical gradient across membranes', last_studied_at:daysAgo(2)},
  Statistics: mastered(['Describing data', 'Probability', 'Distributions', 'Sampling', 'Hypothesis tests', 'Regression'], 40),
  Microeconomics: {has_outline:true, total_sections:6, current_section:0, section_progress:[], current_section_title:'Supply and demand', last_studied_at:null},
  'Organic Chemistry': {has_outline:false},
};
const SECTION_TITLES = {
  Physics: sections.map((x) => x.title),
  'Linear Algebra': ['Vectors', 'Matrices', 'Determinants', 'Eigenvectors'],
  'Cell Biology': ['The cell', 'Organelles', 'Membrane transport, osmosis, and the electrochemical gradient across membranes', 'Cell division', 'Signalling'],
  Statistics: ['Describing data', 'Probability', 'Distributions', 'Sampling', 'Hypothesis tests', 'Regression'],
  Microeconomics: ['Supply and demand', 'Elasticity', 'Consumer choice', 'Costs', 'Market structures', 'Welfare'],
};
// Chart real land for every mastered section: each course grows its own wedge out from the harbour,
// one ring per section, the way the map grows as sections are mastered.
// ?map-level=2 puts the student in the level 2 world (Neon Meridian); ?radius=N sets how far the
// fog has lifted; ?seen=N pretends the student last saw N charted tiles (plays the reveal animation);
// ?intro replays the new-world intro.
const mapParams = new URLSearchParams(location.search);
const mapLevel = Number(mapParams.get('map-level')) || 1;
const world = getWorldMap(mapLevel);
const revealRadius = Number(mapParams.get('radius')) || (emptyLibrary ? 9 : 24);
const { unlocked } = getOrganicUnlock(world.origin.x, world.origin.y, revealRadius, world.size, world);
const tilePrefix = mapLevel > 1 ? `${mapLevel}:` : '';
localStorage.setItem(`coast_map_seen:${user.id}:${world.id}`, mapParams.get('seen') ?? String(unlocked.size));
if (mapParams.has('intro')) localStorage.removeItem(`coast_world_intro_v2:${user.id}`);
else localStorage.setItem(`coast_world_intro_v2:${user.id}`, String(mapLevel));
const landTiles = [...unlocked].map((k) => k.split(',').map(Number)).filter(([x, y]) => { const t = tileAt(world, x, y); return t >= 4 && t <= 14; });
const WEDGES = {Physics:[-0.4, 0.5], 'Linear Algebra':[0.6, 1.7], 'Cell Biology':[1.8, 2.8], Statistics:[2.9, 4.4]};
const sectionCatalog = [];
const tileSections = {};
for (const [folder, [a0, a1]] of Object.entries(emptyLibrary ? {} : WEDGES)) {
  const meta = COURSES[folder];
  const done = (meta.section_progress || []).filter((p) => p.mastered).length;
  for (let i = 0; i < done; i += 1) {
    const idx = sectionCatalog.push({folder, section_index:i, title:SECTION_TITLES[folder][i]}) - 1;
    for (const [x, y] of landTiles) {
      const dx = x - world.origin.x; const dy = y - world.origin.y;
      const r = Math.hypot(dx, dy); let ang = Math.atan2(dy, dx); if (ang < a0) ang += Math.PI * 2;
      const key = `${tilePrefix}${x},${y}`;
      if (ang >= a0 && ang < a1 && r >= 3 + i * 4 && r < 7 + i * 4 && tileSections[key] === undefined) tileSections[key] = idx;
    }
  }
}
const NOTES = emptyLibrary ? [] : [
  {folder_name:'Physics', content_html:'<h2>Work and energy</h2><p>Work = force × distance along the motion. Pushing a wall that doesn’t move does no work on the wall.</p><ul><li>Units: joules</li><li>Only the part of the force along the motion counts</li></ul>'},
  {folder_name:'Linear Algebra', content_html:'<h2>Eigenvectors</h2><p>Directions a transformation only stretches. det(A − λI) = 0 gives the stretch factors.</p>'},
  {folder_name:'Cell Biology', content_html:'<p>Membranes are selectively permeable: small non-polar molecules pass, ions need channels.</p><p>Active transport uses ATP to move against the gradient.</p>'},
  {folder_name:'Statistics', content_html:'<h3>p-values</h3><p>The chance of data at least this extreme if the null were true. Not the chance the null is true!</p>'},
  {folder_name:'Microeconomics', content_html:'<h2>x`ax`axz_supercalifragilisticexpialidocious_heading_without_spaces</h2><p>dasd.awd c`c`ax`ax`a`ax`axa`x`ax`axz`xzx`asdasdasdasdaefaemfkaemfakemfcfkASDAKSDMAWLDKMAIOiOmjikmawDASDMASDASDASDAaSDASSDasdsadasdasdasdasdaSDNLKSANDKLASNDKLASNDKLADNSAL kljljl https://www.coast.academy/some/really/long/path/that/never/breaks/sitemap.xml</p>'},
];
const askHistory = [];
const LONG_ANSWER = [
  '## Work and energy, from your lectures',
  'Work is the energy a force transfers when it moves something through a distance [[S1]]. Push a box across the floor and the energy from your push ends up in the box as motion, plus a little heat from friction.',
  'The amount of work depends on two things: how hard you push and how far the box moves while you push it. That gives the definition W = F × d, measured in joules.',
  '**Only the part of the force along the motion counts.** If you pull a suitcase by a handle at an angle, only the horizontal part of your pull does work on the suitcase. The vertical part just holds some of its weight.',
  'This is why holding a heavy bag still does no work on the bag: nothing moves, so the distance is zero. Your muscles still get tired, but that energy goes into heat inside your body, not into the bag.',
  'Energy is conserved. The work you do on the box becomes its kinetic energy, ½mv², plus any heat lost to friction. If you lift the box instead, the work becomes gravitational potential energy, mgh.',
  'A quick check: a 2 kg box pushed with 10 N over 3 m receives 30 J of work. Without friction, all 30 J becomes kinetic energy, so ½ × 2 × v² = 30 and v ≈ 5.5 m/s.',
  'Where students often slip: mixing up force and work, forgetting that work can be negative (friction takes energy away), and using the whole force instead of the part along the motion.',
  '**Try this:** if you push the same box with the same force over twice the distance, what happens to the work done and to the final speed?',
].join('\n\n');
const progressiveMode = new URLSearchParams(location.search).has('progressive');
let lessonPolls = 0;
let releasePreparation = false;
const holdPreparation = new URLSearchParams(location.search).get('progressive') === 'hold';
if (holdPreparation) {
  const control = document.createElement('button');
  control.textContent = 'Fixture: finish preparation';
  control.style.cssText = 'position:fixed;top:0;right:0;z-index:999999';
  control.onclick = () => { releasePreparation = true; control.remove(); };
  document.body.appendChild(control);
}
window.fetch = async (url, options={}) => {
  const path = new URL(url, location.origin).pathname;
  let data = {};
  if (path === '/api/auth/me') data = user;
  else if (path === '/api/image-access') data = {access:'fixture-image-access'};
  else if (path === '/api/map') data = {size:world.size, origin:{...world.origin}, player:{...world.origin}, reveal_radius:revealRadius,
    map_level:mapLevel, origins:{1:getWorldMap(1).origin, 2:getWorldMap(2).origin},
    total_xp:250,level:2,xp:150,xp_max:200,sections_mastered:sectionCatalog.length,explored_pct:10,
    tile_sections:tileSections,section_catalog:sectionCatalog,treasures:{opened_ids:[]}};
  else if (path === '/api/lessons/summary') data = {...COURSES, 'Tiny LLM':{has_outline:false}};
  else if (path === '/api/stats') data = {streak:3, week:['Mo','Tu','We','Th','Fr','Sa','Su'].map((label, i) => {
    const today = (new Date().getDay() + 6) % 7;
    return {label, status: i > today ? 'future' : i >= today - 2 ? 'active' : 'missed'};
  })};
  else if (path === '/api/notebooks/folders' && options.method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    data = {folder: body.name, kind: body.kind || 'lesson'};
  }
  else if (path === '/api/notebooks/folders') data = new URL(url, location.origin).searchParams.has('detail')
    ? [...Object.keys(COURSES).map((name) => ({name, kind:'lesson'})), {name:'Tiny LLM', kind:'workshop'}] : [...Object.keys(COURSES), 'Tiny LLM'];
  else if (path.startsWith('/api/folders/') && path.endsWith('/sources')) {
    const folder = decodeURIComponent(path.split('/')[3]);
    data = {sources: COURSES[folder]?.has_outline ? [
      {source_id:`${folder}-1`, type:'document', source_type:'pdf', title:`${folder} · Lecture 1.pdf`, oma_ingest_status:'COMPLETE', page_count:24},
      {source_id:`${folder}-2`, type:'document', source_type:'pptx', title:`${folder} · Lecture 2 slides.pptx`, oma_ingest_status:'COMPLETE', page_count:31},
    ] : []};
  }
  else if (path.startsWith('/api/folders/') && path.endsWith('/lesson') && !path.startsWith('/api/folders/Physics/')) {
    const folder = decodeURIComponent(path.split('/')[3]);
    data = COURSES[folder]?.has_outline
      ? {...COURSES[folder], sections:SECTION_TITLES[folder].map((title) => ({title})), content_ready:true, section_preparation:{ready:true}}
      : {has_outline:false, format:folder === 'Tiny LLM' ? 'workshop' : undefined};
  }
  else if (path === '/api/folders/Physics/lesson') {
    lessonPolls += 1;
    const ready = !progressiveMode || releasePreparation || (!holdPreparation && lessonPolls > 3);
    data = {...summary, sections, section_verified:false, content_ready:ready, estimated_minutes:45, section_preparation:{ready, ready_pages:ready ? 8 : Math.min(6,lessonPolls*2), total_pages:8}};
    // ?no-outline shows a course before its first roadmap (lesson vs workshop choice).
    if (new URLSearchParams(location.search).has('no-outline')) data = {has_outline:false};
  }
  else if (path.includes('/section-chat/')) data = {conversation_id:'fixture', messages:[
    {role:'pedro', content:'## Energy and work\nWork transfers energy when a force acts through a distance.\n\n**Try this:** What changes when the same force acts over twice the distance?'},
    {role:'user', content:'The work doubles?'},
    {role:'pedro', content:'Exactly! **W = F × d**, so twice the distance means twice the work.\n\nA harder one: you carry a heavy box across the room at the same height. How much work do *you* do on the box?'},
    {role:'user', content:'Loads, my arms are exhausted!'},
    {role:'pedro', content:'Your arms are tired, but your force points **up** while the box moves **sideways**. Only the part of the force along the motion counts, so the work done on the box is zero. Your muscles still burn energy, it just turns into heat in your body.'},
  ]};
  else if (path.endsWith('/lesson-notes')) data = {content_html:'', revision:'empty'};
  else if (path === '/api/lesson-notes/all') data = {notes:NOTES};
  else if (path === '/api/chat/conversations') data = emptyLibrary ? [] : [
    {conversation_id:'c1', context_type:'global', last_message:'Work is force times distance along the motion — so pushing a wall does no work.', updated_at:daysAgo(0.05)},
    {conversation_id:'c2', context_type:'global', last_message:'Eigenvectors are the directions a transformation only stretches.', updated_at:daysAgo(2)},
    {conversation_id:'c3', context_type:'global', last_message:'A p-value is the chance of data this extreme if the null were true.', updated_at:daysAgo(9)},
  ];
  else if (path === '/api/chat/history') data = [
    {role:'user', content:'Can you explain work and energy simply?'},
    {role:'pedro', content:'Sure! **Work** is energy moved by a force: push a box across the floor and the energy from your push goes into the box.\n\nIt depends on two things: how hard you push, and how far the box moves while you push it. That’s **W = F × d**.\n\n**Try this:** if you push the same box twice as far, what happens to the work?'},
  ];
  else if (path === '/api/usage') data = {chat_messages_remaining:42};
  // Ask sources: a long, streamed answer so the chat has to scroll.
  else if (path.endsWith('/ask-sources/status')) data = {ready_sources:2, total_sources:2, semantic_ready:true};
  else if (path.endsWith('/ask-sources/conversations')) data = askHistory.length ? [{conversation_id:'ask-fixture', title:askHistory[0].content}] : [];
  else if (path.endsWith('/ask-sources/history')) data = askHistory;
  else if (path.endsWith('/ask-sources') && options.method === 'POST') {
    const folder = decodeURIComponent(path.split('/')[3]);
    const body = JSON.parse(options.body || '{}');
    const citation = {type:'document', source_id:`${folder}-1`, title:`${folder} · Lecture 1.pdf`, source_type:'pdf', page_count:24, id:'S1', page:7, excerpt:'Work is force times distance.'};
    const reply = LONG_ANSWER;
    askHistory.push({role:'user', content:body.message});
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      send({stage:'Reading your lectures', conversation_id:'ask-fixture'});
      send({citations:[citation]});
      for (const piece of reply.match(/[\s\S]{1,60}/g)) { send({token:piece}); await new Promise((r) => setTimeout(r, 15)); }
      askHistory.push({role:'pedro', content:reply, citations:[citation]});
      send({done:true, reply, citations:[citation], conversation_id:'ask-fixture', coverage:{ready_sources:2, total_sources:2, semantic_ready:true}});
      controller.close();
    }}), {headers:{'Content-Type':'text/event-stream'}});
  }
  else if (path === '/api/dev/content-provider') data = {oma_enabled:true};
  else if (path === '/api/admin/control-center') data = {generated_at:new Date().toISOString(), live:{count:1, users:[]},
    kpis:{online_now:1, dau:3, wau:9, mau:21, total_users:21, total_rows:21, loadtest_bots:0, total_messages:1234, messages_today:12,
      signups_today:1, total_hours:42, retention:{day_1:48, day_7:31, day_30:19}}, engagement:{pct_completed_lesson:12},
    growth:{signups_per_day:[]}, active_users:{dau_trend:[]}, time:{per_feature:{map:2, notebook:5}},
    recent_signups:[{id:1, name:'Ada', email:'ada@example.invalid', beta_code:'COAST-7KQ4-M9XP', created_at:'2026-09-21T09:30:00'}],
    server:{environment:'development', uptime_seconds:5400, traffic:{requests_per_minute:3, requests_last_5m:12, total_requests:1000, series_60m:[]},
      storage:{disk:null, breakdown:[], data_mount:[]}, database:{}}, oma:{enabled:true, student_oma_enabled:true, rag_provider:'oma'}};
  else if (path === '/api/admin/ai-usage') {
    const row = (extra, calls, inp, out, cost, cache = 0.4) => ({...extra, calls, failed: 0, input_tokens: inp * calls,
      cached_tokens: Math.round(inp * calls * cache), output_tokens: out * calls, cost_usd: cost, unpriced_calls: 0,
      avg_input_tokens: inp, avg_output_tokens: out, avg_latency_ms: 2400, cache_share: cache});
    data = {days: 7, prices_checked: '2026-09-26', unpriced_models: [],
      total: {...row({}, 1840, 7200, 380, 21.37), failed: 6, students: 23, cost_per_student_usd: 0.93},
      by_feature: [row({feature: 'pedro:lesson'}, 1210, 9800, 420, 14.02), row({feature: 'folders/outline'}, 41, 21000, 2600, 3.1, 0),
        row({feature: 'source_ingest'}, 380, 1800, 240, 2.4, 0), row({feature: 'section_memory'}, 209, 6400, 510, 1.85, 0.1)],
      by_model: [row({provider: 'openai', model: 'gpt-4o-2024-08-06'}, 1250, 9900, 430, 17.9), row({provider: 'openai', model: 'gpt-4o-mini-2024-07-18'}, 590, 3100, 260, 3.47, 0.2)],
      by_day: Array.from({length: 7}, (_, i) => ({...row({}, 200 + i * 30, 7000, 380, 1.8 + i * 0.6), day: `2026-09-${20 + i}`})),
      top_students: [row({user_id: 3, email: 'ada@example.invalid'}, 310, 9100, 400, 3.9), row({user_id: 7, email: 'lin@example.invalid'}, 205, 8800, 390, 2.6)]};
  }
  else if (path === '/api/admin/beta-codes' && options.method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const made = Array.from({length: body.count || 1}, (_, i) => ({code:`COAST-NEW${i}-${String(Date.now()).slice(-4)}`,
      note: body.note || '', status:'unused', created_at:new Date().toISOString(), used_email:null, used_at:null}));
    betaCodes.unshift(...made);
    data = {codes: made};
  }
  else if (path === '/api/admin/beta-codes') data = {required:true, counts:codeCounts(), codes:betaCodes};
  else if (path.startsWith('/api/admin/beta-codes/') && path.endsWith('/revoke')) {
    const row = betaCodes.find((c) => c.code === decodeURIComponent(path.split('/')[4]));
    if (row) row.status = 'revoked';
    data = {code: row};
  }
  else if (options.method === 'POST' && path === '/api/chat/stream') return new Response('event: done\ndata: {}\n\n', {headers:{'Content-Type':'text/event-stream'}});
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')).render(<AuthProvider><App /></AuthProvider>);
// ?click=sel1|sel2 clicks each selector in turn once it appears (for screenshots of deeper screens),
// e.g. ?click=.app-nav__item:nth-child(2)|[data-folder="Physics"]
const clickSteps = (new URLSearchParams(location.search).get('click') || '').split('|').filter(Boolean);
(async () => {
  for (const sel of clickSteps) {
    let el = null;
    for (let i = 0; i < 80 && !(el = document.querySelector(sel)); i += 1) await new Promise((r) => setTimeout(r, 100));
    el?.click();
    await new Promise((r) => setTimeout(r, 500));
  }
  // ?ask=question then types it into Ask sources and sends it (the answer is long, so it must scroll).
  const question = new URLSearchParams(location.search).get('ask');
  if (!question) return;
  let box = null;
  for (let i = 0; i < 80 && !((box = document.querySelector('.ask-composer textarea')) && !box.disabled); i += 1) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!box) return;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, question);
  box.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  document.querySelector('.ask-composer button')?.click();
})();
if (controlMode) {
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', {key:'A', shiftKey:true, metaKey:true, ctrlKey:true})), 1200);
}
