/** Deadline-based timer: elapsed wall time survives sleeping tabs and reloads. */
export const PRESETS = {
  classic: { focus: 25 * 60, short: 5 * 60, long: 15 * 60, label: '25 / 5' },
  deep: { focus: 50 * 60, short: 10 * 60, long: 20 * 60, label: '50 / 10' },
  sprint: { focus: 15 * 60, short: 3 * 60, long: 10 * 60, label: '15 / 3' },
};
export function initialTimer() {
  return { preset: 'classic', mode: 'focus', remaining: 1500, deadline: null, sessions: 0 };
}
export function remainingSeconds(state, now) {
  return state.deadline == null ? state.remaining : Math.max(0, Math.ceil((state.deadline - now) / 1000));
}
export function restoreTimer(raw, now) {
  try {
    const saved = JSON.parse(raw);
    if (!PRESETS[saved.preset]?.[saved.mode] || !Number.isFinite(saved.remaining)
      || saved.remaining < 0 || saved.remaining > PRESETS[saved.preset][saved.mode]
      || !Number.isInteger(saved.sessions) || saved.sessions < 0
      || (saved.deadline !== null && !Number.isFinite(saved.deadline))) return initialTimer();
    return timerReducer(saved, { type: 'tick', now });
  } catch { return initialTimer(); }
}
export function timerReducer(state, action) {
  if (action.type === 'tick') {
    if (state.deadline == null || remainingSeconds(state, action.now) > 0) return state;
    const sessions = state.sessions + (state.mode === 'focus' ? 1 : 0);
    const mode = state.mode === 'focus' ? (sessions % 4 === 0 ? 'long' : 'short') : 'focus';
    // Never count unattended break/focus cycles after a laptop sleeps.
    return { ...state, sessions, mode, remaining: PRESETS[state.preset][mode], deadline: null };
  }
  if (action.type === 'toggle') {
    if (state.deadline != null && remainingSeconds(state, action.now) === 0) return timerReducer(state, { type: 'tick', now: action.now });
    return state.deadline == null
      ? { ...state, deadline: action.now + state.remaining * 1000 }
      : { ...state, remaining: remainingSeconds(state, action.now), deadline: null };
  }
  const preset = action.type === 'preset' ? action.preset : state.preset;
  const mode = action.type === 'mode' ? action.mode : state.mode;
  return { ...state, preset, mode, remaining: PRESETS[preset][mode], deadline: null };
}
