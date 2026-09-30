// Preview Pedro's message formatting with real lesson data from the local backend.
// Open http://localhost:5173/scripts/pedro-format-preview.html?token=<jwt>&access=<image token>&folder=<course>&section=<index>
// The page reads the saved section chat and the course's sources; nothing is stored here.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Calculator from '../src/components/Calculator/Calculator';
import { AuthContext } from '../src/context/authState';
import { API_URL } from '../src/config';
import PedroMessage from '../src/components/PedroMessage';
import mascot from '../src/assets/sessioncompletebird.svg';
import '../src/index.css';
import '../src/components/NotebookPage/LessonView.css';
import '../src/components/NotebookPage/LessonView.fullscreen.css';
import '../src/components/PedroChat/PedroChat.css';

const params = new URLSearchParams(location.search);
const token = params.get('token');
const access = params.get('access');
const folder = params.get('folder') || '';
const section = params.get('section') || '0';
const view = params.get('view'); // 'global' previews the open chat's bubbles; 'labs' shows every workshop lab

// Every lab, placed the way Pedro places them in a workshop reply (view=labs, no login needed).
const LAB_BLOCKS = [
  'tokens', 'temperature', 'attention', 'python {"lab": "tokenizer"}', 'python {"lab": "train"}',
  'rocket {"scene": "liftoff"}', 'rocket {"scene": "design"}', 'rocket {"scene": "flight"}', 'rocket {"scene": "staging"}',
  'rocket {"scene": "mission", "payload": 10}', 'neuron {"mode": "single"}', 'neuron {"mode": "rate"}',
  'neuron {"mode": "synapses"}', 'neuron {"mode": "learning"}', 'recall',
];
const labsShowcase = LAB_BLOCKS.map((b) => `### Lab: ${b.split(' ')[0]}\n\n\`\`\`widget\n${b}\n\`\`\``).join('\n\n');
// &lab=<block> shows one lab after a line of Pedro's coaching (used for landing-page screenshots).
const oneLab = params.get('lab');
const labLead = params.get('lead') || '';
const labsText = oneLab ? `${labLead}\n\n\`\`\`widget\n${oneLab}\n\`\`\`` : labsShowcase;

const logCitation = (c) => console.log('open citation', c);

// A reply written the way the new formatting brief asks Pedro to write.
const showcase = (src) => `### Step 3: Why Königsberg had no trail

Euler's argument is about **degree**, the number of bridges touching a landmass. Every time you walk *through* a landmass you use one bridge in and one bridge out, so ==a landmass you pass through needs an even degree==. Only the start and the end can be odd [L01 Introduction 2026 · p. 11](#lesson-source/${src}/11).

![The modern Kaliningrad graph with each landmass labelled by its degree](/api/source-pages/${src}/16)

| Landmass | Degree | Odd? |
|---|---|---|
| Top left | 4 | no |
| Centre | 3 | yes |
| Top right | 6 | no |
| Bottom | 5 | yes |

> [!KEY] Euler's rule
> A trail through every bridge exactly once exists only if **zero or two** landmasses have an odd degree.

Counting degrees is just adding up edge ends, so the total is always even: $\\sum_i k_i = 2L$.

$$k_1 + k_2 + k_3 + k_4 = 4 + 3 + 6 + 5 = 18 = 2 \\times 9$$

> [!MISTAKE]
> "Any even number of odd landmasses is fine" is not enough: **four** odd landmasses still leave you stuck.

---

> [!QUESTION] Based on p. 16
> If the city adds one bridge between the centre (degree 3) and the bottom landmass (degree 5), how many landmasses have an odd degree, and can you still walk every bridge exactly once?
`;

