// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryBackend,
  cacheSet,
  resetCacheBackend,
  setCacheBackendForTests,
} from './cache';
import { hidratarCacheNavegador, queryClient } from './query-client';
import { claveCalendario, clavePerfil } from './cache-claves';

beforeEach(() => {
  queryClient.clear();
  setCacheBackendForTests(new InMemoryBackend());
});

afterEach(() => {
  queryClient.clear();
  resetCacheBackend();
});

describe('hidratarCacheNavegador', () => {
  it('hidrata perfil y calendario desde copias frescas', async () => {
    await cacheSet(clavePerfil('u1'), { profile: { id: 'u1' } });
    await cacheSet(claveCalendario('org1'), { profile: { organization_id: 'org1' } });

    await hidratarCacheNavegador({ userId: 'u1', orgId: 'org1' });

    expect(queryClient.getQueryData(['perfil', 'datos'])).toEqual({ profile: { id: 'u1' } });
    expect(queryClient.getQueryData(['calendario', 'datos'])).toEqual({
      profile: { organization_id: 'org1' },
    });
  });

  it('no hidrata si la copia supera el TTL', async () => {
    const backend = new InMemoryBackend();
    setCacheBackendForTests(backend);
    // 20 minutos > TTL de perfil (10 min).
    await backend.set(clavePerfil('u2'), { profile: { id: 'u2' } }, Date.now() - 20 * 60_000);

    await hidratarCacheNavegador({ userId: 'u2', orgId: null });

    expect(queryClient.getQueryData(['perfil', 'datos'])).toBeUndefined();
  });

  it('no pisa datos ya presentes en cache', async () => {
    await cacheSet(clavePerfil('u3'), { profile: { id: 'u3', full_name: 'Antiguo' } });
    queryClient.setQueryData(['perfil', 'datos'], { profile: { id: 'u3', full_name: 'Actual' } });

    await hidratarCacheNavegador({ userId: 'u3', orgId: null });

    expect(queryClient.getQueryData(['perfil', 'datos'])).toEqual({
      profile: { id: 'u3', full_name: 'Actual' },
    });
  });

  it('sin userId ni orgId no toca la caché', async () => {
    await hidratarCacheNavegador({ userId: null, orgId: null });
    expect(queryClient.getQueryData(['perfil', 'datos'])).toBeUndefined();
    expect(queryClient.getQueryData(['calendario', 'datos'])).toBeUndefined();
  });
});
