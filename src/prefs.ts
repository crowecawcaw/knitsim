/** Small per-viewer UI preferences (folded cards, hidden panels). Storage can be blocked, so never rely on it. */
export function loadPref(key: string): string | null {
  try { return localStorage.getItem('knitsim.' + key); } catch { return null; }
}
export function savePref(key: string, value: string) {
  try { localStorage.setItem('knitsim.' + key, value); } catch { /* private mode etc. */ }
}
