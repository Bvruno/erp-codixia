// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoguardado } from './use-autoguardado';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoguardado', () => {
  it('agrupa ediciones y guarda una sola vez tras el debounce', async () => {
    const guardar = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoguardado(guardar, { debounceMs: 500 })
    );

    act(() => result.current.marcarSucio());
    act(() => result.current.marcarSucio());
    expect(guardar).not.toHaveBeenCalled();
    expect(result.current.estado).toBe('pendiente');

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(guardar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('guardado');
  });

  it('guardarYa fuerza el guardado sin esperar el debounce', async () => {
    const guardar = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoguardado(guardar, { debounceMs: 500 })
    );

    act(() => result.current.marcarSucio());
    await act(async () => result.current.guardarYa());

    expect(guardar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('guardado');
  });

  it('guarda cambios pendientes al desmontar', async () => {
    const guardar = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useAutoguardado(guardar, { debounceMs: 500 })
    );

    act(() => result.current.marcarSucio());
    unmount();

    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it('en error conserva los cambios y reintentar vuelve a guardar', async () => {
    const guardar = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAutoguardado(guardar, { debounceMs: 100, onError })
    );

    act(() => result.current.marcarSucio());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.estado).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);

    await act(async () => result.current.reintentar());

    expect(guardar).toHaveBeenCalledTimes(2);
    expect(result.current.estado).toBe('guardado');
  });

  it('no pierde ediciones hechas mientras guarda', async () => {
    let resolver: () => void = () => {};
    const guardar = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((res) => {
            resolver = res;
          })
      )
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoguardado(guardar, { debounceMs: 100 })
    );

    act(() => result.current.marcarSucio());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(guardar).toHaveBeenCalledTimes(1);

    act(() => result.current.marcarSucio());
    await act(async () => {
      resolver();
    });
    expect(result.current.estado).toBe('pendiente');

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(result.current.estado).toBe('guardado');
  });
});
