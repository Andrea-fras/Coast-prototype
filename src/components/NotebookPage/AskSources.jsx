import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, BookOpen, Loader, Plus, StickyNote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { useThrottledValue } from '../../utils/useThrottledValue';
import { readSourceChatStream } from '../../utils/sourceChatStream';
import remarkSourceCitations from '../../utils/sourceCitations';
import SourceCitationViewer from './SourceCitationViewer';
import SourceConversationPicker from './SourceConversationPicker';
import AskSourcesNotes from './AskSourcesNotes';
import './AskSources.css';

function SourceAnswer({ message, onCitation }) {
  const content = useThrottledValue(message.content || '', message.streaming ? 160 : 0);
  const citations = message.citations || [];
  return <>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkSourceCitations]} rehypePlugins={[[rehypeKatex, { strict: false, trust: false }]]} skipHtml
      components={{
        a: ({ href, children }) => {
          const id = /^#source-(S\d+)$/.exec(href || '')?.[1];
          const citation = citations.find(c => c.id === id);
          return citation ? <button type="button" className="ask-inline-citation" onClick={() => onCitation(citation)}
            disabled={citation.available === false} aria-label={`Open ${citation.title}, ${citation.source_type === 'pptx' ? 'slide' : 'page'} ${citation.page}`} title={`${citation.title} · ${citation.source_type === 'pptx' ? 'slide' : 'p.'} ${citation.page}${citation.available === false ? ' · Removed' : ''}`}>{children}</button>
            : id ? <span className="ask-citation-unavailable" title="This reference was not saved with the answer. Ask again to get a verifiable source link.">Reference unavailable</span>
              : <span>{children}</span>;
        },
        img: () => null,
        table: ({ children }) => <div className="ask-table"><table>{children}</table></div>,
      }}>{content}</ReactMarkdown>
    {!message.streaming && citations.length > 0 && <div className="ask-citations" aria-label="Sources cited">
      {citations.map(c => <button type="button" key={c.id} disabled={c.available === false} onClick={() => onCitation(c)}>
        <BookOpen size={13} /><span>{c.title} · {c.source_type === 'pptx' ? 'slide' : 'p.'} {c.page}{c.available === false ? ' · Removed' : ''}</span>
      </button>)}
    </div>}
    {message.incomplete && <p className="ask-muted">Incomplete answer · retry below</p>}
    {!message.streaming && (message.coverage?.pending_uploads > 0 || message.coverage?.ready_sources < message.coverage?.total_sources) && <p className="ask-muted">Some files were still pending or unreadable when this answer was written. It uses the {message.coverage.ready_sources} sources available at that time.</p>}
  </>;
}

