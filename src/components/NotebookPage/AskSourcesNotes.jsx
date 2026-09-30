import { useEffect, useRef } from 'react';
import { StickyNote, X } from 'lucide-react';
import { useAuth } from '../../context/authState';
import { useLessonNotes } from '../../utils/useLessonNotes';
import RichNotesEditor from './RichNotesEditor';

export default function AskSourcesNotes({ id, folderName, onClose }) {
  const { token, user } = useAuth();
  const note = useLessonNotes(user?.id, folderName, token);
  const closeRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  return <aside id={id} className="ask-notes-panel" aria-label={`Notes for ${folderName}`}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="ask-notes-header">
      <div className="ask-notes-heading">
        <h3><StickyNote size={18} />My Notes</h3>
        <p title={folderName}>{folderName}</p>
      </div>
      <span className="ask-notes-status" role="status">
        {note.saving ? 'Saving…' : note.error ? 'Not saved' : note.dirty ? 'Unsaved changes' : note.loaded ? 'Saved' : 'Loading…'}
      </span>
      <button ref={closeRef} type="button" className="ask-notes-close" aria-label="Close lesson notes" onClick={onClose}><X size={18} /></button>
    </header>
    {note.error && <div className="ask-notes-error" role="alert">
      <span>{note.error}</span>
      <button type="button" onClick={note.retry}>Retry {note.loaded ? 'save' : 'loading'}</button>
    </div>}
    <RichNotesEditor contentHtml={note.html} readOnly={!note.loaded} onChange={note.change}
      showExport exportTitle={`${folderName} — Notes`}
      exportFilename={`coast-notes-${folderName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`}
      placeholder="Write your notes… Paste anything useful from Pedro." />
    <p className="ask-notes-footer">Shared with this lesson and your Notes library. Saves automatically.</p>
  </aside>;
}
