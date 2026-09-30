import DOMPurify from 'dompurify';
import { useAuth } from '../context/authState';
import { imageUrl, isSourceImage } from '../utils/sourceImageAccess';
import React, { createContext, useContext, useMemo } from 'react';
import { BookOpen, MessageCircleQuestion, KeyRound, Lightbulb, TriangleAlert, FlaskConical, Info, Maximize2 } from 'lucide-react';
import remarkPedro from '../utils/pedroMarkdown';
import './PedroMessage.css';
import remarkLessonCitations, { resolveLessonCitation, isLessonCitation } from '../utils/lessonCitations';
import './LessonCitations.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { API_URL } from '../config';
import { useThrottledValue } from '../utils/useThrottledValue';
import WidgetBlock from '../widgets/WidgetBlock';
import { WidgetContext } from '../widgets/widgetContext';

const STREAM_MARKDOWN_MS = 280;
const NO_SOURCES = [];

/** KaTeX options — strict:false silences Unicode unit warnings (µ, etc.). */
const KATEX_OPTIONS = {
  strict: false,
  throwOnError: false,
  trust: false,
};

/** Normalize Unicode units/symbols Pedro often uses before remark-math sees them. */
function sanitizePedroMarkdown(text) {
  if (!text) return text;
  return text
    // 10 µm → KaTeX-friendly inline math
    .replace(/(\d+(?:\.\d+)?)\s*µm\b/g, '$1 $\\mu\\text{m}$')
    .replace(/(\d+(?:\.\d+)?)\s*µ(?![a-zA-Z])/g, '$1 $\\mu$')
    // Micro sign inside $...$ math delimiters
    .replace(/\$([^$]*?)µ([^$]*?)\$/g, (_, a, b) => `$${a}\\mu${b}$`)
    // "[Lecture · p. 8]" written without a link: drop the brackets so it becomes a clean citation chip.
    .replace(/\[([^\]\n]{2,90}?·\s*(?:pp?\.?|pages?|slides?)\s*\d+(?:\s*[-–]\s*\d+)?)\](?!\()/g, '$1')
    // An equation alone on its line is a display equation, even when written as $$...$$ on one line.
    .replace(/^((?:[ \t]*>)*[ \t]*)\$\$([^\n$][^\n]*?)\$\$[ \t]*$/gm, (_, lead, tex) => `${lead}$$\n${lead}${tex.trim()}\n${lead}$$`);
}

function repairIncompleteSvg(text) {
  const hasSvgOpen = /<svg[\s>]/i.test(text);
  if (!hasSvgOpen) return text;
  const hasSvgClose = /<\/svg>/i.test(text);
  const hasDivClose = /<\/div>\s*$/i.test(text);
  let repaired = text;
  if (!hasSvgClose) repaired += '</svg>';
  if (/<div[^>]*>[\s\S]*<svg/i.test(text) && !hasDivClose) repaired += '</div>';
  return repaired;
}

/** While a reply streams, a diagram still being drawn is shown as a placeholder rather than
 *  as raw SVG code; finished diagrams render as soon as they close. */
function streamingSvgParts(text) {
  const open = /<div[^>]*>\s*<svg[\s>]|<svg[\s>]/gi;
  let cut = -1;
  let m;
  while ((m = open.exec(text)) !== null) {
    if (!/<\/svg>/i.test(text.slice(m.index))) { cut = m.index; break; }
  }
  const done = cut === -1 ? text : text.slice(0, cut);
  const parts = /<svg[\s\S]*?<\/svg>/i.test(done) ? splitSvgBlocks(done) : [{ type: 'markdown', content: done }];
  return cut === -1 ? parts : [...parts, { type: 'pending-svg' }];
}

function splitSvgBlocks(text) {
  const repaired = repairIncompleteSvg(text);
  const svgRegex = /(<div[^>]*>[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?<\/div>|<svg[\s\S]*?<\/svg>)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = svgRegex.exec(repaired)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'markdown', content: repaired.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'svg', content: match[0] });
    lastIndex = svgRegex.lastIndex;
  }

  if (lastIndex < repaired.length) {
    parts.push({ type: 'markdown', content: repaired.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'markdown', content: repaired }];
}

const CALLOUTS = {
  question: { Icon: MessageCircleQuestion, label: 'Your turn' },
  key: { Icon: KeyRound, label: 'Key idea' },
  tip: { Icon: Lightbulb, label: 'Tip' },
  mistake: { Icon: TriangleAlert, label: 'Watch out' },
  example: { Icon: FlaskConical, label: 'Worked example' },
  note: { Icon: Info, label: 'Note' },
};

