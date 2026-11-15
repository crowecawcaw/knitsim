import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, decodeB64, encodeB64, parseState, serializeState } from './urlState';

describe('url state', () => {
  it('round-trips unicode through url-safe base64', () => {
    const text = 'pattern "Ünïcode ″ × →"\n# comment\npiece a\nend\n';
    const b = encodeB64(text);
    expect(b).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeB64(b)).toBe(text);
  });

  it('omits defaults', () => {
    expect(serializeState(DEFAULT_STATE)).toBe('');
  });

  it('round-trips a full state', () => {
    const s = { code: 'pattern "x"', params: { size: 'M', width: 9.5 }, mode: 'assembled' as const, tab: 'checks' as const };
    expect(parseState(serializeState(s))).toEqual(s);
  });

  it('ignores garbage', () => {
    expect(parseState('?code=%%%&params=bm90IGpzb24&mode=nope&tab=1')).toEqual(DEFAULT_STATE);
  });
});
