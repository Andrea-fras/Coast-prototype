import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

export default function PedroMessage({ text }) {
  return (
    <div className="pedro-rich-text">
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
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