const SOURCE_PAGE = /\/api\/source-pages\/([a-zA-Z0-9_-]+)\/(\d+)/;
// Pedro occasionally writes a slide as "![…](/02 KGs better · p. 32)" instead of its address.
const TITLE_PAGE = /^\/?\s*(.+?)\s*·\s*(?:p\.|page|slide)\s*(\d+)\s*$/i;

/** "02 KGs better · p. 32" → the lesson source it names, or null. */
function sourceFromTitle(src, sources) {
  let decoded = src;
  try { decoded = decodeURIComponent(src); } catch { /* keep as written */ }
  const m = TITLE_PAGE.exec(decoded);
  if (!m) return null;
  const norm = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const want = norm(m[1]);
  const source = sources.find(s => norm(s.title) === want || norm(s.filename) === want)
    || sources.find(s => norm(s.title).startsWith(want) || want.startsWith(norm(s.title)));
  return source ? `/api/source-pages/${source.source_id}/${m[2]}` : null;
}
const STEP = /^\s*(step|part)\s+(\d+)\s*[:.–—-]\s*/i;

/** "L02 Statistical Properties 2026" → "L02"; long titles are shortened for the inline chip. */
function shortSourceLabel(title = '') {
  const first = title.trim().split(/\s+/)[0] || '';
  if (/\d/.test(first) && first.length <= 6) return first;
  const numbered = /^(lecture|lec|week|session|chapter|ch|unit|part|module|slides?)\.?\s*\d+/i.exec(title.trim());
  if (numbered) return numbered[0];
  return title.length > 18 ? `${title.slice(0, 17).trim()}…` : title;
}

function pageLabel(citation) {
  return `${citation.source_type === 'pptx' ? 'slide' : 'p.'} ${citation.page}`;
}

/** "Step 2: Walks versus paths" → a STEP 2 chip followed by the title. */
function headingContent(children) {
  const list = React.Children.toArray(children);
  const first = list[0];
  const m = typeof first === 'string' ? STEP.exec(first) : null;
  if (!m) return { step: null, content: children };
  return { step: `${m[1]} ${m[2]}`, content: [first.slice(m[0].length), ...list.slice(1)] };
}

const StreamingContext = createContext(false);

/** A ```widget block: a lab, mounted once the reply is complete. */
function WidgetPre({ source }) {
  const streaming = useContext(StreamingContext);
  return <WidgetBlock source={source} streaming={streaming} />;
}
const REHYPE_PLUGINS = [[rehypeKatex, KATEX_OPTIONS]];
const PARTIAL_STEP = /^\s*(s(t(e(p(\s+\d*)?)?)?)?|p(a(r(t(\s+\d*)?)?)?)?)\s*$/i;

function Heading({ level, children }) {
  const streaming = useContext(StreamingContext);
  const list = React.Children.toArray(children);
  // Mid-stream "### Step 3" is about to become a STEP chip: wait for it rather than
  // flashing a plain heading first.
  if (streaming && list.length === 1 && typeof list[0] === 'string' && PARTIAL_STEP.test(list[0])) return null;
  const { step, content } = headingContent(children);
  const Tag = level <= 2 ? 'h3' : level === 3 ? 'h4' : 'h5';
  const size = level <= 2 ? ' pedro-h--lg' : level >= 4 ? ' pedro-h--sm' : '';
  return (
    <Tag className={`pedro-h${size}${step ? ' pedro-h--step' : ''}`}>
      {step && <span className="pedro-step">{step}</span>}
      <span className="pedro-h-text">{content}</span>
    </Tag>
  );
}

function Callout({ kind, title, children }) {
  const { Icon, label } = CALLOUTS[kind] || CALLOUTS.note;
  return (
    <aside className={`pedro-callout pedro-callout--${kind}`}>
      <div className="pedro-callout-head">
        <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
        <span className="pedro-callout-label">{label}</span>
        {title && <span className="pedro-callout-title">{title}</span>}
      </div>
      <div className="pedro-callout-body">{children}</div>
    </aside>
  );
}

