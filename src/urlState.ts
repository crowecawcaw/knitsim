// All app state lives in the URL query string so any view can be shared by link.
//
//   ?code=<base64url(UTF-8 DSL source)>
//   &params=<base64url(JSON of param overrides)>
//   &mode=pieces|aligned|assembled
//   &tab=pattern|sim|checks
//
// Defaults are omitted to keep links short.

import type { ParamValues } from './knit';
import { DEFAULT_EXAMPLE } from './knit/examples';

export type ViewMode = 'pieces' | 'aligned' | 'assembled';
export type Tab = 'pattern' | 'sim' | 'checks';

export interface AppState {
  code: string;
  params: ParamValues;
  mode: ViewMode;
  tab: Tab;
}

const MODES: ViewMode[] = ['pieces', 'aligned', 'assembled'];
const TABS: Tab[] = ['pattern', 'sim', 'checks'];

export const DEFAULT_STATE: AppState = { code: DEFAULT_EXAMPLE.src, params: {}, mode: 'pieces', tab: 'sim' };

export function encodeB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeB64(b64: string): string {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function parseState(search: string): AppState {
  const q = new URLSearchParams(search);
  const state: AppState = { ...DEFAULT_STATE, params: {} };
  const code = q.get('code');
  if (code) {
    try { state.code = decodeB64(code); } catch { /* bad link: fall back to default */ }
  }
  const params = q.get('params');
  if (params) {
    try {
      const v = JSON.parse(decodeB64(params));
      if (v && typeof v === 'object' && !Array.isArray(v)) state.params = v;
    } catch { /* ignore */ }
  }
  const mode = q.get('mode') as ViewMode | null;
  if (mode && MODES.includes(mode)) state.mode = mode;
  const tab = q.get('tab') as Tab | null;
  if (tab && TABS.includes(tab)) state.tab = tab;
  return state;
}

export function serializeState(s: AppState): string {
  const q = new URLSearchParams();
  if (s.code !== DEFAULT_STATE.code) q.set('code', encodeB64(s.code));
  if (Object.keys(s.params).length) q.set('params', encodeB64(JSON.stringify(s.params)));
  if (s.mode !== DEFAULT_STATE.mode) q.set('mode', s.mode);
  if (s.tab !== DEFAULT_STATE.tab) q.set('tab', s.tab);
  const str = q.toString();
  return str ? '?' + str : '';
}

/** Replace the current URL's query string (no history entry, no reload). */
export function writeState(s: AppState) {
  const url = location.pathname + serializeState(s) + location.hash;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
}
