// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidarPorClavesCache } from './cache-invalidacion';

function clienteConSpy() {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
  return { qc, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('invalidarPorClavesCache', () => {
  it('invalida solo calendario para claves cs:calendar', () => {
    const { qc, spy } = clienteConSpy();
    invalidarPorClavesCache(qc, ['cs:calendar:v1:org1']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({ queryKey: ['calendario'] });
  });

  it('invalida solo perfil para claves cs:perfil', () => {
    const { qc, spy } = clienteConSpy();
    invalidarPorClavesCache(qc, ['cs:perfil:v1:user1']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({ queryKey: ['perfil'] });
  });

  it('ignora preferencias y estructura (fuera de React Query)', () => {
    const { qc, spy } = clienteConSpy();
    invalidarPorClavesCache(qc, ['cs:prefs:v1:u1', 'cs:structure:v1:u1']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('claves desconocidas invalidan todo como fallback', () => {
    const { qc, spy } = clienteConSpy();
    invalidarPorClavesCache(qc, ['cs:desconocida:v1:x']);
    expect(spy).toHaveBeenCalledWith();
  });
});