function MarkdownBlock({ text, sourceReferences = NO_SOURCES, onCitation, streaming = false }) {
  const { imageAccess } = useAuth();
  const plugins = useMemo(() => [
    remarkMath, remarkGfm, remarkPedro,
    ...(onCitation ? [[remarkLessonCitations, { sources: sourceReferences }]] : []),
  ], [sourceReferences, onCitation]);
  // One stable set of renderers for the whole stream. Fresh component functions on every
  // update would make React remount headings, callouts and slides each time, replaying
  // their entrance animations (the "twitching" while Pedro writes).
  const components = useMemo(() => {
    const citationFor = (sourceId, page) =>
      onCitation ? resolveLessonCitation(`#lesson-source/${sourceId}/${page}`, sourceReferences) : null;
    return {
      a: ({ href, children }) => {
        if (!isLessonCitation(href)) return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
        const citation = onCitation && resolveLessonCitation(href, sourceReferences);
        return citation ? (
          <button type="button" className="lesson-citation" onClick={() => onCitation(citation)}
            title={`Open ${citation.title}, ${citation.source_type === 'pptx' ? 'slide' : 'page'} ${citation.page}`}>
            <BookOpen size={11} strokeWidth={2.4} aria-hidden="true" />
            {shortSourceLabel(citation.title)} · {pageLabel(citation)}
          </button>
        ) : <span className="lesson-citation-unavailable" title="Source reference unavailable">{children}</span>;
      },
      h1: ({ children }) => <Heading level={1}>{children}</Heading>,
      h2: ({ children }) => <Heading level={2}>{children}</Heading>,
      h3: ({ children }) => <Heading level={3}>{children}</Heading>,
      h4: ({ children }) => <Heading level={4}>{children}</Heading>,
      h5: ({ children }) => <Heading level={5}>{children}</Heading>,
      h6: ({ children }) => <Heading level={6}>{children}</Heading>,
      pre: ({ node, children }) => {
        const code = node?.children?.[0];
        if (code?.tagName === 'code' && (code.properties?.className || []).includes('language-widget')) {
          return <WidgetPre source={(code.children || []).map((c) => c.value || '').join('')} />;
        }
        return <pre className="pedro-pre">{children}</pre>;
      },
      blockquote: ({ node, children }) => (
        // An empty quote is a callout marker still being typed; show nothing yet.
        node?.children?.some(c => c.type === 'element')
          ? <blockquote className="pedro-quote">{children}</blockquote> : null
      ),
      aside: ({ node, children }) => {
        const props = node?.properties || {};
        const kind = props.dataKind || 'note';
        return <Callout kind={kind} title={props.dataTitle}>{children}</Callout>;
      },
      hr: () => <div className="pedro-wave" role="separator" />,
      table: ({ children }) => (
        <div className="pedro-table-wrap"><table>{children}</table></div>
      ),
      img: ({ src, alt }) => {
        let resolvedSrc = src || '';
        if (!/^(https?:|blob:|data:|\/api\/)/.test(resolvedSrc)) {
          resolvedSrc = sourceFromTitle(resolvedSrc, sourceReferences) || resolvedSrc;
        }
        const idMatch = resolvedSrc.match(/source[_-]images?\D*?(\d+)\s*$/i)
          || resolvedSrc.match(/\/api\/source-images\/(\d+)/)
          || resolvedSrc.match(/\/api\/oma\/images\/([a-zA-Z0-9_]+)/)
          || resolvedSrc.match(/^(\d+)$/);
        if (idMatch) {
          if (resolvedSrc.includes('/api/oma/images/') || /^ima_/.test(idMatch[1])) {
            resolvedSrc = `${API_URL}/api/oma/images/${idMatch[1]}`;
          } else {
            resolvedSrc = `${API_URL}/api/source-images/${idMatch[1]}`;
          }
        } else if (resolvedSrc.startsWith('/api/')) {
          resolvedSrc = `${API_URL}${resolvedSrc}`;
        }
        const pageMatch = SOURCE_PAGE.exec(resolvedSrc);
        const citation = pageMatch ? citationFor(pageMatch[1], Number(pageMatch[2])) : null;
        if (isSourceImage(resolvedSrc)) {
          if (!imageAccess) return <span className="pedro-figure pedro-figure--loading" role="status">Loading slide…</span>;
          resolvedSrc = imageUrl(resolvedSrc, imageAccess);
        } else if (!/^(data:image\/(png|jpe?g|gif|webp);|blob:)/i.test(resolvedSrc)) {
          // Only Coast's own slides and images: an outside image address can carry data out of
          // the page (a classic prompt-injection trick), so it is never loaded.
          return <span className="pedro-figure pedro-figure--missing" data-missing={alt ? `Image not shown: ${alt}` : 'Image not shown'} />;
        }
        const image = (
          <img
            referrerPolicy="no-referrer"
            src={resolvedSrc}
            alt={alt || ''}
            loading="lazy"
            onError={(e) => {
              console.warn('[PedroMessage] Source diagram could not be loaded');
              const figure = e.currentTarget.closest('.pedro-figure');
              if (figure) {
                figure.classList.add('pedro-figure--missing');
                figure.dataset.missing = alt ? `Slide unavailable: ${alt}` : 'Slide unavailable';
              }
            }}
          />
        );
        return (
          <span className="pedro-figure">
            {citation ? (
              <button type="button" className="pedro-figure-frame" onClick={() => onCitation(citation)}
                aria-label={`Open ${citation.title}, ${pageLabel(citation)}`}>
                {image}
                <span className="pedro-figure-zoom" aria-hidden="true"><Maximize2 size={14} /></span>
              </button>
            ) : <span className="pedro-figure-frame">{image}</span>}
            {(alt || citation) && (
              <span className="pedro-figure-caption">
                {citation && <span className="pedro-figure-page">{shortSourceLabel(citation.title)} · {pageLabel(citation)}</span>}
                {alt && <span>{alt}</span>}
              </span>
            )}
          </span>
        );
      },
    };
  }, [imageAccess, sourceReferences, onCitation]);
  if (!text.trim()) return null;
  return (
    <StreamingContext.Provider value={streaming}>
      <ReactMarkdown remarkPlugins={plugins} rehypePlugins={REHYPE_PLUGINS} components={components}>
        {sanitizePedroMarkdown(text)}
      </ReactMarkdown>
    </StreamingContext.Provider>
  );
}

