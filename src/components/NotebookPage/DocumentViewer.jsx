import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Loader, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import './DocumentViewer.css';

const DocumentViewer = ({ folderName, source, onClose }) => {
  const { token } = useAuth();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(true);

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
    } catch { /* ignore */ }
    setLoadingPdf(false);
  };

  const isPdf = source.source_type === 'pdf';

  return (
    <div className="docview-container">
      <div className="docview-header">
        <button type="button" className="docview-back-btn" onClick={onClose}>
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

      <div className="docview-body docview-body-full">
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
              <p>File not available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
