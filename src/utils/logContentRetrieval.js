/** Log OMA vs RAG retrieval to DevTools console. */
export function logContentSource(primary, detail = {}) {
  if (!primary) return;
  const color =
    primary === 'OMA' ? '#059669'
    : primary === 'RAG' ? '#d97706'
    : '#6b7280';
  console.log(
    `%c[Coast] Content source: ${primary}`,
    `color: ${color}; font-weight: bold; font-size: 12px`,
    detail,
  );
}

export function logContentRetrieval(evt) {
  const cr = evt?.content_retrieval;
  if (!cr) return;

  if (cr.entries?.length) {
    for (const entry of cr.entries) {
      const src = (entry.source || '').startsWith('RAG') ? 'RAG' : entry.source || 'unknown';
      if (src === 'OMA' || src.startsWith('RAG') || src === 'FALLBACK') {
        logContentSource(src === 'FALLBACK' ? 'RAG' : src, {
          context: entry.context_type,
          folder: entry.folder,
          chars: entry.chars,
          detail: entry.detail,
        });
      }
    }
  }

  if (!cr.primary) return;

  logContentSource(cr.primary, {
    entries: cr.entries,
    oma_enabled: cr.oma_enabled,
    rag_provider: cr.rag_provider,
    oma_pages: cr.oma_pages,
  });

  if (cr.oma_enabled === false && cr.primary === 'RAG') {
    console.info('[Coast] Using RAG (Content OMA is off). Toggle with the dev switcher.');
  } else if (cr.primary === 'RAG' && cr.oma_enabled) {
    console.warn('[Coast] RAG fallback — OMA returned empty for this query.', cr);
  }

  const images = cr.images || [];
  const offered = cr.images_offered ?? images.length;
  if (images.length > 0) {
    console.log(
      `%c[Coast] Diagrams in Pedro's reply (${images.length}${offered > images.length ? ` of ${offered}` : ''})`,
      'color: #7c3aed; font-weight: bold; font-size: 12px',
    );
    images.forEach((img, i) => {
      console.log(
        `%c  ${i + 1}. ${img.image_type || 'figure'} — p.${img.page ?? '?'}`,
        'color: #7c3aed',
        img.description,
      );
    });
  }
}
