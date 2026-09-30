import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, Loader, X } from 'lucide-react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/authState';
import './SourceCitationViewer.css';

export default function SourceCitationViewer({ folderName, citation, onClose, variant = 'sources' }) {
  const { token } = useAuth();
  const [page, setPage] = useState(citation.page);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const closeRef = useRef(null);
  const base = `${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources/${encodeURIComponent(citation.source_id)}`;
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let url;
    setPreview(null); setError('');
    (async () => {
      try {
        const res = await fetch(`${base}/pages/${page}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!res.ok) throw new Error(res.status === 404 ? 'This source or page is no longer available.' : 'Could not load this page. Try another page or reopen the citation.');
        const data = res.headers.get('content-type')?.includes('image/')
          ? { url: (url = URL.createObjectURL(await res.blob())) }
          : await res.json();
        if (!controller.signal.aborted) setPreview(data);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    })();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [base, page, token]);
  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${base}/file`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('The original file is unavailable.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = citation.filename || citation.title;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
    finally { setDownloading(false); }
  };
  return <aside className={`source-preview source-preview--${variant}`} aria-label={`Source: ${citation.title}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header><div><span className="source-preview-eyebrow">SOURCE REFERENCE</span><h3>{citation.title}</h3></div>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close source"><X size={18} /></button></header>
    <div className="source-preview-nav">
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ArrowLeft size={16} /></button>
      <span>{citation.source_type === 'pptx' ? 'Slide' : 'Page'} {page} of {citation.page_count}</span>
      <button type="button" aria-label="Next page" disabled={page >= citation.page_count} onClick={() => setPage(p => p + 1)}><ArrowRight size={16} /></button>
      <button type="button" onClick={download} disabled={downloading} title="Download original file" aria-label="Download original file"><Download size={16} /></button>
    </div>
    <div className="source-preview-content">
      {error ? <p role="alert">{error}</p> : !preview ? <p role="status"><Loader size={20} className="spinning" /> Loading page…</p>
        : preview.url ? <img src={preview.url} alt={`${citation.title}, page ${page}`} />
          : <><p>Extracted slide text · Download the original for its full layout.</p><pre>{preview.text}</pre></>}
    </div>
    {page === citation.page && citation.excerpt && <details className="source-excerpt"><summary>Retrieved passage</summary><p>{citation.excerpt}</p></details>}
  </aside>;
}
