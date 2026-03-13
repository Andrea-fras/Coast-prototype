import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, FileText, Loader, Sparkles, CheckCircle, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import './DocumentViewer.css';

const DocumentViewer = ({ folderName, source, onClose, onNotebookGenerated }) => {
  const { token } = useAuth();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [genDone, setGenDone] = useState(false);

  useEffect(() => {
    loadPdf();
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [source.source_id]);

  const loadPdf = async () => {
    setLoadingPdf(true);
    try {
      const res = await fetch(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources/${encodeURIComponent(source.source_id)}/file`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const blob = await res.blob();
        setPdfUrl(URL.createObjectURL(blob));
      }
    } catch {}
    setLoadingPdf(false);
  };

  const handleGenerateNotebook = async () => {
    setGenerating(true);
    setGenProgress('Starting notebook generation...');
    setGenDone(false);
    try {
      const res = await fetch(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources/${encodeURIComponent(source.source_id)}/generate-notebook`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let generatedNotebook = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.message) setGenProgress(evt.message);
            if (evt.stage === 'done') {
              generatedNotebook = evt.notebook;
              setGenDone(true);
              setGenProgress('Study guide generated!');
            }
            if (evt.stage === 'error') {
              setGenProgress('Error: ' + (evt.message || 'Generation failed'));
            }
          } catch {}
        }
      }

      if (generatedNotebook && onNotebookGenerated) {
        onNotebookGenerated(generatedNotebook);
      }
    } catch {
      setGenProgress('Generation failed. Please try again.');
    }
    setGenerating(false);
  };

  const isPdf = source.source_type === 'pdf';

  return (
    <div className="docview-container">
      <div className="docview-header">
        <button className="docview-back-btn" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Back to Folder</span>
        </button>
        <div className="docview-header-info">
          <FileText size={20} />
          <div>
            <h1 className="docview-title">{source.title}</h1>
            <span className="docview-meta">
              {source.source_type?.toUpperCase()} · {source.page_count} page{source.page_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="docview-body">
        <div className="docview-pdf-area">
          {loadingPdf ? (
            <div className="docview-loading">
              <Loader size={28} className="spinning" />
              <span>Loading document...</span>
            </div>
          ) : pdfUrl && isPdf ? (
            <iframe
              src={pdfUrl}
              className="docview-iframe"
              title={source.title}
            />
          ) : pdfUrl ? (
            <div className="docview-no-preview">
              <FileText size={48} />
              <p>Preview not available for {source.source_type?.toUpperCase()} files.</p>
              <a href={pdfUrl} download={source.filename} className="docview-download-btn">
                <Download size={16} />
                Download File
              </a>
            </div>
          ) : (
            <div className="docview-no-preview">
              <FileText size={48} />
              <p>File not available. It may have been uploaded before file storage was enabled.</p>
            </div>
          )}
        </div>

        <div className="docview-sidebar">
          <div className="docview-action-card">
            <Sparkles size={22} className="docview-action-icon" />
            <h3>Generate Study Guide</h3>
            <p>
              Turn this document into a comprehensive, interactive study guide
              with structured sections, key concepts, and practice questions.
            </p>
            {genDone ? (
              <div className="docview-gen-done">
                <CheckCircle size={18} />
                <span>{genProgress}</span>
              </div>
            ) : (
              <button
                className="docview-gen-btn"
                onClick={handleGenerateNotebook}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader size={16} className="spinning" />
                    <span>{genProgress}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Generate Study Guide</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="docview-info-card">
            <h4>Document Info</h4>
            <div className="docview-info-row">
              <span>Filename</span>
              <span>{source.filename}</span>
            </div>
            <div className="docview-info-row">
              <span>Type</span>
              <span>{source.source_type?.toUpperCase()}</span>
            </div>
            <div className="docview-info-row">
              <span>Pages</span>
              <span>{source.page_count}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
