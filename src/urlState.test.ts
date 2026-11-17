import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, decodeB64, encodeB64, parseRoute, serializeRoute, type Route } from './urlState';

describe('url state', () => {
  it('round-trips unicode through url-safe base64', () => {
    const text = 'pattern "Ünïcode ″ × →"\n# comment\npiece a\nend\n';
    const b = encodeB64(text);
    expect(b).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeB64(b)).toBe(text);
  });

  it('defaults to the browser, with an empty query', () => {
    expect(parseRoute('')).toEqual({ page: 'browser' });
    expect(serializeRoute({ page: 'browser' })).toBe('');
  });

  it('omits view defaults; assembled is the default mode', () => {
    expect(serializeRoute({ page: 'project', id: 'abc', ...DEFAULT_VIEW })).toBe('?p=abc');
    expect(parseRoute('?p=abc')).toEqual({ page: 'project', id: 'abc', view: 'sim', mode: 'assembled', drawer: null });
  });

  it('round-trips a project route', () => {
    const r: Route = { page: 'project', id: 'x1', view: 'written', mode: 'pieces', drawer: 'checks' };
    expect(parseRoute(serializeRoute(r))).toEqual(r);
  });

  it('round-trips a shared pattern', () => {
    const r: Route = { page: 'shared', code: 'pattern "x"', params: { size: 'M', width: 9.5 }, view: 'sim', mode: 'aligned', drawer: 'code' };
    expect(parseRoute(serializeRoute(r))).toEqual(r);
  });

  it('reads old tab= links as the drawer', () => {
    const r = parseRoute('?code=' + encodeB64('x') + '&tab=pattern');
    expect(r.page === 'shared' && r.drawer).toBe('code');
  });

  it('ignores garbage', () => {
    expect(parseRoute('?code=%%%')).toEqual({ page: 'browser' });
    expect(parseRoute('?code=' + encodeB64('x') + '&params=bm90IGpzb24&mode=nope&view=1')).toEqual({ page: 'shared', code: 'x', params: {}, ...DEFAULT_VIEW });
  });
});