// Pedro's drawings get their own sanitizer: no scripts or event handlers (DOMPurify), and no
// references to outside files, which could leak data through the address they load.
const svgPurifier = DOMPurify(window);
svgPurifier.addHook('uponSanitizeAttribute', (_node, data) => {
  const value = String(data.attrValue || '').trim();
  if ((data.attrName === 'href' || data.attrName === 'xlink:href') && !value.startsWith('#')) data.keepAttr = false;
  if ((data.attrName === 'src' || data.attrName === 'srcset' || data.attrName === 'poster') && !/^data:image\//i.test(value)) data.keepAttr = false;
  if (/url\s*\(\s*['"]?\s*(?!#)/i.test(value)) data.keepAttr = false;
});

function SvgViz({ markup }) {
  return (
    <div
      className="pedro-svg-viz"
      dangerouslySetInnerHTML={{ __html: svgPurifier.sanitize(markup, { USE_PROFILES: { html: true, svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'iframe', 'object', 'embed', 'style', 'script', 'link', 'meta', 'base', 'form'] }) }}
    />
  );
}

function PedroMessage({ text, content, isStreaming = false, streamIdle = false, sourceReferences, onCitation, onWidgetResult = null }) {
  const displayText = text || content || '';
  const streamMarkdownText = useThrottledValue(displayText, isStreaming ? STREAM_MARKDOWN_MS : 0);
  const showStreamCursor = isStreaming && !streamIdle;
  const widgets = useMemo(() => ({ onResult: onWidgetResult }), [onWidgetResult]);

  if (!displayText && !isStreaming) return null;

  if (isStreaming) {
    if (!displayText) return null;
    return (
      <div className="pedro-rich-text pedro-rich-text--streaming">
        {streamingSvgParts(streamMarkdownText).map((part, i) => (
          part.type === 'svg' ? <SvgViz key={i} markup={part.content} />
            : part.type === 'pending-svg' ? <div key={i} className="pedro-svg-viz pedro-svg-viz--pending" role="status">Drawing a diagram…</div>
              : <MarkdownBlock key={i} text={part.content} sourceReferences={sourceReferences} onCitation={onCitation} streaming />
        ))}
        {showStreamCursor && <span className="pedro-stream-cursor" aria-hidden="true"><i /><i /><i /></span>}
      </div>
    );
  }

  if (!displayText) return null;

  const hasSvg = /<svg[\s\S]*?<\/svg>/i.test(displayText);

  const parts = hasSvg ? splitSvgBlocks(displayText) : [{ type: 'markdown', content: displayText }];

  return (
    <WidgetContext.Provider value={widgets}>
      <div className="pedro-rich-text">
        {parts.map((part, i) => (part.type === 'svg'
          ? <SvgViz key={i} markup={part.content} />
          : <MarkdownBlock key={i} text={part.content} sourceReferences={sourceReferences} onCitation={onCitation} />))}
      </div>
    </WidgetContext.Provider>
  );
}

export default React.memo(PedroMessage);
