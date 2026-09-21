import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureErrorClient } from './captura-errores';

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('captureErrorClient', () => {
  function stubBrowserGlobals() {
    vi.stubGlobal('window', { location: { pathname: '/calendario' } });
    vi.stubGlobal('navigator', { userAgent: 'vitest-ua' });
  }

  it('envía el error a POST /api/errores con el userAgent del navegador', async () => {
    stubBrowserGlobals();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'err-1', isNew: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await captureErrorClient({ source: 'client', message: 'boom', route: '/calendario' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/errores');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      source: 'client',
      message: 'boom',
      userAgent: 'vitest-ua',
    });
  });

  it('no lanza cuando la API responde con error', async () => {
    stubBrowserGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'No se pudo registrar el error' }),
      })),
    );

    await expect(
      captureErrorClient({ source: 'client', message: 'boom' }),
    ).resolves.toBeUndefined();
  });

  it('no-op fuera del navegador', async () => {
    vi.stubGlobal('window', undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await captureErrorClient({ source: 'client', message: 'boom' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
