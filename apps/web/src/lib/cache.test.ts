// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheClearAll,
  setCacheBackendForTests,
  resetCacheBackend,
  InMemoryBackend,
  LocalStorageBackend,
  type CacheBackend,
} from '@/lib/cache';

describe('cacheGet / cacheSet', () => {
  beforeEach(() => {
    setCacheBackendForTests(new InMemoryBackend());
  });

  afterEach(() => {
    resetCacheBackend();
    vi.useRealTimers();
  });

  it('guarda y lee valores JSON', async () => {
    const payload = { workspaces: [{ id: 'w1', name: 'Espacio' }], counts: { l1: 3 } };
    await cacheSet('cs:structure:v1:user1', payload);
    const hit = await cacheGet<typeof payload>('cs:structure:v1:user1');
    expect(hit?.value).toEqual(payload);
    expect(hit?.cachedAt).toBeGreaterThan(0);
  });

  it('devuelve null para claves ausentes', async () => {
    expect(await cacheGet('nope')).toBeNull();
  });

  it('aísla por clave (usuario)', async () => {
    await cacheSet('cs:structure:v1:userA', { a: 1 });
    expect(await cacheGet('cs:structure:v1:userB')).toBeNull();
    expect(await cacheGet('cs:structure:v1:userA')).not.toBeNull();
  });

  it('ttl expira entradas viejas', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await cacheSet('cs:prefs:v1:u', { theme: 'dark' });
    vi.setSystemTime(new Date('2026-01-01T00:10:01Z'));
    expect(await cacheGet('cs:prefs:v1:u', 10 * 60 * 1000)).toBeNull();
    vi.setSystemTime(new Date('2026-01-01T00:09:59Z'));
    expect(await cacheGet('cs:prefs:v1:u', 10 * 60 * 1000)).not.toBeNull();
  });

  it('sin ttl sirve entradas viejas (stale-while-revalidate)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await cacheSet('cs:structure:v1:u', { v: 1 });
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    expect(await cacheGet('cs:structure:v1:u')).not.toBeNull();
  });

  it('del elimina una entrada y clear todo el store', async () => {
    await cacheSet('a', 1);
    await cacheSet('b', 2);
    await cacheDel('a');
    expect(await cacheGet('a')).toBeNull();
    expect(await cacheGet('b')).not.toBeNull();
    await cacheClearAll();
    expect(await cacheGet('b')).toBeNull();
  });
});

describe('backends', () => {
  it('LocalStorageBackend persiste con prefijo cs:', async () => {
    const backend = new LocalStorageBackend();
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    await backend.set('structure:v1:u', { x: 1 }, 1000);
    expect(spy).toHaveBeenCalledWith('cs:structure:v1:u', JSON.stringify({ v: { x: 1 }, t: 1000 }));
    spy.mockRestore();
  });

  it('LocalStorageBackend lee, borra y limpia solo claves cs:', async () => {
    const backend = new LocalStorageBackend();
    window.localStorage.setItem('other-key', 'keep');
    await backend.set('x', 'val', 123);
    expect((await backend.get('x'))?.v).toBe('val');
    await backend.del('x');
    expect(await backend.get('x')).toBeNull();
    await backend.set('y', 'v2', 124);
    await backend.clear();
    expect(await backend.get('y')).toBeNull();
    expect(window.localStorage.getItem('other-key')).toBe('keep');
  });

  it('LocalStorageBackend tolera fallos (quota/JSON corrupto)', async () => {
    const backend = new LocalStorageBackend();
    window.localStorage.setItem('cs:corrupt', 'no-json');
    expect(await backend.get('corrupt')).toBeNull();
  });
});

describe('backend resolution', () => {
  it('usa el backend fijado para tests', async () => {
    const custom: CacheBackend = {
      get: async () => ({ v: 'custom', t: 1 }),
      set: async () => undefined,
      del: async () => undefined,
      clear: async () => undefined,
    };
    setCacheBackendForTests(custom);
    expect((await cacheGet('k'))?.value).toBe('custom');
  });

  it('InMemoryBackend no comparte estado entre instancias', async () => {
    const a = new InMemoryBackend();
    const b = new InMemoryBackend();
    await a.set('k', 1, 0);
    expect(await b.get('k')).toBeNull();
  });
});