export function Chat({ messages, sources, streaming }) {
  return (
    <div className={`lv-container lv-container--fullscreen${view === 'global' ? ' pedro-chat-page' : ''}`} style={{ overflowY: 'auto', top: 52 }}>
      <div id="chat" style={{ width: '100%', maxWidth: 980, margin: '0 auto', padding: '28px 24px 120px', display: 'flex', flexDirection: 'column', gap: '1.1rem', boxSizing: 'border-box' }}>
        {messages.map((m, i) => (
          <div key={i} className={`lv-chat-msg ${m.role === 'pedro' ? 'pedro' : 'user'}`}>
            {m.role === 'pedro' && <img src={mascot} alt="" className="lv-msg-avatar" />}
            <div className="lv-msg-bubble">
              {m.role === 'pedro'
                ? <PedroMessage text={m.content} sourceReferences={sources} onCitation={logCitation} />
                : <div className="lv-msg-user-text">{m.content}</div>}
            </div>
          </div>
        ))}
        {streaming != null && (
          <div className="lv-chat-msg pedro">
            <img src={mascot} alt="" className="lv-msg-avatar" />
            <div className="lv-msg-bubble">
              <PedroMessage text={streaming} isStreaming sourceReferences={sources} onCitation={logCitation} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LabsApp() {
  const [sent, setSent] = useState([]);
  const onResult = React.useCallback((text) => { console.log('lab result', text); setSent((m) => [...m, text]); return true; }, []);
  return (
    <AuthContext.Provider value={{ token: null, imageAccess: null, user: { id: 0 } }}>
      <div className="lv-container lv-container--fullscreen" style={{ overflowY: 'auto', top: 52 }}>
        <div id="chat" style={{ width: '100%', maxWidth: 980, margin: '0 auto', padding: '28px 24px 120px', display: 'flex', flexDirection: 'column', gap: '1.1rem', boxSizing: 'border-box' }}>
          <div className="lv-chat-msg pedro">
            <img src={mascot} alt="" className="lv-msg-avatar" />
            <div className="lv-msg-bubble"><PedroMessage text={labsText} onWidgetResult={onResult} /></div>
          </div>
          {sent.map((m, i) => (
            <div key={i} className="lv-chat-msg user"><div className="lv-msg-bubble"><div className="lv-msg-user-text" data-lab-result>{m}</div></div></div>
          ))}
        </div>
      </div>
    </AuthContext.Provider>
  );
}

export function App() {
  const [data, setData] = useState({ messages: [], sources: [] });
  const [streaming, setStreaming] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/api/folders/${encodeURIComponent(folder)}/lesson`, { headers }).then(r => r.json()),
      fetch(`${API_URL}/api/folders/${encodeURIComponent(folder)}/section-chat/${section}`, { headers }).then(r => r.json()),
    ]).then(([lesson, chat]) => {
      const sources = lesson.source_references || [];
      const src = sources.find(s => /^L01/.test(s.title))?.source_id || sources[0]?.source_id;
      setData({ sources, messages: [{ role: 'pedro', content: showcase(src) }, ...(chat.messages || [])] });
    });
  }, []);
  useEffect(() => {
    const replay = () => {
      clearInterval(timer.current);
      const full = data.messages[0]?.content || '';
      let n = 0;
      setStreaming('');
      const box = document.querySelector('.lv-container');
      setTimeout(() => box.scrollTo({ top: box.scrollHeight }), 50);
      timer.current = setInterval(() => {
        n += 3 + Math.floor(Math.random() * 6);
        setStreaming(full.slice(0, n));
        if (n >= full.length) { clearInterval(timer.current); setTimeout(() => setStreaming(null), 1500); }
      }, 30);
    };
    const button = document.getElementById('replay');
    button.addEventListener('click', replay);
    return () => button.removeEventListener('click', replay);
  }, [data]);
  return (
    <AuthContext.Provider value={{ token, imageAccess: access, user: { id: 0 } }}>
      <Chat messages={data.messages} sources={data.sources} streaming={streaming} />
    </AuthContext.Provider>
  );
}

// The calculator on its own (view=calculator, no login needed).
function CalculatorApp() {
  const [open, setOpen] = useState(true);
  return open ? <Calculator onClose={() => setOpen(false)} /> : <button type="button" onClick={() => setOpen(true)}>Open calculator</button>;
}

const VIEWS = { labs: LabsApp, calculator: CalculatorApp };
const View = VIEWS[view] || App;
createRoot(document.getElementById('root')).render(<View />);
