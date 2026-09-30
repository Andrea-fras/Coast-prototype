import { useAuth } from '../../context/authState';
import { mapNoteImages } from '../../utils/sourceImageAccess';
import { sanitizeNotes } from '../../utils/sanitizeNotes';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered, Heading2,
  RotateCcw, Download,
} from 'lucide-react';
import {
  handleNotesDrop,
  handleNotesPaste,
  buildExportHtml,
  downloadNotesFile,
} from '../../utils/notesEditor';
import './RichNotesEditor.css';
import '../../utils/notesHighlights.css';

const HIGHLIGHTS = [
  { color: '#fef08a', name: 'yellow', className: 'notes-swatch--yellow' },
  { color: '#bbf7d0', name: 'green', className: 'notes-swatch--green' },
  { color: '#fbcfe8', name: 'pink', className: 'notes-swatch--pink' },
  { color: '#bfdbfe', name: 'blue', className: 'notes-swatch--blue' },
];

export default function RichNotesEditor({
  contentHtml = '',
  onChange,
  onInput,
  placeholder = 'Start typing your notes…',
  showExport = false,
  exportTitle = 'My Notes',
  exportFilename = 'coast-notes.html',
  className = '',
  editorClassName = '',
  autoFocus = false,
  readOnly = false,
}) {
  const { imageAccess, token } = useAuth();
  const [exportError, setExportError] = useState('');
  const editorRef = useRef(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (!editorRef.current) return;
    const safeHtml = mapNoteImages(sanitizeNotes(contentHtml), imageAccess);
    if (editorRef.current.innerHTML !== safeHtml) {
      editorRef.current.innerHTML = safeHtml;
    }
  }, [contentHtml, imageAccess]);

  useEffect(() => {
    if (autoFocus && editorRef.current) editorRef.current.focus();
  }, [autoFocus]);

  const notifyChange = useCallback(() => {
    if (readOnly || !editorRef.current) return;
    const html = sanitizeNotes(editorRef.current.innerHTML);
    onInput?.(html);
    onChange?.(html);
  }, [onChange, onInput, readOnly]);

  const applyFormat = (command, value = null) => {
    if (readOnly || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    notifyChange();
  };

  const applySize = (sizeClass) => {
    if (readOnly || !editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const span = document.createElement('span');
      span.className = sizeClass;
      try {
        range.surroundContents(span);
      } catch {
        applyFormat('fontSize', sizeClass === 'notes-size-sm' ? '2' : sizeClass === 'notes-size-lg' ? '5' : '3');
        notifyChange();
        return;
      }
      sel.removeAllRanges();
    } else {
      applyFormat('fontSize', sizeClass === 'notes-size-sm' ? '2' : sizeClass === 'notes-size-lg' ? '5' : '3');
    }
    notifyChange();
  };

  const handleExport = async () => {
    setExportError('');
    const html = editorRef.current?.innerHTML || contentHtml || '';
    try {
      await downloadNotesFile(exportFilename, buildExportHtml({ title: exportTitle, bodyHtml: html }), token);
    } catch (err) { setExportError(err.message); }
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    if (readOnly) return;
    dragDepthRef.current += 1;
    editorRef.current?.classList.add('notes-editor--dragover');
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      editorRef.current?.classList.remove('notes-editor--dragover');
    }
  };

  const onDrop = (e) => {
    dragDepthRef.current = 0;
    editorRef.current?.classList.remove('notes-editor--dragover');
    if (readOnly) { e.preventDefault(); return; }
    handleNotesDrop(e, notifyChange);
  };

  return (
    <div className={`rich-notes ${className}`}>
      {exportError && <p role="alert">{exportError}</p>}
      <div className="rich-notes-toolbar" role="toolbar" aria-label="Note formatting">
        <button type="button" disabled={readOnly} className="rich-notes-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('bold')} title="Bold">
          <Bold size={14} />
        </button>
        <button type="button" disabled={readOnly} className="rich-notes-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('italic')} title="Italic">
          <Italic size={14} />
        </button>
        <button type="button" disabled={readOnly} className="rich-notes-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('underline')} title="Underline">
          <Underline size={14} />
        </button>
        <span className="rich-notes-divider" aria-hidden />
        <button type="button" disabled={readOnly} className="rich-notes-tool rich-notes-tool--size-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => applySize('notes-size-sm')} title="Small text">A</button>
        <button type="button" disabled={readOnly} className="rich-notes-tool rich-notes-tool--size-md" onMouseDown={(e) => e.preventDefault()} onClick={() => applySize('notes-size-md')} title="Normal text">A</button>
        <button type="button" disabled={readOnly} className="rich-notes-tool rich-notes-tool--size-lg" onMouseDown={(e) => e.preventDefault()} onClick={() => applySize('notes-size-lg')} title="Large text">A</button>
        <span className="rich-notes-divider" aria-hidden />
        <button type="button" disabled={readOnly} className="rich-notes-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('formatBlock', 'h2')} title="Heading">
          <Heading2 size={14} />
        </button>
        <button type="button" disabled={readOnly} className="rich-notes-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('insertUnorderedList')} title="Bullet list">
          <List size={14} />
        </button>
        <button type="button" disabled={readOnly} className="rich-notes-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('insertOrderedList')} title="Numbered list">
          <ListOrdered size={14} />
        </button>
        <span className="rich-notes-divider" aria-hidden />
        {HIGHLIGHTS.map(({ color, name, className: swatchClass }) => (
          <button
            key={color}
            type="button"
            disabled={readOnly} className={`rich-notes-swatch ${swatchClass}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('hiliteColor', color)}
            title={`Highlight ${name}`}
            aria-label={`Highlight ${name}`}
          />
        ))}
        <button type="button" disabled={readOnly} className="rich-notes-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('removeFormat')} title="Clear formatting">
          <RotateCcw size={13} />
        </button>
        {showExport && (
          <>
            <span className="rich-notes-divider" aria-hidden />
            <button type="button" className="rich-notes-tool rich-notes-tool--export" onMouseDown={(e) => e.preventDefault()} onClick={handleExport} title="Export notes">
              <Download size={14} />
              <span>Export</span>
            </button>
          </>
        )}
      </div>
      <div
        ref={editorRef}
        className={`rich-notes-editor notes-content ${editorClassName}`}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={notifyChange}
        onPaste={(e) => readOnly ? e.preventDefault() : handleNotesPaste(e, notifyChange)}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-placeholder={placeholder}
      />
    </div>
  );
}
