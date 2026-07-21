/**
 * Trigger utility for the intelligence pipeline.
 *
 * Any data input (quick note, communication, behaviour record, etc.) calls
 * `triggerReanalysis(schoolId)`. The call is debounced: if multiple inputs
 * arrive within a short window, the pipeline only runs once.
 *
 * This keeps signals, actions, and the queue up-to-date without running the
 * full pipeline on every keystroke.
 */

import { runFullAnalysis } from './signalEngine';

let pendingSchools = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 2000;

const listeners: Array<() => void> = [];

export function onAnalysisComplete(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
}

function notifyListeners() {
  listeners.forEach(fn => { try { fn(); } catch (_) {} });
}

export function triggerReanalysis(schoolId: string | null | undefined): void {
  if (!schoolId) return;

  const existing = pendingSchools.get(schoolId);
  if (existing) clearTimeout(existing);

  pendingSchools.set(schoolId, setTimeout(async () => {
    pendingSchools.delete(schoolId);
    try {
      await runFullAnalysis(schoolId);
      notifyListeners();
    } catch (err) {
      console.error('[SignalEngine] Re-analysis failed:', err);
    }
  }, DEBOUNCE_MS));
}

/**
 * Run analysis immediately (no debounce). Used after CSV upload where we want
 * results before showing the success screen.
 */
export async function runAnalysisImmediate(schoolId: string): Promise<{ attendanceConcerns: number; actionsGenerated: number }> {
  const existing = pendingSchools.get(schoolId);
  if (existing) {
    clearTimeout(existing);
    pendingSchools.delete(schoolId);
  }
  const result = await runFullAnalysis(schoolId);
  notifyListeners();
  return result;
}