export default function AskSources({ folderName, sourceIds, pendingUploads = 0, active = true }) {
  const { token } = useAuth();
  const base = `${API_URL}/api/folders/${encodeURIComponent(folderName)}/ask-sources`;
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('Finding relevant pages');
  const [status, setStatus] = useState(null);
  const [citation, setCitation] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const notesPanelId = useId();
  const [retry, setRetry] = useState(null);
  const abortRef = useRef(null);
  const lockRef = useRef(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const nearBottom = useRef(true);
  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
  const get = useCallback(async (suffix, signal) => {
    const res = await fetch(base + suffix, { headers: headers(), signal });
    if (!res.ok) throw new Error('Could not load your source workspace. Please reopen Ask sources.');
    return res.json();
  }, [base, headers]);
  const restore = useCallback(async (cid, signal) => {
    const history = await get('/history?conversation_id=' + encodeURIComponent(cid), signal);
    if (signal?.aborted) return;
    setMessages(history); setConversationId(cid); setCitation(null);
    const last = history.at(-1);
    setRetry(last?.role === 'user' && last.status === 'failed' ? { message: last.content, request_id: last.request_id, conversation_id: cid } : null);
  }, [get]);
  useEffect(() => {
    const controller = new AbortController();
    get('/conversations', controller.signal).then(async rows => {
      if (controller.signal.aborted) return;
      setConversations(rows);
      if (rows[0]) await restore(rows[0].conversation_id, controller.signal);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); const request = abortRef.current; abortRef.current = null; request?.abort(); };
  }, [get, restore]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer;
    const refresh = () => get('/status', controller.signal).then(s => {
      if (!controller.signal.aborted) { setStatus(s); if (s.semantic_ready) clearInterval(timer); }
    }).catch(() => {});
    refresh();
    timer = setInterval(refresh, 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [get, sourceIds, active]);
  const waitingForSavedAnswer = !busy && messages.at(-1)?.role === 'user' && messages.at(-1)?.status === 'running';
  useEffect(() => {
    if (!waitingForSavedAnswer || !conversationId || !active) return;
    const controller = new AbortController();
    const timer = setInterval(() => restore(conversationId, controller.signal).catch(() => {}), 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [waitingForSavedAnswer, conversationId, restore, active]);
  // Keep the newest text in view while the student is reading at the bottom. Watching the DOM
  // (not just `messages`) also catches the throttled markdown render that lands after each update.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    let lastHeight = list.scrollHeight;
    const follow = () => {
      // A scroll up may not have fired its scroll event yet, but scrollTop already shows it:
      // compare against the height from before this update so reading back isn't interrupted.
      if (lastHeight - list.scrollTop - list.clientHeight >= 100) nearBottom.current = false;
      if (nearBottom.current) list.scrollTop = list.scrollHeight;
      lastHeight = list.scrollHeight;
    };
    follow();
    const observer = new MutationObserver(follow);
    observer.observe(list, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const send = async (retryQuestion = null) => {
    if (lockRef.current || waitingForSavedAnswer) return;
    const question = retryQuestion || { message: input.trim(), request_id: crypto.randomUUID(), conversation_id: conversationId };
    if (!question.message) return;
    lockRef.current = true; setBusy(true); setError(''); setRetry(null); setInput('');
    setStage('Finding relevant pages'); nearBottom.current = true;
    // Sending always brings the conversation to its newest message.
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    const controller = new AbortController(); abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 270000);
    if (retryQuestion) setMessages(prev => {
      const i = prev.findIndex(m => m.request_id === question.request_id);
      return [...(i >= 0 ? prev.slice(0, i) : prev), { role: 'user', content: question.message, request_id: question.request_id, status: 'running' }, { role: 'pedro', content: '', streaming: true }];
    });
    else setMessages(prev => [...prev, { role: 'user', content: question.message, request_id: question.request_id, status: 'running' }, { role: 'pedro', content: '', streaming: true }]);
    let reply = '', refs = [], coverage;
    try {
      const res = await fetch(base, { method: 'POST', headers: headers(), body: JSON.stringify(question), signal: controller.signal });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not send your question. Please retry.'); }
      await readSourceChatStream(res, event => {
        if (event.conversation_id) { question.conversation_id = event.conversation_id; setConversationId(event.conversation_id); }
        if (event.stage) setStage(event.stage);
        if (event.citations) refs = event.citations;
        if (event.coverage) coverage = event.coverage;
        if (event.token) reply += event.token;
        if (event.done) reply = event.reply;
        setMessages(prev => [...prev.slice(0, -1), { role: 'pedro', content: reply, citations: refs, coverage, streaming: !event.done }]);
      });
    } catch (err) {
      if (abortRef.current !== controller) return;
      setError(controller.signal.aborted ? 'This answer took too long. Your question is saved; please retry.' : err.message);
      setRetry(question);
      setMessages(prev => [...prev.slice(0, -1).map(m => m.request_id === question.request_id ? { ...m, status: 'failed' } : m), ...(reply ? [{ role: 'pedro', content: reply, citations: refs, incomplete: true }] : [])]);
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) {
        lockRef.current = false; setBusy(false);
        get('/conversations').then(setConversations).catch(() => {});
        // A response finishing must not pull the cursor out of the student's notes.
        if (!document.activeElement?.closest('.ask-notes-panel, .source-preview')) inputRef.current?.focus();
      }
    }
  };
  const selectConversation = async cid => {
    setLoading(true); setError(''); setRetry(null);
    try { await restore(cid); } catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  const newConversation = () => { setMessages([]); setConversationId(null); setRetry(null); setError(''); setCitation(null); inputRef.current?.focus(); };
  const canAsk = !loading && !busy && !retry && !waitingForSavedAnswer && (status?.ready_sources ?? (sourceIds ? 1 : 0)) > 0;
  return <div className="ask-sources">
    <header className="ask-toolbar">
      <div className="ask-toolbar-actions"><SourceConversationPicker conversations={conversations} value={conversationId}
        disabled={busy || loading} onSelect={selectConversation} onNew={newConversation} />
        <button type="button" className="ask-new-conversation" aria-label="New source conversation" title="New conversation"
          disabled={busy || loading} onClick={newConversation}><Plus size={18} /></button>
        <button type="button" className="ask-notes-toggle" aria-label="Lesson notes"
          aria-expanded={notesOpen && !citation} aria-controls={notesPanelId}
          onClick={() => { setNotesOpen(open => citation ? true : !open); setCitation(null); }}>
          <StickyNote size={16} /><span>Notes</span>
        </button>
      </div>
    </header>
    <div className="ask-coverage" role="status"><span className="ask-status-dot" />
      {status ? `${status.ready_sources} of ${status.total_sources} sources searchable` : 'Preparing source search…'}
      {pendingUploads > 0 && ` · ${pendingUploads} upload${pendingUploads === 1 ? '' : 's'} still pending`}
      {status && !status.semantic_ready && status.ready_sources > 0 && <span> · {status.search_delayed ? 'Basic text search available' : 'Improving source search…'}</span>}
    </div>
    <div className="ask-messages" ref={listRef} onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
      {loading ? <p role="status"><Loader size={20} className="spinning" /> Loading conversations…</p> : messages.length === 0 ? <div className="ask-empty">
        <span className="ask-eyebrow">YOUR MATERIAL. A CLEARER ANSWER.</span>
        <h3>Go straight to the part<br />you’re wondering about.</h3>
        <p>Ask a question, compare ideas or unpack a difficult passage. Pedro answers from your uploaded sources, with pages you can open.</p>
        <div className="ask-suggestions">{['What are the main ideas in these lectures?', 'Compare the key approaches in my sources.'].map(q => <button type="button" key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }}>{q}</button>)}</div>
      </div> : messages.map((m, i) => <article key={i} className={`ask-message ask-message--${m.role}`}>
        <span className="ask-message-author">{m.role === 'user' ? 'You' : 'Pedro'}</span>
        {m.role === 'user' ? <p>{m.content}</p> : <SourceAnswer message={m} onCitation={setCitation} />}
        {m.streaming && <div className="ask-stream-state" role="status"><Loader size={14} className="spinning" />{stage}…</div>}
      </article>)}
      {waitingForSavedAnswer && <p role="status" className="ask-muted"><Loader size={14} className="spinning" /> Pedro is finishing your saved question…</p>}
    </div>
    {(error || retry) && <div className="ask-error" role="alert">{error || 'Your last answer was interrupted.'} {retry && <button type="button" disabled={busy} onClick={() => send(retry)}>Retry answer</button>}</div>}
    <form className="ask-composer" onSubmit={e => { e.preventDefault(); send(); }}>
      <textarea ref={inputRef} value={input} maxLength={6000} rows={2} aria-label="Ask about your sources" placeholder="Ask about your sources…" disabled={loading}
        onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canAsk && input.trim()) send(); } }} />
      <button type="submit" disabled={!canAsk || !input.trim()} aria-label="Send source question"><ArrowUp size={20} /></button>
    </form><p className="ask-footer">Answers stay with this lesson. Open a citation to check the source.</p>
    {citation && <SourceCitationViewer key={`${citation.source_id}:${citation.page}`} citation={citation} folderName={folderName} onClose={() => setCitation(null)} />}
    {active && notesOpen && !citation && <AskSourcesNotes key={folderName} id={notesPanelId} folderName={folderName} onClose={() => setNotesOpen(false)} />}
  </div>;
}
