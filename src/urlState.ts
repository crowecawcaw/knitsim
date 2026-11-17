// The route lives in the URL query string so views can be shared and the back button works.
//
//   (no query)                     the project browser
//   ?p=<project id>                a saved project (its code and params live in the projects API)
//   ?code=<base64url(UTF-8 DSL)>   a shared pattern, not saved yet
//     &params=<base64url(JSON)>    its parameter overrides
//
// Project views also take:
//   &view=sim|written              3D simulation (default) or the written pattern
//   &mode=pieces|aligned|assembled 3D layout (default: assembled)
//   &drawer=code|checks            the source drawer, when open
//
// Defaults are omitted to keep links short. Old links with `tab=pattern|checks` open the drawer.

import type { ParamValues } from './knit';

export type ViewMode = 'pieces' | 'aligned' | 'assembled';
export type View = 'sim' | 'written';
export type Drawer = 'code' | 'checks' | null;

export interface ViewState {
  view: View;
  mode: ViewMode;
  drawer: Drawer;
}

export type Route =
  | { page: 'browser' }
  | ({ page: 'project'; id: string } & ViewState)
  | ({ page: 'shared'; code: string; params: ParamValues } & ViewState);

const MODES: ViewMode[] = ['pieces', 'aligned', 'assembled'];
const VIEWS: View[] = ['sim', 'written'];

export const DEFAULT_VIEW: ViewState = { view: 'sim', mode: 'assembled', drawer: null };

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

function parseView(q: URLSearchParams): ViewState {
  const v: ViewState = { ...DEFAULT_VIEW };
  const mode = q.get('mode') as ViewMode | null;
  if (mode && MODES.includes(mode)) v.mode = mode;
  const view = q.get('view') as View | null;
  if (view && VIEWS.includes(view)) v.view = view;
  const drawer = q.get('drawer') ?? ({ pattern: 'code', checks: 'checks' } as Record<string, string>)[q.get('tab') ?? ''];
  if (drawer === 'code' || drawer === 'checks') v.drawer = drawer;
  return v;
}

export function parseRoute(search: string): Route {
  const q = new URLSearchParams(search);
  const id = q.get('p');
  if (id) return { page: 'project', id, ...parseView(q) };
  const code = q.get('code');
  if (code) {
    let src: string;
    try { src = decodeB64(code); } catch { return { page: 'browser' }; }
    let params: ParamValues = {};
    const ps = q.get('params');
    if (ps) {
      try {
        const v = JSON.parse(decodeB64(ps));
        if (v && typeof v === 'object' && !Array.isArray(v)) params = v;
      } catch { /* ignore */ }
    }
    return { page: 'shared', code: src, params, ...parseView(q) };
  }
  return { page: 'browser' };
}

export function serializeRoute(r: Route): string {
  const q = new URLSearchParams();
  if (r.page === 'project') q.set('p', r.id);
  if (r.page === 'shared') {
    q.set('code', encodeB64(r.code));
    if (Object.keys(r.params).length) q.set('params', encodeB64(JSON.stringify(r.params)));
  }
  if (r.page !== 'browser') {
    if (r.view !== DEFAULT_VIEW.view) q.set('view', r.view);
    if (r.mode !== DEFAULT_VIEW.mode) q.set('mode', r.mode);
    if (r.drawer) q.set('drawer', r.drawer);
  }
  const str = q.toString();
  return str ? '?' + str : '';
}

/** A link that opens this pattern for anyone (projects are stored per browser, so links carry the source). */
export function shareLink(code: string, params: ParamValues, view: ViewState): string {
  return location.origin + location.pathname + serializeRoute({ page: 'shared', code, params, ...view, drawer: null });
}

/** Put a route in the address bar. `push` adds a history entry (page changes); otherwise it is replaced. */
export function writeRoute(r: Route, push = false) {
  const url = location.pathname + serializeRoute(r) + location.hash;
  if (url === location.pathname + location.search + location.hash) return;
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}
