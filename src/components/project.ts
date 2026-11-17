import { useEffect, useMemo, useState } from 'react';
import { runPattern, type ParamValues } from '../knit';
import type { ViewState } from '../urlState';

export interface WorkingProject { name: string; code: string; params: ParamValues }

/** What App hands to either interface. */
export interface ProjectViewProps {
  project: WorkingProject;
  /** false for a shared link that hasn't been saved to the browser's projects */
  saved: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  view: ViewState;
  onView: (p: Partial<ViewState>) => void;
  onChange: (p: Partial<WorkingProject>) => void;
  onSaveCopy: () => void;
  onBack: () => void;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** The built pattern, re-run shortly after typing or dragging a setting stops. */
export function useDoc(code: string, params: ParamValues) {
  const runCode = useDebounced(code, 400);
  const runParams = useDebounced(params, 100);
  const doc = useMemo(() => runPattern(runCode, runParams), [runCode, runParams]);
  return { doc, runCode };
}
