import { useLessonNotes } from '../../utils/useLessonNotes';
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader, StickyNote, Download, Plus, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { buildCombinedNotesHtml, downloadNotesFile } from '../../utils/notesEditor';
import { hasNoteContent, sanitizeNotes } from '../../utils/sanitizeNotes';
import curatedLessons from '../../data/curatedLessons.json';
import RichNotesEditor from './RichNotesEditor';
import './NotesWorkspace.css';

const TONES = ['amber', 'sky', 'mint', 'coral', 'violet'];

function folderDisplayName(folderName) {
  const curated = curatedLessons.find((l) => l.folderName === folderName);
  return curated?.title || folderName;
}

function toneFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/** First heading as the card title, the rest as a short preview (parsed inertly). */
function previewNote(html) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeNotes(html);
  const heading = template.content.querySelector('h1, h2, h3, h4');
  const title = heading?.textContent.trim() || '';
  heading?.remove();
  template.content.querySelectorAll('li').forEach((el) => el.prepend('• '));
  template.content.querySelectorAll('p, li, div, br, h1, h2, h3, h4, blockquote').forEach((el) => el.append(' '));
  const text = template.content.textContent.replace(/\s+/g, ' ').trim();
  return { title, text: text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text };
}

export default function NotesWorkspace({ folders = [], query = '' }) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exportError, setExportError] = useState('');
  const [notesByFolder, setNotesByFolder] = useState({});
  const [selectedFolder, setSelectedFolder] = useState(null);
  const note = useLessonNotes(user?.id, selectedFolder, token);
  const hdrs = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const folderList = useMemo(() => {
    const names = new Set(folders);
    Object.keys(notesByFolder).forEach((f) => {
      if (hasNoteContent(notesByFolder[f]) || f === selectedFolder) names.add(f);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [folders, notesByFolder, selectedFolder]);

  const foldersWithContent = useMemo(
    () => folderList.filter((f) => hasNoteContent(notesByFolder[f])),
    [folderList, notesByFolder],
  );

  const cards = useMemo(
    () => foldersWithContent.map((folder) => ({ folder, ...previewNote(notesByFolder[folder]) })),
    [foldersWithContent, notesByFolder],
  );

  const shownCards = cards.filter(({ folder, title, text }) => !query
    || [folderDisplayName(folder), title, text].some((field) => field.toLowerCase().includes(query)));
  const withoutNotes = folderList.filter((f) => !hasNoteContent(notesByFolder[f])
    && (!query || folderDisplayName(f).toLowerCase().includes(query)));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithRetry(`${API_URL}/api/lesson-notes/all`, { headers: hdrs() });
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const map = {};
        for (const row of data.notes || []) {
          map[row.folder_name] = row.content_html || '';
        }
        setNotesByFolder(map);
        setLoadError(false);
      } catch {
        // Never show a failed load as an empty library: the notes are safe on the server.
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, folders.join('\x00'), reloadKey]);

  const handleEditorChange = (html) => {
    note.change(html);
    setNotesByFolder((prev) => ({ ...prev, [selectedFolder]: html }));
  };

  const handleExportAll = async () => {
    setExportError('');
    const list = folderList.map((folder_name) => ({
      folder_name,
      content_html: notesByFolder[folder_name] || '',
    }));
    const titles = Object.fromEntries(folderList.map((f) => [f, folderDisplayName(f)]));
    try {
      await downloadNotesFile('coast-all-lesson-notes.html', buildCombinedNotesHtml(list, titles), token);
    } catch (err) { setExportError(err.message); }
  };

  if (selectedFolder) {
    return (
      <div className="notes-workspace notes-workspace--editor">
        <header className="notes-workspace-header">
          <button type="button" className="notes-workspace-back" onClick={() => setSelectedFolder(null)}>
            <ArrowLeft size={17} />
            <span>All notes</span>
          </button>
          <h2 className="notes-workspace-title">{folderDisplayName(selectedFolder)}</h2>
          <div className="notes-workspace-header-actions">
            {note.saving && <span className="notes-workspace-saving">Saving…</span>}
            {note.error && <button type="button" onClick={note.retry} role="status">{note.error}</button>}
          </div>
        </header>
        <div className="notes-workspace-editor-wrap">
          <RichNotesEditor
            key={selectedFolder}
            contentHtml={note.html}
            readOnly={!note.loaded}
            onChange={handleEditorChange}
            showExport
            exportTitle={`${folderDisplayName(selectedFolder)} — Notes`}
            exportFilename={`coast-notes-${selectedFolder.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`}
            placeholder="Write notes for this lesson… Drag in images or paste from Pedro."
            autoFocus
          />
        </div>
      </div>
    );
  }

  return (
    <div className="lib-notes">
      {exportError && <p role="alert" className="lib-empty">{exportError}</p>}
      <div className="lib-notes__bar">
        <span>
          {loading ? 'Loading your notes…'
            : loadError ? 'Your notes couldn’t be loaded'
              : `${cards.length} lesson${cards.length === 1 ? '' : 's'} with notes`}
        </span>
        <button
          type="button"
          className="lib-btn lib-btn--ghost lib-btn--sm"
          onClick={handleExportAll}
          disabled={loadError || foldersWithContent.length === 0}
          title="Export all lesson notes"
        >
          <Download size={15} aria-hidden="true" />
          Export all
        </button>
      </div>

      {loading ? (
        <div className="lib-loading">
          <Loader size={20} className="spinning" />
        </div>
      ) : loadError ? (
        <div className="lib-empty lib-empty--box" role="alert">
          <StickyNote size={34} strokeWidth={1.5} aria-hidden="true" />
          <b>We couldn’t load your notes</b>
          <span>They’re safe. This is a connection problem, not lost work.</span>
          <button type="button" className="lib-btn lib-btn--ghost lib-btn--sm" onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCcw size={14} aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : (
        <>
          {cards.length === 0 && !query && (
            <div className="lib-empty lib-empty--box">
              <StickyNote size={34} strokeWidth={1.5} aria-hidden="true" />
              <b>No notes yet</b>
              <span>Notes you write or save from Pedro during a lesson collect here.</span>
            </div>
          )}
          {query && shownCards.length === 0 && withoutNotes.length === 0 && (
            <p className="lib-empty">No notes match “{query}”.</p>
          )}
          {shownCards.length > 0 && (
            <div className="lib-notes__grid">
              {shownCards.map(({ folder, title, text }, i) => (
                <button
                  key={folder}
                  type="button"
                  className="lib-note"
                  onClick={() => setSelectedFolder(folder)}
                  style={{ '--i': Math.min(i, 12) }}
                >
                  <span className={`lib-chip lib-chip--${toneFor(folder)}`}>{folderDisplayName(folder)}</span>
                  {title && <span className="lib-note__title">{title}</span>}
                  {text && <span className="lib-note__text">{text}</span>}
                </button>
              ))}
            </div>
          )}
          {withoutNotes.length > 0 && (
            <div className="lib-notes__start">
              <span>Start notes for</span>
              {withoutNotes.map((folder) => (
                <button key={folder} type="button" className="lib-chip lib-chip--line lib-chip--button" onClick={() => setSelectedFolder(folder)}>
                  <Plus size={12} aria-hidden="true" />
                  <span>{folderDisplayName(folder)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
