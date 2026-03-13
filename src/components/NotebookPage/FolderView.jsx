import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, BookOpen, Loader, FileText, Upload, Clock, Sparkles, Play, CheckCircle, RotateCcw, File, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import './FolderView.css';

const FolderView = ({ folderName, onClose, onOpenNotebook, onSourcesChanged, onStartLesson, onOpenDocument }) => {
  const { token } = useAuth();
  const fileInputRef = useRef(null);

  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  const [lessonState, setLessonState] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchSources();
    fetchLessonState();
  }, [folderName, token]);

  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch {}
    setLoading(false);
  };

  const fetchLessonState = async () => {
    setLessonLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setLessonState(data);
      }
    } catch {}
    setLessonLoading(false);
  };

  const handleGenerateOutline = async () => {
    setGenerating(true);
    try {
      await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/embed`, {
        method: 'POST',
        headers: headers(),
      });
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/outline`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        await fetchLessonState();
      }
    } catch {}
    setGenerating(false);
  };

  const handleResetLesson = async () => {
    try {
      await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson/reset`, {
        method: 'POST',
        headers: headers(),
      });
      await fetchLessonState();
    } catch {}
  };

  const handleUploadToFolder = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        await fetchSources();
        if (onSourcesChanged) onSourcesChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Upload failed');
      }
    } catch {
      alert('Upload failed. Please try again.');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteSource = async (src, e) => {
    e.stopPropagation();
    if (!confirm(`Remove "${src.title}" from this folder?`)) return;
    try {
      await fetch(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources/${encodeURIComponent(src.source_id)}`,
        { method: 'DELETE', headers: headers() },
      );
      await fetchSources();
      if (onSourcesChanged) onSourcesChanged();
    } catch {}
  };

  const handleOpenSource = async (src) => {
    if (src.type !== 'notebook') return;
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/notebooks`, { headers: headers() });
      if (res.ok) {
        const notebooks = await res.json();
        const full = notebooks.find(nb => nb.id === src.notebook_id);
        if (full) {
          onOpenNotebook(full);
          return;
        }
      }
    } catch {}
    onOpenNotebook({ id: src.notebook_id, _saved_id: src.saved_id, title: src.title });
  };

  const docSources = sources.filter(s => s.type === 'document');
  const nbSources = sources.filter(s => s.type === 'notebook');

  const totalMinutes = lessonState?.estimated_minutes || 0;
  const hasOutline = lessonState?.has_outline;
  const isComplete = lessonState?.is_complete;
  const currentSection = lessonState?.current_section || 0;
  const totalSections = lessonState?.total_sections || 0;
  const sections = lessonState?.sections || [];
  const progressPercent = lessonState?.progress_percent || 0;
  const isInProgress = hasOutline && currentSection > 0 && !isComplete;

  return (
    <div className="fv-container">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.pptx"
        onChange={handleUploadToFolder}
      />

      <div className="fv-header">
        <button className="fv-back-btn" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Back to Library</span>
        </button>
        <div className="fv-header-info">
          <h1 className="fv-title">{folderName}</h1>
          <span className="fv-subtitle">
            {sources.length} source{sources.length !== 1 ? 's' : ''}
            {totalMinutes > 0 && ` · ~${totalMinutes} min`}
          </span>
        </div>
      </div>

      <div className="fv-body">
        {/* Left: Curated Content */}
        <div className="fv-left">
          <div className="fv-sources-section">
            <div className="fv-section-header">
              <h2 className="fv-section-title">Curated content for this deep dive</h2>
            </div>

            <div className="fv-content-group">
              <h3 className="fv-content-group-title">
                <FileText size={15} />
                Documents
              </h3>
              {loading ? (
                <div className="fv-loading"><Loader size={18} className="spinning" /> Loading...</div>
              ) : (docSources.length === 0 && nbSources.length === 0) ? (
                <div className="fv-empty">
                  <p>No sources yet. Upload your first lecture to get started.</p>
                </div>
              ) : (
                <div className="fv-source-list">
                  {docSources.map(src => (
                    <div
                      key={src.source_id || src.notebook_id}
                      className="fv-source-card fv-source-doc"
                      onClick={() => onOpenDocument && onOpenDocument(src)}
                    >
                      <div className="fv-source-icon fv-source-icon-doc">
                        <File size={16} />
                      </div>
                      <div className="fv-source-info">
                        <span className="fv-source-title">{src.title}</span>
                        <span className="fv-source-meta">
                          {src.source_type?.toUpperCase()} · {src.page_count} page{src.page_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        className="fv-source-delete"
                        onClick={(e) => handleDeleteSource(src, e)}
                        title="Remove source"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {nbSources.map(src => (
                    <div
                      key={src.notebook_id}
                      className="fv-source-card fv-source-nb"
                      onClick={() => handleOpenSource(src)}
                    >
                      <div className="fv-source-icon">
                        <BookOpen size={16} />
                      </div>
                      <div className="fv-source-info">
                        <span className="fv-source-title">{src.title}</span>
                        <span className="fv-source-meta">
                          Study Guide · {src.section_count} section{src.section_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="fv-content-group fv-content-group-disabled">
              <h3 className="fv-content-group-title">
                <Play size={15} />
                Videos
              </h3>
              <div className="fv-coming-soon">Coming soon</div>
            </div>

            <button
              className="fv-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader size={16} className="spinning" /> : <Upload size={16} />}
              <span>{uploading ? 'Uploading...' : 'Upload Source'}</span>
            </button>
          </div>
        </div>

        {/* Right: Deep Dive Lesson Card */}
        <div className="fv-right">
          <div className="fv-lesson-card">
            <div className="fv-lesson-header">
              <Sparkles size={20} />
              <h2 className="fv-lesson-title">Deep Dive Lesson</h2>
            </div>

            {lessonLoading ? (
              <div className="fv-lesson-loading">
                <Loader size={22} className="spinning" />
                <span>Loading lesson...</span>
              </div>
            ) : !hasOutline ? (
              <div className="fv-lesson-empty">
                <div className="fv-lesson-empty-icon">
                  <Sparkles size={36} />
                </div>
                <h3>Your personalized lesson awaits</h3>
                <p>
                  Pedro will analyze all your sources and create a structured lesson
                  tailored to help you master this material. He'll guide you section
                  by section, asking questions along the way.
                </p>
                <button
                  className="fv-lesson-generate-btn"
                  onClick={handleGenerateOutline}
                  disabled={generating || sources.length === 0}
                >
                  {generating ? (
                    <>
                      <Loader size={18} className="spinning" />
                      <span>Generating lesson plan...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>Generate Lesson</span>
                    </>
                  )}
                </button>
                {sources.length === 0 && (
                  <p className="fv-lesson-hint">Add at least one source to generate a lesson.</p>
                )}
              </div>
            ) : isComplete ? (
              <div className="fv-lesson-complete">
                <div className="fv-lesson-complete-icon">
                  <CheckCircle size={40} />
                </div>
                <h3>Lesson Complete!</h3>
                <p>You've completed all {totalSections} sections. Great work!</p>
                <div className="fv-lesson-complete-actions">
                  <button className="fv-lesson-restart-btn" onClick={handleResetLesson}>
                    <RotateCcw size={16} />
                    <span>Start Over</span>
                  </button>
                  <button
                    className="fv-lesson-generate-btn"
                    onClick={handleGenerateOutline}
                    disabled={generating}
                  >
                    <Sparkles size={16} />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="fv-lesson-outline">
                {isInProgress && (
                  <div className="fv-lesson-progress">
                    <div className="fv-lesson-progress-info">
                      <span>Section {currentSection} of {totalSections}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="fv-lesson-progress-bar">
                      <div
                        className="fv-lesson-progress-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="fv-lesson-sections">
                  {sections.map((sec, i) => {
                    const done = i < currentSection;
                    const current = i === currentSection;
                    return (
                      <div key={i} className={`fv-lesson-section-item ${done ? 'done' : current ? 'current' : 'upcoming'}`}>
                        <div className="fv-lesson-section-marker">
                          {done ? <CheckCircle size={16} /> : <span className="fv-lesson-section-num">{i + 1}</span>}
                        </div>
                        <div className="fv-lesson-section-info">
                          <span className="fv-lesson-section-name">{sec.title}</span>
                          <span className="fv-lesson-section-meta">
                            <Clock size={12} />
                            ~{sec.estimated_minutes || 20} min
                            {sec.learning_objectives?.length > 0 && ` · ${sec.learning_objectives.length} objectives`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="fv-lesson-actions">
                  <button
                    className="fv-lesson-start-btn"
                    onClick={() => onStartLesson && onStartLesson(folderName)}
                  >
                    <Play size={18} />
                    <span>{isInProgress ? 'Continue Lesson' : 'Start Lesson'}</span>
                  </button>
                  <div className="fv-lesson-meta-row">
                    <span className="fv-lesson-total-time">
                      <Clock size={13} />
                      ~{totalMinutes} min total
                    </span>
                    <button className="fv-lesson-regen-btn" onClick={handleGenerateOutline} disabled={generating}>
                      {generating ? <Loader size={13} className="spinning" /> : <RotateCcw size={13} />}
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FolderView;
