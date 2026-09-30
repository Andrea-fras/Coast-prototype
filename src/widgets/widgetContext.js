import { createContext } from 'react';

/** onResult(text) sends a lab's result to Pedro as the student's message; null where a lab
 *  can't talk to Pedro (a past section, the open chat), so the lab still runs but has no send button. */
export const WidgetContext = createContext({ onResult: null });
