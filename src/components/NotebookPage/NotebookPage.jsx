import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Paperclip, ArrowRight, ArrowLeft, BookOpen, Upload, FileText, Loader, CheckCircle, AlertCircle, PenLine, Search, Trash2, Sun, Moon, Layers, ChevronLeft, ChevronRight, RotateCcw, Shuffle, Download, GitBranch, Maximize2, Minimize2, FolderPlus, Folder, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import './NotebookPage.css';
import builtInNotebooks from '../../data/notebooks.json';
import paper1 from '../../data/samplePaper.json';
import paper2 from '../../data/paper2.json';
import paper3 from '../../data/paper3.json';
import paper4 from '../../data/cell_bio.json';
import mascot from '../../assets/sessioncompletebird.svg';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Play } from 'lucide-react';
import PedroMessage from '../PedroMessage';
import ExerciseWidget from './ExerciseWidget';
import MindMap from './MindMap';
import FolderView from './FolderView';
import LessonView from './LessonView';
import DocumentViewer from './DocumentViewer';

const VIZ_MAP = {};

const DEMO_VIZ = {
  nb_qm: [
    {
      topic: "Fourier Series Approximation",
      description: "Watch how adding sine waves of increasing frequency progressively builds a perfect square wave — demonstrating how any periodic function can be decomposed into simple harmonics.",
      url: "/viz/fourier.gif",
      filename: "fourier.gif",
    },
  ],
  "parallel-programming-guide": [
    {
      topic: "Amdahl's Law — The Scalability Ceiling",
      description: "See how the maximum speedup from adding processors depends on the parallelisable fraction (p). With p=0.5 you cap at 2×, with p=0.95 at 20×. Even a tiny serial fraction dominates at scale — this is why optimizing the serial bottleneck matters more than adding cores.",
      url: "/viz/amdahl.gif",
      filename: "amdahl.gif",
    },
    {
      topic: "Fork-Join Model (OpenMP)",
      description: "Watch a single Master thread fork into 4 parallel workers, each processing a task with progress bars, then joining back together. This is exactly how #pragma omp parallel works under the hood.",
      url: "/viz/fork_join.gif",
      filename: "fork_join.gif",
    },
    {
      topic: "The Deadlock Trap (MPI Blocking Sends)",
      description: "Two processes each hold a lock the other needs, creating a circular wait — the 'Mexican Standoff for CPUs.' See why all four Coffman conditions must be present and how breaking any one prevents deadlock.",
      url: "/viz/deadlock.gif",
      filename: "deadlock.gif",
    },
    {
      topic: "Race Condition (Shared Variable Bug)",
      description: "Step-by-step: two threads both read count=0, both compute 0+1=1, both write 1. Expected: 2. Got: 1. This is why read-modify-write on shared variables without synchronization is the #1 source of parallel bugs.",
      url: "/viz/race_condition.gif",
      filename: "race_condition.gif",
    },
  ],
};

import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';

// Map paper IDs to data (for built-in notebooks)
const paperMap = {
  'qm3_2024': paper1,
  'econ_101': paper2,
  'stats_201': paper3,
  'cell_bio_101': paper4
};

