import React, { Suspense, useContext } from 'react';
import { FlaskConical, TriangleAlert } from 'lucide-react';
import { WIDGETS } from './registry';
import { WidgetContext } from './widgetContext';
import { parseWidget } from './parseWidget';
import './widgets.css';

class LabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { console.warn('[lab] crashed', error); }

  render() {
    if (this.state.failed) {
      return (
        <div className="lab lab--note" role="status">
          <TriangleAlert size={15} aria-hidden="true" /> This lab hit a problem. Reload the page to try it again.
        </div>
      );
    }
    return this.props.children;
  }
}

/** A lab Pedro placed in his reply with a ```widget block. Mounts only once the reply is
 *  complete, so a half-written block never starts a simulation. */
export default function WidgetBlock({ source, streaming }) {
  const { onResult } = useContext(WidgetContext);
  const spec = parseWidget(source);
  const entry = spec && WIDGETS[spec.id];
  if (streaming) {
    return (
      <div className="lab lab--pending" role="status">
        <FlaskConical size={15} aria-hidden="true" /> Setting up the {entry?.label || 'lab'}…
      </div>
    );
  }
  if (!entry) return null;  // an unknown tool name: say nothing rather than show code
  const Lab = entry.component;
  return (
    <LabErrorBoundary>
      <Suspense fallback={<div className="lab lab--pending" role="status"><FlaskConical size={15} aria-hidden="true" /> Loading the {entry.label}…</div>}>
        <Lab params={spec.params} onResult={onResult} />
      </Suspense>
    </LabErrorBoundary>
  );
}
