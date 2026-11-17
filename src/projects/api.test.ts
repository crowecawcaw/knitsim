import { describe, expect, it } from 'vitest';
import { LocalProjectsApi, NotFoundError, type KeyValueStore } from './api';

const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

let t = Date.parse('2026-01-01T00:00:00Z');
const now = () => new Date((t += 1000));

describe('LocalProjectsApi', () => {
  it('seeds once, newest first', async () => {
    const store = mem();
    const seed = () => [{ name: 'A', code: 'pattern "A"' }, { name: 'B', code: 'pattern "B"' }];
    const api = new LocalProjectsApi({ store, seed, now });
    expect((await api.list()).map((p) => p.name)).toEqual(['A', 'B']);
    const again = new LocalProjectsApi({ store, seed: () => [{ name: 'C', code: '' }], now });
    expect((await again.list()).map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('creates, reads, updates and deletes', async () => {
    const api = new LocalProjectsApi({ store: mem(), now });
    const p = await api.create({ name: ' Hat ', code: 'yarn #AABBCC\npiece crown round\nend', params: { size: 'M' } });
    expect(p.name).toBe('Hat');
    expect(await api.get(p.id)).toEqual(p);

    const list = await api.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: p.id, colors: ['#aabbcc'], pieces: ['crown'] });
    expect(list[0]).not.toHaveProperty('code');

    const u = await api.update(p.id, { params: { size: 'L' }, name: '' });
    expect(u.params).toEqual({ size: 'L' });
    expect(u.name).toBe('Hat'); // blank names are ignored
    expect(u.updatedAt > p.updatedAt).toBe(true);

    await api.remove(p.id);
    await expect(api.get(p.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(api.update(p.id, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns copies, not live objects', async () => {
    const api = new LocalProjectsApi({ store: mem(), now });
    const p = await api.create({ name: 'x', code: '', params: { a: 1 } });
    p.params.a = 2;
    expect((await api.get(p.id)).params).toEqual({ a: 1 });
  });

  it('uses param colour overrides in the summary', async () => {
    const api = new LocalProjectsApi({ store: mem(), now });
    await api.create({ name: 'x', code: 'param main color = #111111 "Yarn"\nyarn ${main}', params: { main: '#222222' } });
    expect((await api.list())[0].colors).toEqual(['#222222']);
  });
});
