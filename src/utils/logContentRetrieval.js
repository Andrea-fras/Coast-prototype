/** Log OMA vs RAG retrieval info to the browser DevTools console. */
export function logContentRetrieval(evt) {
  const cr = evt?.content_retrieval;
  if (!cr) return;
  if (!cr.primary) {
    if (cr.entries?.length) {
      console.log('[Coast] Content retrieval (no primary label):', cr.entries);
    }
    return;
  }

  const color =
    cr.primary === 'OMA' ? '#059669'
    : cr.primary === 'RAG' ? '#d97706'
    : '#6b7280';

  console.log(
    `%c[Coast] Content source: ${cr.primary}`,
    `color: ${color}; font-weight: bold; font-size: 12px`,
    cr.entries,
  );

  const images = cr.images || [];
  const offered = cr.images_offered ?? images.length;
  if (images.length > 0) {
    console.log(
      `%c[Coast] Diagrams used in Pedro's reply (${images.length}${offered > images.length ? ` of ${offered} offered` : ''})`,
      'color: #7c3aed; font-weight: bold; font-size: 12px',
    );
    images.forEach((img, i) => {
      console.log(
        `%c  ${i + 1}. ${img.image_type || 'figure'} — p.${img.page ?? '?'} (${img.source || '?'})`,
        'color: #7c3aed',
        img.description,
        img.url,
      );
    });
  } else if (offered > 0) {
    console.log(
      `%c[Coast] Diagrams: none embedded (${offered} were offered to Pedro)`,
      'color: #9ca3af; font-size: 12px',
    );
  }
}
