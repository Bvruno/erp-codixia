// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolverTema, aplicarTema, suscribirTemaSistema } from './tema';

function mockMatchMedia(matches: boolean) {
  let handler: (() => void) | null = null;
  const mql = {
    matches,
    addEventListener: vi.fn((_e: string, cb: () => void) => {
      handler = cb;
    }),
    removeEventListener: vi.fn(),
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(
    mql as unknown as MediaQueryList,
  );
  return {
    mql,
    cambiar(valor: boolean) {
      mql.matches = valor;
      handler?.();
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('tema', () => {
  it('resuelve dark y light directos sin tocar matchMedia', () => {
    expect(resolverTema('dark')).toBe('dark');
    expect(resolverTema('light')).toBe('light');
  });

  it('resuelve system según el SO', () => {
    mockMatchMedia(true);
    expect(resolverTema('system')).toBe('dark');
    mockMatchMedia(false);
    expect(resolverTema('system')).toBe('light');
  });

  it('aplicarTema setea data-mode', () => {
    mockMatchMedia(false);
    aplicarTema('light');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    aplicarTema('system');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
  });

  it('suscribirTemaSistema avisa al cambiar el SO y limpia', () => {
    const { mql, cambiar } = mockMatchMedia(false);
    const onCambio = vi.fn();
    const desuscribir = suscribirTemaSistema('system', onCambio);

    cambiar(true);
    expect(onCambio).toHaveBeenCalledWith('dark');

    desuscribir();
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('suscribirTemaSistema no hace nada con tema fijo', () => {
    const { mql } = mockMatchMedia(false);
    const desuscribir = suscribirTemaSistema('dark', vi.fn());
    expect(mql.addEventListener).not.toHaveBeenCalled();
    desuscribir();
  });
});