const NotebookPage = ({ onClose, onStartQuestions }) => {
  const { token, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [selectedNotebook, setSelectedNotebook] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [visibleSections, setVisibleSections] = useState(0);
  const [showPracticeBtn, setShowPracticeBtn] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const notesRef = useRef(null);
  const contentRef = useRef(null);
  

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef(null);
  const explainHandlerRef = useRef(null);

  // Highlight & Ask Pedro state
  const [selectionTooltip, setSelectionTooltip] = useState(null);
  const [chatExpanded, setChatExpanded] = useState(false);

  const textColors = [
    '#333333', '#FFB503', '#FF7B02', '#e74c3c', '#2ECC71',
    '#3498db', '#9B59B6', '#1abc9c', '#e67e22', '#555555',
  ];

  // Upload state
  const [myNotebooks, setMyNotebooks] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadInstructions, setUploadInstructions] = useState('');
  const fileInputRef = useRef(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  // Search & sidebar state
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState('notebooks');
  const nbTipKey = `coast_nb_tip_dismissed_${user?.id || ''}`;
  const [showNbTip, setShowNbTip] = useState(() => !localStorage.getItem(nbTipKey));

  // Folder state
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderMenuOpen, setFolderMenuOpen] = useState(null);
  const [activeLessonFolder, setActiveLessonFolder] = useState(null);
  const [activeDocument, setActiveDocument] = useState(null);

  // Visualization state
  const [expandedViz, setExpandedViz] = useState(null);
  const [vizLoading, setVizLoading] = useState(false);
  const [vizProgress, setVizProgress] = useState(0);
  const [vizNoResults, setVizNoResults] = useState({});
  const [sectionViz, setSectionViz] = useState(() => {
    try {
      const saved = localStorage.getItem('coast_section_viz');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [sectionVizLoading, setSectionVizLoading] = useState({});
  const [exerciseOpen, setExerciseOpen] = useState({});
  const [exercisePortals, setExercisePortals] = useState([]);
  const [showConceptMap, setShowConceptMap] = useState(false);
  const [notebookViz, setNotebookViz] = useState(() => {
    try {
      const saved = localStorage.getItem('coast_notebook_viz');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Flashcard state
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [flashcards, setFlashcards] = useState([]);
  const [fcIndex, setFcIndex] = useState(0);
  const [fcFlipped, setFcFlipped] = useState(false);
  const [fcShuffled, setFcShuffled] = useState(false);

  // Usage / rate limit state
  const [notebooksRemaining, setNotebooksRemaining] = useState(null);

  const uid = user?.id || 'anon';

  // Persist viz caches to localStorage
  useEffect(() => {
    try { localStorage.setItem('coast_notebook_viz', JSON.stringify(notebookViz)); } catch {}
  }, [notebookViz]);
  useEffect(() => {
    try { localStorage.setItem('coast_section_viz', JSON.stringify(sectionViz)); } catch {}
  }, [sectionViz]);

  // Load user's generated notebooks + usage on mount
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/notebooks`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => setMyNotebooks(data))
      .catch(() => {});

    fetch(`${API_URL}/api/usage`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setNotebooksRemaining(data.notebooks_remaining); })
      .catch(() => {});

    fetch(`${API_URL}/api/notebooks/folders`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => setFolders(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  // Split notebooks into built-in vs user-generated
  const backendIds = new Set(myNotebooks.map(n => n.id));
  const builtInList = builtInNotebooks.filter(b => !backendIds.has(b.id));
  const generatedList = myNotebooks;

  // Active list based on sidebar tab
  const activeList = sidebarTab === 'yours' ? generatedList : builtInList;

  // Filter by search
  const visibleNotebooks = activeList.filter(nb => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(nb.title || '').toLowerCase().includes(q) && !(nb.course || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // allNotebooks still needed for detail view dedup
  const allNotebooks = [...builtInList, ...generatedList];

  // Close color picker on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
    };
    if (showColorPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColorPicker]);

  // Close folder menu on outside click
  useEffect(() => {
    if (folderMenuOpen == null) return;
    const handleClick = () => setFolderMenuOpen(null);
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [folderMenuOpen]);

  // Reset state when opening a notebook
  const openNotebook = (nb) => {
    const uid = user?.id || 'anon';
    const savedKey = `coast_nb_html_${uid}_${nb.id}`;
    const seenKey = `coast_nb_seen_${uid}`;
    const hasSavedEdits = !!localStorage.getItem(savedKey);

    let seenSet;
    try { seenSet = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { seenSet = new Set(); }
    const nbKey = String(nb._saved_id || nb.id);
    const hasBeenSeen = seenSet.has(nbKey) || !!nb._saved_id;

    seenSet.add(nbKey);
    try { localStorage.setItem(seenKey, JSON.stringify([...seenSet])); } catch {}

    setSelectedNotebook(nb);
    setChatMessages([]);
    setChatInput('');
    setHasUnsavedChanges(false);
    setIsEditing(false);
    setShowColorPicker(false);
    setConversationId(null);
    setIsChatLoading(false);

    if (hasSavedEdits || hasBeenSeen) {
      setIsGenerating(false);
      setVisibleSections(nb.sections?.length || 0);
      setShowPracticeBtn(true);
    } else {
      setIsGenerating(true);
      setVisibleSections(0);
      setShowPracticeBtn(false);
    }

    // Load existing chat history for this notebook
    if (token) {
      fetch(`${API_URL}/api/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.ok ? res.json() : [])
        .then(convos => {
          const match = convos.find(c => c.context_type === 'notebook' && c.context_id === nb.id);
          if (match) {
            setConversationId(match.conversation_id);
            return fetch(`${API_URL}/api/chat/history?conversation_id=${match.conversation_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          }
          return null;
        })
        .then(res => res?.ok ? res.json() : null)
        .then(messages => {
          if (messages && messages.length > 0) {
            setChatMessages(messages.map(m => {
              let text = m.content;
              if (m.role === 'user') {
                const contextIdx = text.indexOf('\n\nSection content:\n');
                if (contextIdx !== -1) text = text.slice(0, contextIdx);
              }
              return { role: m.role, text };
            }));
          }
        })
        .catch(() => {});
    }

    setVizLoading(false);
    setVizProgress(0);
  };

  // Restore saved HTML once the notebook is open and not generating, and auto-save after first render
  useEffect(() => {
    if (!selectedNotebook || isGenerating) return;
    const uid = user?.id || 'anon';
    const savedKey = `coast_nb_html_${uid}_${selectedNotebook.id}`;
    const savedHtml = localStorage.getItem(savedKey);
    let autoSaveTimer;

    if (savedHtml && contentRef.current) {
      const temp = document.createElement('div');
      temp.innerHTML = savedHtml;
      temp.querySelectorAll('.exercise-widget, .exercise-section-anchor, .exercise-portal').forEach(el => el.remove());
      contentRef.current.innerHTML = temp.innerHTML;
    } else if (contentRef.current) {
      autoSaveTimer = setTimeout(() => {
        if (contentRef.current) {
          const clone = contentRef.current.cloneNode(true);
          clone.querySelectorAll('.nb-explain-btn').forEach(b => b.remove());
          clone.querySelectorAll('.exercise-widget, .exercise-section-anchor, .exercise-portal').forEach(el => el.remove());
          try {
            localStorage.setItem(savedKey, clone.innerHTML);
          } catch {
            clone.querySelectorAll('img[src^="data:"]').forEach(img => img.setAttribute('src', ''));
            try { localStorage.setItem(savedKey, clone.innerHTML); } catch {}
          }
        }
      }, 500);
    }

    return () => { if (autoSaveTimer) clearTimeout(autoSaveTimer); };
  }, [isGenerating, selectedNotebook, user]);

  // Inject explain + visualize buttons into DOM
  useEffect(() => {
    if (!selectedNotebook || !contentRef.current || isGenerating) return;
    const timer = setTimeout(() => {
      const container = contentRef.current;
      if (!container) return;

      container.querySelectorAll('.nb-explain-btn').forEach(b => b.remove());
      container.querySelectorAll('.nb-section-viz-btn').forEach(b => b.remove());

      if (isEditing) return;

      const headings = container.querySelectorAll('h2.nb-section-title');
      headings.forEach((h2, idx) => {
        if (idx >= (selectedNotebook.sections?.length || 0)) return;
        let wrapper = h2.parentElement;
        if (!wrapper?.classList.contains('nb-section-title-row')) {
          wrapper = document.createElement('div');
          wrapper.className = 'nb-section-title-row';
          h2.parentNode.insertBefore(wrapper, h2);
          wrapper.appendChild(h2);
        }

        const btn = document.createElement('button');
        btn.className = 'nb-explain-btn';
        btn.setAttribute('data-section-idx', String(idx));
        btn.title = 'Ask Pedro to explain this section';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
        wrapper.appendChild(btn);

        const vizBtn = document.createElement('button');
        vizBtn.className = 'nb-section-viz-btn';
        vizBtn.setAttribute('data-section-idx', String(idx));
        vizBtn.title = 'Generate visual explanation for this section';
        vizBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        wrapper.appendChild(vizBtn);
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedNotebook, isGenerating, isEditing, visibleSections]);

  // Create portal containers inside each section for exercise widgets
  useEffect(() => {
    if (!selectedNotebook || !contentRef.current || isEditing || isGenerating) return;
    const timer = setTimeout(() => {
      const container = contentRef.current;
      if (!container) return;
      container.querySelectorAll('.exercise-portal').forEach(el => el.remove());
      const sections = container.querySelectorAll('.nb-section');
      const portals = [];
      sections.forEach((sectionEl, idx) => {
        if (idx >= (selectedNotebook.sections?.length || 0)) return;
        const portalDiv = document.createElement('div');
        portalDiv.className = 'exercise-portal';
        sectionEl.appendChild(portalDiv);
        portals.push({ idx, el: portalDiv });
      });
      setExercisePortals(portals);
    }, 200);
    return () => { clearTimeout(timer); setExercisePortals([]); };
  }, [selectedNotebook, isGenerating, isEditing, visibleSections]);

  // Event delegation for explain + visualize button clicks
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !selectedNotebook) return;

    const handler = (e) => {
      const explainBtn = e.target.closest('.nb-explain-btn');
      if (explainBtn) {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(explainBtn.getAttribute('data-section-idx'), 10);
        if (!isNaN(idx) && selectedNotebook.sections && idx < selectedNotebook.sections.length) {
          explainHandlerRef.current?.(selectedNotebook.sections[idx]);
        }
        return;
      }

      const vizBtn = e.target.closest('.nb-section-viz-btn');
      if (vizBtn) {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(vizBtn.getAttribute('data-section-idx'), 10);
        if (!isNaN(idx) && selectedNotebook.sections && idx < selectedNotebook.sections.length) {
          handleSectionViz(idx, selectedNotebook.sections[idx]);
        }
      }
    };

    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [selectedNotebook]);

  // Highlight & Ask Pedro — detect text selection in notebook
  useEffect(() => {
    const checkSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !contentRef.current || !notesRef.current) {
        setSelectionTooltip(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3 || text.length > 2000) {
        setSelectionTooltip(null);
        return;
      }
      if (!contentRef.current.contains(sel.anchorNode)) {
        setSelectionTooltip(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionTooltip({
        text,
        top: rect.top - 44,
        left: rect.left + rect.width / 2,
      });
    };

    const scrollWrap = notesRef.current;
    const handleMouseUp = () => setTimeout(checkSelection, 10);
    const handleMouseDown = (e) => {
      if (e.target.closest('.ask-pedro-tooltip')) return;
      setSelectionTooltip(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    if (scrollWrap) scrollWrap.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      if (scrollWrap) scrollWrap.removeEventListener('mousedown', handleMouseDown);
    };
  }, [selectedNotebook]);

  const sendChatMessage = async (userMsg) => {
    if (!userMsg.trim() || !selectedNotebook || isChatLoading) return;
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);

    setChatMessages(prev => [...prev, { role: 'pedro', text: '' }]);

    let res;
    try {
      res = await fetchWithRetry(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMsg,
          conversation_id: conversationId,
          context_type: 'notebook',
          context_id: selectedNotebook.id,
        }),
      });

      if (!res.ok) throw new Error('Failed');
    } catch {
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'pedro', text: "Connection error — please check your internet and try again." };
        return updated;
      });
      setIsChatLoading(false);
      return;
    }

    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.token) {
              fullText += evt.token;
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'pedro', text: fullText };
                return updated;
              });
            }
            if (evt.done && evt.conversation_id && !conversationId) {
              setConversationId(evt.conversation_id);
            }
          } catch {}
        }
      }

      if (!fullText) {
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'pedro', text: "Sorry, something went wrong. Please try again." };
          return updated;
        });
      }
    } catch {
      setChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.text) {
          updated[updated.length - 1] = { role: 'pedro', text: last.text + '\n\n*Connection interrupted — send your message again to continue.*' };
        } else {
          updated[updated.length - 1] = { role: 'pedro', text: "Connection lost mid-response. Please try again." };
        }
        return updated;
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleAskPedroAboutSelection = () => {
    if (!selectionTooltip?.text) return;
    const prompt = `Explain this to me from my notes: "${selectionTooltip.text}"`;
    setSelectionTooltip(null);
    window.getSelection()?.removeAllRanges();
    sendChatMessage(prompt);
  };

  const handleExportPdf = async () => {
    if (!contentRef.current || !selectedNotebook) return;
    const html2pdf = (await import('html2pdf.js')).default;
    const clone = contentRef.current.cloneNode(true);
    clone.querySelectorAll('.nb-explain-btn, .nb-section-viz-btn, .exercise-portal').forEach(el => el.remove());
    clone.style.padding = '2rem';
    clone.style.background = 'white';
    clone.style.color = '#222';
    const title = selectedNotebook.title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: `${title}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }).from(clone).save();
  };

  const saveNotebookHtml = () => {
    if (!selectedNotebook || !contentRef.current || !hasUnsavedChanges) return;
    const uid = user?.id || 'anon';
    const savedKey = `coast_nb_html_${uid}_${selectedNotebook.id}`;
    const clone = contentRef.current.cloneNode(true);
    clone.querySelectorAll('.nb-explain-btn').forEach(b => b.remove());
    clone.querySelectorAll('.exercise-widget, .exercise-section-anchor, .exercise-portal').forEach(el => el.remove());
    try {
      localStorage.setItem(savedKey, clone.innerHTML);
    } catch {
      clone.querySelectorAll('img[src^="data:"]').forEach(img => img.setAttribute('src', ''));
      try { localStorage.setItem(savedKey, clone.innerHTML); } catch {}
    }
    setHasUnsavedChanges(false);
  };

  const goBack = () => {
    saveNotebookHtml();
    setSelectedNotebook(null);
    setIsGenerating(false);
    setVisibleSections(0);
    setShowPracticeBtn(false);
    setChatMessages([]);
    setIsEditing(false);
    setShowColorPicker(false);
    setExpandedViz(null);
  };

  // Gradually reveal sections
  useEffect(() => {
    if (!selectedNotebook || !isGenerating) return;
    
    if (visibleSections < selectedNotebook.sections.length) {
      const timer = setTimeout(() => {
        setVisibleSections(prev => prev + 1);
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      setIsGenerating(false);
      setTimeout(() => setShowPracticeBtn(true), 500);
    }
  }, [visibleSections, selectedNotebook, isGenerating]);

  // Auto-scroll notes
  useEffect(() => {
    if (notesRef.current) {
      notesRef.current.scrollTop = notesRef.current.scrollHeight;
    }
  }, [visibleSections]);

  // Scroll chat
  const chatAreaRef = useRef(null);
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSectionViz = async (sectionIdx, section) => {
    if (!selectedNotebook) return;
    const nbId = String(selectedNotebook._saved_id || selectedNotebook.id);
    const vizKey = `${nbId}_section_${sectionIdx}`;

    if (sectionViz[vizKey] || sectionVizLoading[vizKey]) return;

    setSectionVizLoading(prev => ({ ...prev, [vizKey]: true }));

    try {
      const content = [
        section.content || '',
        ...(section.subsections || []).map(s => `${s.title}: ${s.content || ''}`),
      ].join('\n').slice(0, 1200);

      const res = await fetch(`${API_URL}/api/visualize/section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: section.title || 'Untitled', content }),
      });

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();

      if (data.skip) {
        setSectionViz(prev => ({ ...prev, [vizKey]: { skip: true, message: data.message } }));
      } else {
        setSectionViz(prev => ({
          ...prev,
          [vizKey]: {
            topic: data.topic,
            description: data.description,
            url: `${API_URL}${data.url}`,
            filename: data.filename,
          },
        }));
      }
    } catch {
      setSectionViz(prev => ({ ...prev, [vizKey]: { skip: true, message: 'Generation failed. Try again.' } }));
    } finally {
      setSectionVizLoading(prev => ({ ...prev, [vizKey]: false }));
    }
  };

  const handleGenerateViz = async () => {
    if (!selectedNotebook || vizLoading) return;
    const nb = selectedNotebook;
    const vizKey = String(nb._saved_id || nb.id);
    if (!nb.sections?.length) return;

    setVizLoading(true);
    setVizProgress(10);

    const simpleSections = nb.sections.map(s => ({
      title: s.title || '',
      content: (s.content || '').slice(0, 500),
    }));

    setVizProgress(20);

    try {
      const progressTimer = setInterval(() => {
        setVizProgress(prev => Math.min(prev + 5, 85));
      }, 3000);

      const res = await fetch(`${API_URL}/api/visualize/notebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebook_id: vizKey, sections: simpleSections }),
      });

      clearInterval(progressTimer);

      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setVizProgress(95);

      if (data?.visualizations?.length > 0) {
        setNotebookViz(prev => ({
          ...prev,
          [vizKey]: data.visualizations.map(v => ({
            ...v,
            url: `${API_URL}${v.url}`,
          })),
        }));
      } else {
        setVizNoResults(prev => ({ ...prev, [vizKey]: true }));
      }

      setVizProgress(100);
      setTimeout(() => {
        setVizLoading(false);
        setVizProgress(0);
      }, 600);
    } catch {
      setVizLoading(false);
      setVizProgress(0);
    }
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleExplainSection = (section) => {
    if (!selectedNotebook || isChatLoading) return;

    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<img[^>]*>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    };

    let sectionText = section.title;
    if (section.content) sectionText += ': ' + stripHtml(section.content);
    section.subsections?.forEach(sub => {
      sectionText += '\n' + sub.title + ': ' + stripHtml(sub.content);
      sub.bullets?.forEach(b => { sectionText += '\n- ' + stripHtml(b); });
    });

    const fullMsg = `Explain this section to me simply: "${section.title}"\n\nSection content:\n${sectionText.slice(0, 3000)}`;
    sendChatMessage(fullMsg);
  };

  explainHandlerRef.current = handleExplainSection;

  const handleAddToNotes = async (pedroMessage) => {
    if (!selectedNotebook || !contentRef.current) return;

    try {
      const res = await fetch(`${API_URL}/api/chat/add-note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pedro_message: pedroMessage,
          notebook_id: selectedNotebook.id,
        }),
      });

      if (!res.ok) throw new Error('Failed');

      const data = await res.json();
      const noteHtml = `
        <div class="pedro-note-block">
          <div class="pedro-note-header">
            <span class="pedro-note-icon">🐦</span>
            <span class="pedro-note-label">Pedro's Note</span>
          </div>
          <div class="pedro-note-content">${data.note_html}</div>
        </div>
      `;
      contentRef.current.insertAdjacentHTML('beforeend', noteHtml);
      setHasUnsavedChanges(true);
      notesRef.current.scrollTop = notesRef.current.scrollHeight;
    } catch {
      // Silently fail — user can try again
    }
  };

  // =================== FLASHCARDS ===================
  const stripHtml = (text) => {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  };

  const makeQuestion = (title, parentTitle) => {
    if (!title) return 'What is this concept?';
    const clean = title.replace(/\(.*?\)/g, '').trim();
    const lower = clean.toLowerCase();
    if (lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') || lower.startsWith('when') || lower.startsWith('which') || lower.endsWith('?')) {
      return clean;
    }
    if (lower.startsWith('the ')) {
      return `What is ${clean.charAt(0).toLowerCase() + clean.slice(1)}?`;
    }
    const contextHint = parentTitle ? ` (in the context of ${parentTitle.replace(/\(.*?\)/g, '').trim()})` : '';
    return `Explain: ${clean}${contextHint}`;
  };

  const generateFlashcards = (notebook) => {
    if (!notebook?.sections) return [];
    const cards = [];

    notebook.sections.forEach((section) => {
      const sectionName = section.title?.replace(/\(.*?\)/g, '').trim() || '';

      if (section.content) {
        const answer = stripHtml(section.content);
        if (answer.length > 15) {
          cards.push({
            front: `What is ${sectionName || 'this concept'} and why does it matter?`,
            back: answer,
            section: section.title,
          });
        }
      }

      section.subsections?.forEach((sub) => {
        if (sub.content) {
          const answer = stripHtml(sub.content);
          if (answer.length > 15) {
            cards.push({
              front: makeQuestion(sub.title, sectionName),
              back: answer,
              section: section.title,
            });
          }
        }
        sub.bullets?.forEach((bullet) => {
          const cleaned = stripHtml(bullet);
          if (cleaned && cleaned.length > 20) {
            const parts = cleaned.split(/[:–—→]/);
            if (parts.length >= 2 && parts[0].trim().length > 3 && parts.slice(1).join(':').trim().length > 10) {
              cards.push({
                front: `What does "${parts[0].trim()}" mean?`,
                back: parts.slice(1).join(':').trim(),
                section: section.title,
              });
            }
          }
        });
      });
    });

    return cards;
  };

  const handleOpenFlashcards = () => {
    if (!selectedNotebook) return;
    const cards = generateFlashcards(selectedNotebook);
    if (cards.length === 0) return;
    setFlashcards(cards);
    setFcIndex(0);
    setFcFlipped(false);
    setFcShuffled(false);
    setShowFlashcards(true);
  };

  const handleShuffleFlashcards = () => {
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setFcIndex(0);
    setFcFlipped(false);
    setFcShuffled(true);
  };

  const handleResetFlashcards = () => {
    if (!selectedNotebook) return;
    const cards = generateFlashcards(selectedNotebook);
    setFlashcards(cards);
    setFcIndex(0);
    setFcFlipped(false);
    setFcShuffled(false);
  };

  const handlePractice = () => {
    if (!selectedNotebook) return;
    
    // Option 1: Notebook has embedded matched questions (from pipeline)
    if (selectedNotebook.matchedQuestions && selectedNotebook.matchedQuestions.length > 0) {
      const matchedPaper = {
        id: `${selectedNotebook.id}_practice`,
        title: `${selectedNotebook.title} — Practice`,
        description: `Questions matched to ${selectedNotebook.course}`,
        questions: selectedNotebook.matchedQuestions,
      };
      onStartQuestions(matchedPaper);
      return;
    }
    
    // Option 2: Notebook references a full paper via paperId
    const paperData = paperMap[selectedNotebook.paperId];
    if (paperData) {
      onStartQuestions(paperData);
    }
  };

  // =================== UPLOAD LOGIC ===================

  const handleUploadClick = () => {
    setShowUploadModal(true);
    setUploadError('');
    setUploadInstructions('');
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const abortControllerRef = useRef(null);

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setUploadProgress('');
    setUploadError('');
    setShowUploadModal(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || isUploading) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUploading(true);
    setUploadError('');
    setUploadProgress('Uploading file...');
    setUploadStage('uploading');
    setUploadPercent(0);

    const formData = new FormData();
    formData.append('file', file);
    if (uploadInstructions.trim()) {
      formData.append('instructions', uploadInstructions.trim());
    }
    formData.append('provider', 'openai');
    formData.append('detail', 'low');

    try {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/generate-notes`, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      if (response.status === 429) {
        const err = await response.json().catch(() => ({}));
        setNotebooksRemaining(0);
        throw new Error(err.detail || "You've reached your notebook upload limit.");
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Server error' }));
        throw new Error(err.detail || `Server returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let notebook = null;

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
            setUploadStage(evt.stage);
            if (evt.message) setUploadProgress(evt.message);

            if (evt.stage === 'analyzing' && evt.total > 0) {
              setUploadPercent(Math.round((evt.current / evt.total) * 80) + 10);
            } else if (evt.stage === 'extracting' || evt.stage === 'loaded') {
              setUploadPercent(5);
            } else if (evt.stage === 'merging') {
              setUploadPercent(90);
            } else if (evt.stage === 'matching') {
              setUploadPercent(95);
            }

            if (evt.stage === 'done') {
              notebook = evt.notebook;
              setUploadPercent(100);
            }
            if (evt.stage === 'error') {
              throw new Error(evt.message || 'Pipeline error');
            }
          } catch (parseErr) {
            if (parseErr.message && parseErr.message.includes('Pipeline error')) throw parseErr;
            if (parseErr.message && !parseErr.message.startsWith('Unexpected token') && parseErr.message !== 'Unexpected end of JSON input') throw parseErr;
            continue;
          }
        }
      }

      if (!notebook) throw new Error('No notebook received from server.');

      // Re-fetch from backend to get the authoritative list (avoids duplicates)
      if (token) {
        fetch(`${API_URL}/api/notebooks`, { headers: { Authorization: `Bearer ${token}` } })
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (data) setMyNotebooks(data); })
          .catch(() => {
            setMyNotebooks(prev => {
              const savedId = notebook._saved_id;
              if (savedId && prev.some(n => n._saved_id === savedId)) return prev;
              return [...prev, notebook];
            });
          });
      } else {
        setMyNotebooks(prev => [...prev, notebook]);
      }
      setNotebooksRemaining(prev => prev !== null ? Math.max(0, prev - 1) : null);

      setUploadProgress('');
      setUploadStage('');
      setUploadPercent(0);
      setIsUploading(false);
      setShowUploadModal(false);
      abortControllerRef.current = null;
      setFileInputKey(k => k + 1);

      openNotebook(notebook);

    } catch (err) {
      if (err.name === 'AbortError') return;
      setUploadError(err.message || 'Failed to generate notes. Make sure the backend server is running.');
      setUploadProgress('');
      setUploadStage('');
      setUploadPercent(0);
      setIsUploading(false);
      setFileInputKey(k => k + 1);
    }
  };

  const handleDeleteGenerated = async (nb, e) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent?.stopImmediatePropagation?.();
    if (!token) return;

    let savedId = nb._saved_id;
    if (savedId == null) {
      const match = myNotebooks.find(n => n.id === nb.id && n._saved_id != null);
      if (match) savedId = match._saved_id;
    }
    if (savedId == null && nb.id != null) {
      const matchById = myNotebooks.find(n => String(n._saved_id) === String(nb.id));
      if (matchById) savedId = matchById._saved_id;
    }

    const slug = nb.id;

    // Optimistically remove from UI immediately
    setMyNotebooks(prev => prev.filter(n => !(n._saved_id === savedId || (savedId == null && n.id === slug))));
    localStorage.removeItem(`coast_nb_html_${uid}_${slug}`);

    if (selectedNotebook && (selectedNotebook._saved_id === savedId || selectedNotebook.id === slug)) {
      setSelectedNotebook(null);
    }

    if (savedId == null) return;

    try {
      const res = await fetch(`${API_URL}/api/notebooks/${savedId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      // Re-sync with backend regardless of outcome
      const refetch = await fetch(`${API_URL}/api/notebooks`, { headers: { Authorization: `Bearer ${token}` } });
      if (refetch.ok) {
        setMyNotebooks(await refetch.json());
      }
      if (res.ok) {
        setNotebooksRemaining(prev => prev !== null ? prev + 1 : null);
      }
    } catch (err) {
      console.error('[delete] error:', err);
      const refetch = await fetch(`${API_URL}/api/notebooks`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (refetch?.ok) setMyNotebooks(await refetch.json());
    }
  };

  // =================== FOLDER MANAGEMENT ===================
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/notebooks/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setFolders(prev => [...prev, name]);
        setNewFolderName('');
        setShowNewFolderInput(false);
      }
    } catch {}
  };

  const handleOpenFolder = (folderName) => {
    setSelectedFolder(folderName);
    setSelectedNotebook(null);
  };

  const handleMoveToFolder = async (nb, folderName) => {
    if (!token) return;
    const savedId = nb._saved_id || myNotebooks.find(n => n.id === nb.id)?._saved_id;
    if (!savedId) return;
    try {
      await fetch(`${API_URL}/api/notebooks/${savedId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ folder: folderName }),
      });
      const refetch = await fetch(`${API_URL}/api/notebooks`, { headers: { Authorization: `Bearer ${token}` } });
      if (refetch.ok) setMyNotebooks(await refetch.json());
    } catch {}
  };

  const folderNotebookCounts = React.useMemo(() => {
    const counts = {};
    for (const nb of myNotebooks) {
      const f = nb.folder || '';
      if (f) counts[f] = (counts[f] || 0) + 1;
    }
    return counts;
  }, [myNotebooks]);

  // =================== UPLOAD MODAL ===================
  const renderContent = (text) => {
    if (!text) return null;
    if (typeof text === 'string' && text.includes('<img ')) {
      return <span dangerouslySetInnerHTML={{ __html: text }} />;
    }
    return text;
  };

  const renderUploadModal = () => {
    if (!showUploadModal) return null;

    return (
      <div className="nb-upload-overlay" onClick={() => !isUploading && setShowUploadModal(false)}>
        <div className="nb-upload-modal" onClick={(e) => e.stopPropagation()}>
          {!isUploading ? (
            <>
              <div className="nb-upload-modal-header">
                <h2>Upload Lecture Notes</h2>
                <button className="nb-upload-close" onClick={() => setShowUploadModal(false)}>
                  <X size={20} />
                </button>
              </div>

              <p className="nb-upload-desc">
                Upload your lecture slides or notes. Our AI will transform them 
                into an intuitive study guide and match relevant past paper questions.
              </p>

              <div className="nb-upload-dropzone" onClick={handleFileSelect}>
                <Upload size={36} className="nb-upload-dropzone-icon" />
                <p className="nb-upload-dropzone-text">Click to select a file</p>
                <p className="nb-upload-dropzone-hint">PowerPoint, PDF, or images — up to 20MB</p>
              </div>

              <input
                key={fileInputKey}
                ref={fileInputRef}
                type="file"
                accept=".pdf,.pptx,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.gif"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />

              <div className="nb-upload-instructions">
                <label className="nb-upload-label">Additional context (optional)</label>
                <input
                  type="text"
                  className="nb-upload-context-input"
                  placeholder="e.g. Year 2 Microeconomics, Chapter 5 on Elasticity"
                  value={uploadInstructions}
                  onChange={(e) => setUploadInstructions(e.target.value)}
                />
              </div>

              {uploadError && (
                <div className="nb-upload-error">
                  <AlertCircle size={16} />
                  <span>{uploadError}</span>
                </div>
              )}
            </>
          ) : (
            <div className="nb-upload-progress">
              <div className="nb-upload-spinner">
                <Loader size={40} className="spinning" />
              </div>
              <h3 className="nb-upload-progress-title">Generating your study guide</h3>

              <p className="nb-upload-stage-label">{uploadProgress || 'Starting...'}</p>

              <div className="nb-progress-bar-track">
                <div
                  className="nb-progress-bar-fill"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <p className="nb-progress-percent">{uploadPercent}%</p>

              <div className="nb-upload-steps">
                {[
                  { key: 'extracting', label: 'Extract text & images' },
                  { key: 'analyzing', label: 'Analyze with AI' },
                  { key: 'merging', label: 'Merge & build guide' },
                  { key: 'matching', label: 'Match past papers' },
                ].map((step) => {
                  const stageOrder = ['uploading', 'extracting', 'loaded', 'chunking', 'analyzing', 'merging', 'matching', 'done'];
                  const currentIdx = stageOrder.indexOf(uploadStage);
                  const stepIdx = stageOrder.indexOf(step.key);
                  const isDone = currentIdx > stepIdx;
                  const isActive = uploadStage === step.key || (step.key === 'extracting' && (uploadStage === 'loaded' || uploadStage === 'chunking'));
                  return (
                    <div key={step.key} className={`nb-upload-step ${isDone ? 'done' : isActive ? 'active' : ''}`}>
                      {isDone ? <CheckCircle size={16} /> : isActive ? <Loader size={16} className="spinning" /> : <CheckCircle size={16} />}
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>

              <button className="nb-upload-cancel-btn" onClick={handleCancelUpload}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // =================== LIST VIEW ===================
  if (!selectedNotebook) {
    return (
      <div className={`notebook-page${theme === 'dark' ? ' dark' : ''}`}>
        <button className="nb-close-btn" onClick={onClose}>
          <X size={28} />
        </button>
        <button className="nb-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {renderUploadModal()}

        <div className="nb-library-layout">
          {/* ── Left Sidebar: category nav ── */}
          <div className="nb-sidebar">
            <h2 className="nb-sidebar-title">Library</h2>

            <nav className="nb-sidebar-nav">
              <button
                className={`nb-sidebar-nav-btn${sidebarTab === 'notebooks' ? ' active' : ''}`}
                onClick={() => { setSidebarTab('notebooks'); setSearchQuery(''); }}
              >
                <BookOpen size={18} />
                <span>Notebooks</span>
                <span className="nb-sidebar-nav-count">{builtInList.length}</span>
              </button>
              <button
                className={`nb-sidebar-nav-btn${sidebarTab === 'yours' ? ' active' : ''}`}
                onClick={() => { setSidebarTab('yours'); setSearchQuery(''); }}
              >
                <FileText size={18} />
                <span>Your Notebooks</span>
                <span className="nb-sidebar-nav-count">{generatedList.length}</span>
              </button>
            </nav>

            {/* Folders section */}
            <div className="nb-sidebar-folders">
              <div className="nb-sidebar-folders-header">
                <span className="nb-sidebar-folders-label">Folders</span>
                <button
                  className="nb-sidebar-folder-add-btn"
                  onClick={() => setShowNewFolderInput(prev => !prev)}
                  title="New folder"
                >
                  <Plus size={14} />
                </button>
              </div>

              {showNewFolderInput && (
                <div className="nb-sidebar-folder-input-row">
                  <input
                    type="text"
                    className="nb-sidebar-folder-input"
                    placeholder="Folder name..."
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                    autoFocus
                  />
                  <button className="nb-sidebar-folder-create-btn" onClick={handleCreateFolder}>
                    <CheckCircle size={14} />
                  </button>
                </div>
              )}

              {folders.map(f => (
                <button
                  key={f}
                  className={`nb-sidebar-folder-btn${selectedFolder === f ? ' active' : ''}`}
                  onClick={() => handleOpenFolder(f)}
                >
                  <Folder size={16} />
                  <span>{f}</span>
                  <span className="nb-sidebar-nav-count">{folderNotebookCounts[f] || 0}</span>
                </button>
              ))}
            </div>

            <div className="nb-sidebar-spacer" />

            <button
              className="nb-sidebar-upload-btn"
              onClick={handleUploadClick}
              disabled={notebooksRemaining === 0}
              title={notebooksRemaining === 0 ? 'Notebook limit reached' : ''}
            >
              <Upload size={18} />
              <span>Upload Notes</span>
              {notebooksRemaining !== null && notebooksRemaining <= 2 && (
                <span className="nb-upload-remaining">
                  {notebooksRemaining === 0 ? 'Limit reached' : `${notebooksRemaining} left`}
                </span>
              )}
            </button>
          </div>

          {/* ── Right Content: search + card grid ── */}
          <div className="nb-content-area">
            {activeDocument ? (
              <DocumentViewer
                folderName={activeDocument.folderName}
                source={activeDocument.source}
                onClose={() => setActiveDocument(null)}
                onNotebookGenerated={(nb) => {
                  setActiveDocument(null);
                  if (!token) return;
                  fetch(`${API_URL}/api/notebooks`, { headers: { Authorization: `Bearer ${token}` } })
                    .then(res => res.ok ? res.json() : null)
                    .then(data => { if (data) setMyNotebooks(data); })
                    .catch(() => {});
                }}
              />
            ) : activeLessonFolder ? (
              <LessonView
                folderName={activeLessonFolder}
                onClose={() => setActiveLessonFolder(null)}
              />
            ) : selectedFolder ? (
              <FolderView
                folderName={selectedFolder}
                onClose={() => setSelectedFolder(null)}
                onOpenNotebook={(nb) => { setSelectedFolder(null); openNotebook(nb); }}
                onSourcesChanged={() => {
                  if (!token) return;
                  fetch(`${API_URL}/api/notebooks`, { headers: { Authorization: `Bearer ${token}` } })
                    .then(res => res.ok ? res.json() : null)
                    .then(data => { if (data) setMyNotebooks(data); })
                    .catch(() => {});
                }}
                onStartLesson={(folder) => setActiveLessonFolder(folder)}
                onOpenDocument={(src) => setActiveDocument({ folderName: selectedFolder, source: src })}
              />
            ) : (
            <>
            {showNbTip && (
              <div className="pedro-tip-banner nb-tip">
                <img src={mascot} alt="Pedro" className="pedro-tip-avatar" />
                <div className="pedro-tip-content">
                  <strong>Pedro's tips</strong>
                  <p>
                    <b>Notebooks</b> — upload a single PDF to get a study guide you can chat about, visualize, and download.
                    <b> Folders</b> — add multiple sources (PDFs, slides) and I'll generate a complete interactive lesson with questions from all your materials.
                  </p>
                </div>
                <button className="pedro-tip-close" onClick={() => { setShowNbTip(false); localStorage.setItem(nbTipKey, '1'); }} aria-label="Dismiss tip">
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="nb-content-header">
              <h1 className="nb-list-title">
                {sidebarTab === 'yours' ? 'Your Notebooks' : 'Notebooks'}
              </h1>

              <div className="nb-content-search">
                <Search size={15} className="nb-content-search-icon" />
                <input
                  type="text"
                  className="nb-content-search-input"
                  placeholder="Search notebooks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="nb-content-search-clear" onClick={() => setSearchQuery('')}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="nb-card-grid">
              {visibleNotebooks.map((nb, idx) => {
                const isGenerated = nb._saved_id != null || myNotebooks.some(g => g.id === nb.id);
                const qCount = nb.questionCount || nb.matchedQuestions?.length || 0;
                const sectionCount = nb.sections?.length || 0;

                return (
                  <div
                    key={nb._saved_id ? `s${nb._saved_id}` : `b${nb.id}_${idx}`}
                    className="nb-card"
                    onClick={() => openNotebook(nb)}
                  >
                    {isGenerated && (
                      <div className="nb-card-actions">
                        <button
                          className="nb-card-folder-btn"
                          onClick={(e) => { e.stopPropagation(); setFolderMenuOpen(folderMenuOpen === nb.id ? null : nb.id); }}
                          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          title="Move to folder"
                        >
                          <FolderPlus size={14} />
                        </button>
                        <button
                          className="nb-card-delete-btn"
                          onClick={(e) => handleDeleteGenerated(nb, e)}
                          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          title="Delete notebook"
                        >
                          <Trash2 size={14} />
                        </button>
                        {folderMenuOpen === nb.id && (
                          <div className="nb-card-folder-menu" onClick={(e) => e.stopPropagation()}>
                            <div className="nb-card-folder-menu-title">Move to folder</div>
                            {nb.folder && (
                              <button
                                className="nb-card-folder-menu-item remove"
                                onClick={(e) => { e.stopPropagation(); handleMoveToFolder(nb, ''); setFolderMenuOpen(null); }}
                              >
                                Remove from folder
                              </button>
                            )}
                            {folders.map(f => (
                              <button
                                key={f}
                                className={`nb-card-folder-menu-item${nb.folder === f ? ' active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); handleMoveToFolder(nb, f); setFolderMenuOpen(null); }}
                              >
                                <Folder size={13} />
                                {f}
                              </button>
                            ))}
                            {folders.length === 0 && (
                              <div className="nb-card-folder-menu-empty">No folders yet. Create one in the sidebar.</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="nb-card-top">
                      <div className="nb-card-icon" style={{ background: nb.color || '#888' }}>
                        <span>{nb.icon || '📄'}</span>
                      </div>
                      {isGenerated && <span className="nb-card-generated-badge">Generated</span>}
                    </div>
                    <h3 className="nb-card-title">{nb.title}</h3>
                    <p className="nb-card-course">{nb.course}</p>
                    {nb.folder && (
                      <span className="nb-card-folder-tag">
                        <Folder size={11} />
                        {nb.folder}
                      </span>
                    )}
                    <div className="nb-card-footer">
                      <span className="nb-card-stat">
                        <BookOpen size={13} />
                        {sectionCount} sections
                      </span>
                      {qCount > 0 && (
                        <span className="nb-card-stat">
                          <FileText size={13} />
                          {qCount} questions
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {visibleNotebooks.length === 0 && (
                <div className="nb-empty-state">
                  {searchQuery
                    ? <p>No notebooks match your search.</p>
                    : sidebarTab === 'yours'
                      ? <p>No generated notebooks yet. Upload your lecture notes to get started!</p>
                      : <p>No notebooks available.</p>
                  }
                </div>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =================== DETAIL VIEW ===================
  const qCount = selectedNotebook.questionCount || selectedNotebook.matchedQuestions?.length || 0;

  return (
    <div className={`notebook-page nb-detail-view${theme === 'dark' ? ' dark' : ''}`}>
      <button className="nb-close-btn" onClick={onClose}>
        <X size={28} />
      </button>
      <button className="nb-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className="notebook-layout">
        {/* Left Panel: Notes */}
        <div className="notebook-left">
          {/* Toolbar */}
          <div className="nb-toolbar">
            <button className="nb-back-btn" onClick={goBack}>
              <ArrowLeft size={18} />
              <span>All Notebooks</span>
            </button>
            <div className="nb-toolbar-spacer"></div>
            <div className="nb-size-control">
              <button className="nb-tool-btn" onMouseDown={(e) => {
                e.preventDefault();
                setFontSize(prev => {
                  const next = Math.max(12, prev - 2);
                  document.execCommand('fontSize', false, '7');
                  const fonts = contentRef.current?.querySelectorAll('font[size="7"]');
                  fonts?.forEach(el => { el.removeAttribute('size'); el.style.fontSize = `${next}px`; });
                  return next;
                });
              }}>−</button>
              <span className="nb-size-value">{fontSize}</span>
              <button className="nb-tool-btn" onMouseDown={(e) => {
                e.preventDefault();
                setFontSize(prev => {
                  const next = Math.min(28, prev + 2);
                  document.execCommand('fontSize', false, '7');
                  const fonts = contentRef.current?.querySelectorAll('font[size="7"]');
                  fonts?.forEach(el => { el.removeAttribute('size'); el.style.fontSize = `${next}px`; });
                  return next;
                });
              }}>+</button>
            </div>
            <div className="nb-format-btns">
              <button
                className="nb-tool-btn"
                onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}
                title="Bold"
              ><strong>B</strong></button>
              <button
                className="nb-tool-btn"
                onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}
                title="Italic"
              ><em>I</em></button>
              <button
                className="nb-tool-btn"
                onMouseDown={(e) => { e.preventDefault(); document.execCommand('underline'); }}
                title="Underline"
                style={{ textDecoration: 'underline' }}
              >U</button>
              <div className="nb-color-picker-wrapper" ref={colorPickerRef}>
                <button
                  className="nb-tool-btn nb-color-btn"
                  onMouseDown={(e) => { e.preventDefault(); setShowColorPicker(prev => !prev); }}
                  title="Text color"
                >
                  <span className="nb-color-a">A</span>
                  <span className="nb-color-bar"></span>
                </button>
                {showColorPicker && (
                  <div className="nb-color-dropdown">
                    {textColors.map((color) => (
                      <button
                        key={color}
                        className="nb-color-swatch"
                        style={{ background: color }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          document.execCommand('foreColor', false, color);
                          setShowColorPicker(false);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <button
                className={`nb-tool-btn ${isEditing ? 'nb-tool-active' : ''}`}
                onClick={() => setIsEditing(prev => !prev)}
                title={isEditing ? 'Lock editing' : 'Enable editing'}
              >✎</button>
              <button
                className="nb-tool-btn"
                onClick={handleExportPdf}
                title="Export as PDF"
              ><Download size={16} /></button>
              <button
                className="nb-tool-btn"
                onClick={() => setShowConceptMap(true)}
                title="Mind Map"
              ><GitBranch size={16} /></button>
            </div>
            {hasUnsavedChanges && (
              <>
                <span className="nb-unsaved-badge">Edited</span>
                <button className="nb-save-btn" onClick={saveNotebookHtml}>Save</button>
              </>
            )}
          </div>

          {/* Scrollable wrapper for notes + viz */}
          <div className="nb-scroll-wrap" ref={notesRef}>
          <div
            className={`nb-notes-area ${isEditing ? 'nb-editable' : ''}`}
            ref={contentRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onInput={() => setHasUnsavedChanges(true)}
          >
            <div className="nb-course-label">Notebook: {selectedNotebook.course}</div>
            
            <h1 className="nb-title">{selectedNotebook.title}</h1>

            {selectedNotebook.intro && (
              <div className="nb-intro">
                <p>{selectedNotebook.intro.text}</p>
                {selectedNotebook.intro.highlights && (
                  <div className="nb-intro-highlights">
                    {selectedNotebook.intro.highlights.map((h, i) => (
                      <div key={i} className="nb-highlight" style={{ borderColor: selectedNotebook.color }}>
                        <strong style={{ color: selectedNotebook.color }}>{h.label}:</strong> {h.desc}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedNotebook.sections.slice(0, visibleSections).map((section, sIdx) => (
              <div key={sIdx} className="nb-section">
                <h2 className="nb-section-title">
                  <span className="nb-section-icon">{section.icon}</span>
                  {section.title}
                </h2>
                <p className="nb-section-content">{renderContent(section.content)}</p>

                {section.subsections?.map((sub, subIdx) => (
                  <div key={subIdx} className="nb-subsection" style={{ borderLeftColor: selectedNotebook.color }}>
                    <h3 className="nb-subsection-title">{sub.title}</h3>
                    <p className="nb-subsection-content">{renderContent(sub.content)}</p>
                    
                    {sub.bullets && (
                      <ul className="nb-bullets">
                        {sub.bullets.map((bullet, bIdx) => (
                          <li key={bIdx}>{renderContent(bullet)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

              </div>
            ))}

            {isGenerating && (
              <div className="nb-generating">
                <div className="nb-generating-dots">
                  <span></span><span></span><span></span>
                </div>
                <span className="nb-generating-text">Generating notes...</span>
              </div>
            )}
          </div>

          {/* Exercise widgets rendered via portals into each section */}
          {exercisePortals.map(({ idx, el }) => {
            const section = selectedNotebook?.sections?.[idx];
            if (!section) return null;
            return createPortal(
              <ExerciseWidget
                key={`ex-${selectedNotebook.id}-${idx}`}
                section={section}
                token={token}
                onClose={() => setExerciseOpen(prev => ({ ...prev, [idx]: false }))}
              />,
              el
            );
          })}

          {/* Per-section inline visualizations — outside contentEditable */}
          {selectedNotebook && !isGenerating && (() => {
            const nbId = String(selectedNotebook._saved_id || selectedNotebook.id);
            const cards = [];
            selectedNotebook.sections.forEach((section, sIdx) => {
              const vizKey = `${nbId}_section_${sIdx}`;
              const isLoading = sectionVizLoading[vizKey];
              const viz = sectionViz[vizKey];
              if (!isLoading && !viz) return;
              cards.push(
                <div key={vizKey} className="nb-section-viz-inline">
                  <span className="nb-section-viz-inline-label">{section.title}</span>
                  {isLoading ? (
                    <div className="nb-section-viz-spinner">
                      <Loader size={18} className="nb-spin" />
                      <span>Generating visualization...</span>
                    </div>
                  ) : viz?.skip ? (
                    <div className="nb-section-viz-skip">
                      <span>{viz.message || 'No visualization needed for this section.'}</span>
                    </div>
                  ) : viz ? (
                    <div className="nb-section-viz-result" onClick={() => setExpandedViz({ dynamic: true, ...viz })}>
                      <div className="nb-section-viz-gif-wrap">
                        <img src={viz.url} alt={viz.topic} className="nb-section-viz-gif" />
                      </div>
                      <div className="nb-section-viz-info">
                        <span className="nb-section-viz-topic">{viz.topic}</span>
                        <p className="nb-section-viz-desc">{viz.description}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            });
            return cards.length > 0 ? <div className="nb-section-viz-container">{cards}</div> : null;
          })()}

          {/* Visual Explanations — button, loading bar, and results */}
          {selectedNotebook && !isGenerating && (() => {
            const nbId = String(selectedNotebook._saved_id || selectedNotebook.id);
            const dynViz = [...(notebookViz[nbId] || []), ...(DEMO_VIZ[nbId] || [])];
            const hasViz = dynViz.length > 0;

            return (
              <div className="nb-viz-section">
                {hasViz ? (
                  <>
                    <h2 className="nb-viz-title">
                      <Play size={20} />
                      Visual Explanations
                    </h2>
                    <p className="nb-viz-desc">Animated visualizations powered by Manim to help you understand key concepts.</p>
                    <div className="nb-viz-grid">
                      {dynViz.map((v, i) => (
                        <div key={`dyn-${i}`} className="nb-viz-card" onClick={() => setExpandedViz({ dynamic: true, ...v })}>
                          <div className="nb-viz-gif-wrap">
                            <img src={v.url} alt={v.topic} className="nb-viz-gif" />
                          </div>
                          <div className="nb-viz-info">
                            <span className="nb-viz-label">{v.topic}</span>
                            <p className="nb-viz-card-desc">{v.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : vizLoading ? (
                  <div className="nb-viz-loading">
                    <div className="nb-viz-loading-icon">
                      <Play size={18} />
                    </div>
                    <span className="nb-viz-loading-text">Generating visual explanations...</span>
                    <div className="nb-viz-loading-bar">
                      <div className="nb-viz-loading-fill" style={{ width: `${vizProgress}%` }} />
                    </div>
                  </div>
                ) : vizNoResults[nbId] ? (
                  <div className="nb-viz-no-results">
                    <Play size={18} />
                    <span>No visualizations needed for this notebook</span>
                  </div>
                ) : (
                  <button className="nb-viz-generate-btn" onClick={handleGenerateViz}>
                    <Play size={18} />
                    Generate Visual Explanations
                  </button>
                )}
              </div>
            );
          })()}
          </div>
        </div>

        {/* Right Panel: Pedro Chat */}
        <div className={`notebook-right ${chatExpanded ? 'notebook-right-expanded' : ''}`}>
          <div className="pedro-panel-header">
            <div className={`pedro-intro ${chatMessages.length === 0 ? 'pedro-intro-centered' : ''}`}>
              <img src={mascot} alt="Pedro" className="pedro-mascot" />
              <h2 className="pedro-name">Hey, I'm Pedro</h2>
              <p className="pedro-desc">
                Pedro can work with you on your doc, create quizzes from real past paper questions for your course and answer any questions!
              </p>
            </div>
            <button
              className="pedro-expand-btn"
              onClick={() => setChatExpanded(prev => !prev)}
              title={chatExpanded ? 'Minimize chat' : 'Expand chat'}
            >
              {chatExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {/* Chat Messages */}
          {chatMessages.length > 0 && (
            <div className="pedro-messages" ref={chatAreaRef}>
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`pedro-msg ${msg.role}`}>
                  {msg.role === 'pedro' && (
                    <img src={mascot} alt="" className="pedro-msg-avatar" />
                  )}
                  <div className="pedro-msg-bubble">
                    {msg.role === 'pedro' ? <PedroMessage text={msg.text} /> : msg.text}
                    {msg.role === 'pedro' && (
                      <button
                        className="pedro-add-to-notes-btn"
                        onClick={() => handleAddToNotes(msg.text)}
                        title="Add to notes"
                      >
                        <PenLine size={13} />
                        <span>Add to Notes</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="pedro-msg pedro">
                  <img src={mascot} alt="" className="pedro-msg-avatar" />
                  <div className="pedro-msg-bubble pedro-typing">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              )}
              <div />
            </div>
          )}

          {/* Chat Input */}
          <div className="pedro-input-container">
            <div className="pedro-input-wrapper">
              <input
                type="text"
                className="pedro-input"
                placeholder="Type a question here..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="pedro-input-actions">
                <button className="pedro-action-btn">
                  <Paperclip size={18} />
                </button>
                <button className="pedro-action-btn send" onClick={handleSendMessage}>
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Practice Questions Button */}
          {showPracticeBtn && qCount > 0 && (
            <button className="pedro-practice-btn" onClick={handlePractice}>
              <BookOpen size={20} />
              <span>Practice {qCount} Matched Questions</span>
              <ArrowRight size={18} />
            </button>
          )}

          {/* Flashcards Button */}
          {selectedNotebook?.sections?.length > 0 && (
            <button className="pedro-flashcard-btn" onClick={handleOpenFlashcards}>
              <Layers size={20} />
              <span>Study Flashcards</span>
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Flashcard Overlay */}
      {showFlashcards && flashcards.length > 0 && (
        <div className="fc-overlay">
          <div className="fc-container">
            <div className="fc-header">
              <h2 className="fc-title">
                <Layers size={22} />
                Flashcards
              </h2>
              <span className="fc-count">{fcIndex + 1} / {flashcards.length}</span>
              <div className="fc-header-actions">
                <button className="fc-action-btn" onClick={handleShuffleFlashcards} title="Shuffle">
                  <Shuffle size={18} />
                </button>
                <button className="fc-action-btn" onClick={handleResetFlashcards} title="Reset order">
                  <RotateCcw size={18} />
                </button>
                <button className="fc-close-btn" onClick={() => setShowFlashcards(false)}>
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="fc-progress-track">
              <div className="fc-progress-fill" style={{ width: `${((fcIndex + 1) / flashcards.length) * 100}%` }} />
            </div>

            <div className="fc-section-label">{flashcards[fcIndex]?.section}</div>

            <div className="fc-card-wrapper" onClick={() => setFcFlipped(prev => !prev)}>
              <div className={`fc-card ${fcFlipped ? 'flipped' : ''}`}>
                <div className="fc-card-front">
                  <span className="fc-card-label">Question</span>
                  <p>{flashcards[fcIndex]?.front}</p>
                  <span className="fc-tap-hint">Tap to reveal</span>
                </div>
                <div className="fc-card-back">
                  <span className="fc-card-label">Answer</span>
                  <p>{flashcards[fcIndex]?.back}</p>
                  <span className="fc-tap-hint">Tap to flip back</span>
                </div>
              </div>
            </div>

            <div className="fc-nav">
              <button
                className="fc-nav-btn"
                disabled={fcIndex === 0}
                onClick={() => { setFcIndex(prev => prev - 1); setFcFlipped(false); }}
              >
                <ChevronLeft size={22} />
                <span>Previous</span>
              </button>
              <button
                className="fc-nav-btn"
                disabled={fcIndex === flashcards.length - 1}
                onClick={() => { setFcIndex(prev => prev + 1); setFcFlipped(false); }}
              >
                <span>Next</span>
                <ChevronRight size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Visualization Overlay */}
      {expandedViz && (() => {
        const vizData = { file: expandedViz.url, label: expandedViz.topic, desc: expandedViz.description };
        if (!vizData.file) return null;
        return (
          <div className="nb-viz-overlay" onClick={() => setExpandedViz(null)}>
            <div className="nb-viz-expanded" onClick={e => e.stopPropagation()}>
              <button className="nb-viz-expanded-close" onClick={() => setExpandedViz(null)}>
                <X size={22} />
              </button>
              <div className="nb-viz-expanded-gif-wrap">
                <img src={vizData.file} alt={vizData.label} className="nb-viz-expanded-gif" />
              </div>
              <div className="nb-viz-expanded-info">
                <h3>{vizData.label}</h3>
                <p>{vizData.desc}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Highlight & Ask Pedro tooltip (fixed position, outside scroll) */}
      {selectionTooltip && !isEditing && (
        <div
          className="ask-pedro-tooltip"
          style={{ top: selectionTooltip.top, left: selectionTooltip.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button className="ask-pedro-tooltip-btn" onClick={handleAskPedroAboutSelection}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
            Ask Pedro
          </button>
        </div>
      )}

      {/* Mind Map Overlay */}
      {showConceptMap && selectedNotebook?.sections?.length > 0 && (
        <MindMap
          notebook={selectedNotebook}
          onClose={() => setShowConceptMap(false)}
          onSectionClick={(idx) => {
            setShowConceptMap(false);
            setTimeout(() => {
              const sections = contentRef.current?.querySelectorAll('.nb-section');
              if (sections?.[idx]) {
                sections[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          }}
        />
      )}
    </div>
  );
};

export default NotebookPage;
