/** Average mastery % across sections (0–100). */
export function computeFolderProgress(meta) {
  if (!meta?.has_outline) return 0;
  const total = meta.total_sections || meta.section_progress?.length || 0;
  if (total === 0) return 0;
  const prog = meta.section_progress || [];
  let sum = 0;
  for (let i = 0; i < total; i += 1) {
    const p = prog[i];
    if (p?.mastery_pct != null) sum += p.mastery_pct;
    else if (i < (meta.current_section || 0)) sum += 100;
  }
  return Math.min(100, Math.round(sum / total));
}

export function isFolderMastered(meta) {
  if (!meta?.has_outline) return false;
  if (meta.ever_mastered) return true;

  const total = meta.total_sections || meta.section_progress?.length || 0;
  if (total === 0) return false;

  // Finishing every section in Pedro's lesson flow counts as mastered.
  if (meta.is_complete && (meta.current_section || 0) >= total) return true;

  const prog = meta.section_progress || [];
  for (let i = 0; i < total; i += 1) {
    if ((prog[i]?.mastery_pct ?? 0) < 100) return false;
  }
  return true;
}

export function countCompletedSections(meta) {
  if (!meta?.has_outline) return 0;
  const total = meta.total_sections || meta.section_progress?.length || 0;
  if (total === 0) return 0;
  const prog = meta.section_progress || [];
  const current = meta.current_section || 0;
  let completed = 0;
  for (let i = 0; i < total; i += 1) {
    const p = prog[i];
    if ((p?.mastery_pct ?? 0) >= 100) completed += 1;
    else if (i < current) completed += 1;
  }
  return completed;
}

/** 'not-started' | 'in-progress' | 'mastered' */
export function getCardState(meta) {
  if (isFolderMastered(meta)) return 'mastered';
  if (!meta?.has_outline) return 'not-started';
  const completed = countCompletedSections(meta);
  const pct = computeFolderProgress(meta);
  if (completed === 0 && pct === 0) return 'not-started';
  return 'in-progress';
}

/** @deprecated use getCardState */
export function getProgressTier(meta) {
  const state = getCardState(meta);
  if (state === 'mastered') return 'mastered';
  if (state === 'in-progress') return 'badge';
  return 'lightbulb';
}

export function findContinueFolder(folderNames, metaMap) {
  const candidates = folderNames
    .map((name) => ({ name, meta: metaMap[name] || {} }))
    .filter(({ meta }) => {
      if (!meta?.has_outline) return false;
      if (meta.is_complete) return false;
      return getCardState(meta) === 'in-progress';
    });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const curA = a.meta.current_section || 0;
    const curB = b.meta.current_section || 0;
    if (curB !== curA) return curB - curA;
    return computeFolderProgress(b.meta) - computeFolderProgress(a.meta);
  });

  return candidates[0];
}
