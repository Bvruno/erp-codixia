// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, api } from '@/lib/api/cliente';

vi.mock('../supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'acc-test',
            refresh_token: 'ref-test',
          },
        },
      }),
    },
  })),
}));

function responderJson(cuerpo: unknown, status = 200) {
  return vi.fn().mockImplementation(
    () =>
      Promise.resolve(
        new Response(JSON.stringify(cuerpo), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      )
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('llama /api<ruta> con Authorization + X-Refresh-Token', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(responderJson({ ok: true }));

    await apiFetch<{ ok: boolean }>('/entidades/arbol');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/entidades/arbol');
    const cabeceras = new Headers(init.headers);
    expect(cabeceras.get('Authorization')).toBe('Bearer acc-test');
    expect(cabeceras.get('X-Refresh-Token')).toBe('ref-test');
    expect(cabeceras.get('Content-Type')).toBe('application/json');
  });

  it('devuelve el JSON tipado en 200', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ items: [1, 2] }));
    const resultado = await apiFetch<{ items: number[] }>('/x');
    expect(resultado).toEqual({ items: [1, 2] });
  });

  it('lanza ErrorApi con el mensaje del servidor', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ error: 'No autorizado' }, 403));

    await expect(apiFetch('/x')).rejects.toMatchObject({
      name: 'ErrorApi',
      status: 403,
      message: 'No autorizado',
    });
  });

  it('lanza ErrorApi genérico si el cuerpo no tiene error', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ detalle: 'otra cosa' }, 500));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 500, message: 'Error del servidor' });
  });

  it('tolera respuesta sin cuerpo JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('gateway timeout', { status: 502 }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 502 });
  });

  it('no pisa headers propios del llamador', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ ok: true }));
    await apiFetch('/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Content-Type')).toBe('multipart/form-data');
  });

  it('deduplica GETs concurrentes: 1 sola llamada a fetch', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(responderJson({ ok: true }));

    const [a, b, c] = await Promise.all([
      apiFetch('/entidades/arbol'),
      apiFetch('/entidades/arbol'),
      apiFetch('/entidades/arbol'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(c).toEqual({ ok: true });
  });

  it('no deduplica GETs tras resolver (peticiones secuenciales)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(responderJson({ ok: true }));

    await apiFetch('/x');
    await apiFetch('/x');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no deduplica mutaciones (POST/PATCH/PUT/DELETE)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(responderJson({ ok: true }));

    await Promise.all([
      api.post('/cosas', { nombre: 'A' }),
      api.post('/cosas', { nombre: 'B' }),
      api.patch('/cosas/1', { estado: 'done' }),
      api.delete('/cosas/2'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('no deduplica GETs con signal propia', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(responderJson({ ok: true }));
    const controller = new AbortController();

    await Promise.all([
      apiFetch('/x', { signal: controller.signal }),
      apiFetch('/x', { signal: controller.signal }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('api helpers', () => {
  it('get hace GET sin cuerpo', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ a: 1 }));
    const resultado = await api.get<{ a: number }>('/cosas');
    expect(resultado).toEqual({ a: 1 });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBeUndefined();
  });

  it('post serializa el cuerpo', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ id: 'nuevo' }));
    await api.post('/cosas', { nombre: 'X' });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ nombre: 'X' }));
  });

  it('patch serializa el cuerpo', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ ok: true }));
    await api.patch('/cosas/1', { estado: 'done' });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ estado: 'done' }));
  });

  it('delete no envía cuerpo', async () => {
    vi.mocked(fetch).mockImplementation(responderJson({ ok: true }));
    await api.delete('/cosas/1');
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});