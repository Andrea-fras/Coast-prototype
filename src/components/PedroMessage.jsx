import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { API_URL } from '../config';

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

function MarkdownBlock({ text }) {
  if (!text.trim()) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p style={{ margin: '0.4em 0' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: '0.3em 0', paddingLeft: '1.3em' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0.3em 0', paddingLeft: '1.3em' }}>{children}</ol>,
        li: ({ children }) => <li style={{ marginBottom: '0.2em' }}>{children}</li>,
        strong: ({ children }) => <strong style={{ color: 'inherit', fontWeight: 700 }}>{children}</strong>,
        code: ({ inline, children, ...props }) =>
          inline !== false && !props.className ? (
            <code style={{
              background: 'rgba(0,0,0,0.06)',
              borderRadius: '4px',
              padding: '0.15em 0.35em',
              fontSize: '0.9em',
              fontFamily: "'SF Mono', 'Fira Code', monospace",
            }}>{children}</code>
          ) : (
            <pre style={{
              background: 'rgba(0,0,0,0.05)',
              borderRadius: '8px',
              padding: '0.7em 1em',
              overflowX: 'auto',
              fontSize: '0.85em',
              margin: '0.5em 0',
            }}><code {...props}>{children}</code></pre>
          ),
        blockquote: ({ children }) => (
          <blockquote style={{
            borderLeft: '3px solid #6c5ce7',
            margin: '0.5em 0',
            paddingLeft: '0.8em',
            color: 'inherit',
            opacity: 0.85,
          }}>{children}</blockquote>
        ),
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '0.5em 0' }}>
            <table style={{
              borderCollapse: 'collapse',
              width: '100%',
              fontSize: '0.88em',
            }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{
            border: '1px solid rgba(0,0,0,0.12)',
            padding: '0.4em 0.6em',
            background: 'rgba(0,0,0,0.04)',
            fontWeight: 600,
            textAlign: 'left',
          }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{
            border: '1px solid rgba(0,0,0,0.08)',
            padding: '0.4em 0.6em',
          }}>{children}</td>
        ),
        img: ({ src, alt, ...props }) => {
          let resolvedSrc = src || '';
          if (resolvedSrc.startsWith('/api/')) {
            resolvedSrc = `${API_URL}${resolvedSrc}`;
          } else if (/\/api\/source-images\/\d+/.test(resolvedSrc)) {
            const match = resolvedSrc.match(/(\/api\/source-images\/\d+)/);
            if (match) resolvedSrc = `${API_URL}${match[1]}`;
          }
          return (
            <img
              src={resolvedSrc}
              alt={alt || ''}
              {...props}
              style={{
                maxWidth: '100%',
                borderRadius: '8px',
                margin: '0.6em 0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
              loading="lazy"
              onError={(e) => {
                console.warn('[PedroMessage] Image failed to load:', resolvedSrc);
                e.target.onerror = null;
                e.target.style.display = 'none';
                const fallback = document.createElement('div');
                fallback.textContent = alt ? `[Diagram: ${alt}]` : '[Diagram unavailable]';
                fallback.style.cssText = 'padding:0.5em 0.8em;background:rgba(0,0,0,0.04);border-radius:6px;font-size:0.85em;color:#888;font-style:italic;margin:0.4em 0;';
                e.target.parentNode.insertBefore(fallback, e.target.nextSibling);
              }}
            />
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default function PedroMessage({ text, content }) {
  const displayText = text || content || '';
  if (!displayText) return null;

  const hasSvg = /<svg[\s\S]*?<\/svg>/i.test(displayText);

  if (!hasSvg) {
    return (
      <div className="pedro-rich-text">
        <MarkdownBlock text={displayText} />
      </div>
    );
  }

  const parts = splitSvgBlocks(displayText);

  return (
    <div className="pedro-rich-text">
      {parts.map((part, i) =>
        part.type === 'svg' ? (
          <div
            key={i}
            className="pedro-svg-viz"
            style={{
              maxWidth: '100%',
              overflow: 'hidden',
              margin: '0.8em 0',
              borderRadius: '10px',
              textAlign: 'center',
            }}
            dangerouslySetInnerHTML={{ __html: part.content }}
          />
        ) : (
          <MarkdownBlock key={i} text={part.content} />
        )
      )}
    </div>
  );
}
