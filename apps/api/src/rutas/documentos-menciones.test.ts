import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app';

const estado = vi.hoisted(() => ({
  pagina: null as { id: string; title: string } | null,
  documento: null as { name: string; organization_id: string } | null,
  perfiles: [] as { id: string; telegram_chat_id: string | null }[],
  insertadas: [] as { profile_id: string }[],
  telegram: null as { bot_token: string; enabled: boolean } | null,
  autor: null as { full_name: string } | null,
  upsertArgs: null as unknown,
}));

vi.mock('../lib/captura-errores', () => ({
  captureErrorServer: vi.fn(async () => undefined),
}));

vi.mock('../lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: (tabla: string) => {
      if (tabla === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: async () => ({ data: estado.perfiles, error: null }),
              }),
              maybeSingle: async () => ({ data: estado.autor, error: null }),
            }),
          }),
        };
      }
      if (tabla === 'document_mentions') {
        return {
          upsert: (filas: unknown, opciones: unknown) => {
            estado.upsertArgs = { filas, opciones };
            return {
              select: async () => ({ data: estado.insertadas, error: null }),
            };
          },
        };
      }
      if (tabla === 'telegram_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: estado.telegram, error: null }),
            }),
          }),
        };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    },
  })),
}));

vi.mock('../lib/supabase/usuario', () => ({
  clienteUsuarioMiddleware: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>
  ) => {
    c.set('usuarioId', '33333333-3333-4333-8333-333333333333');
    c.set('supabase', {
      from: (tabla: string) => {
        if (tabla === 'document_pages') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: estado.pagina, error: null }),
                }),
              }),
            }),
          };
        }
        if (tabla === 'documents') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: estado.documento, error: null }),
              }),
            }),
          };
        }
        throw new Error(`tabla inesperada: ${tabla}`);
      },
    });
    await next();
  },
}));

const app = crearApp('http://localhost:5173');

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function mencionar(usuarioIds: string[]) {
  return app.request('/documentos/doc-1/menciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pagina_id: '11111111-1111-4111-8111-111111111111', usuario_ids: usuarioIds }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  estado.pagina = { id: '11111111-1111-4111-8111-111111111111', title: 'Página 1' };
  estado.documento = { name: 'Documento demo', organization_id: 'org-1' };
  estado.perfiles = [{ id: 'user-2', telegram_chat_id: 'chat-2' }];
  estado.insertadas = [{ profile_id: 'user-2' }];
  estado.telegram = { bot_token: 'token', enabled: true };
  estado.autor = { full_name: 'Ana' };
  estado.upsertArgs = null;
});

describe('POST /documentos/:id/menciones', () => {
  it('404 si la página no existe o no pertenece al documento', async () => {
    estado.pagina = null;
    const res = await mencionar(['22222222-2222-4222-8222-222222222222']);
    expect(res.status).toBe(404);
  });

  it('no notifica cuando solo hay auto-mención', async () => {
    const res = await mencionar(['33333333-3333-4333-8333-333333333333']);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificados: 0 });
    expect(estado.upsertArgs).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registra la mención y notifica por Telegram solo a los nuevos', async () => {
    const res = await mencionar(['22222222-2222-4222-8222-222222222222']);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificados: 1 });

    const upsert = estado.upsertArgs as {
      filas: { page_id: string; profile_id: string; mentioned_by: string }[];
      opciones: { onConflict: string; ignoreDuplicates: boolean };
    };
    expect(upsert.filas).toEqual([
      { document_id: 'doc-1', page_id: '11111111-1111-4111-8111-111111111111', profile_id: 'user-2', mentioned_by: '33333333-3333-4333-8333-333333333333' },
    ]);
    expect(upsert.opciones).toMatchObject({ onConflict: 'page_id,profile_id', ignoreDuplicates: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain('/bottoken/sendMessage');
    expect(JSON.parse(init.body)).toMatchObject({
      chat_id: 'chat-2',
      text: 'Ana te mencionó en el documento «Documento demo» › Página 1',
    });
  });

  it('no notifica si Telegram está deshabilitado', async () => {
    estado.telegram = { bot_token: 'token', enabled: false };
    const res = await mencionar(['22222222-2222-4222-8222-222222222222']);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificados: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no re-notifica una mención ya registrada (dedupe)', async () => {
    estado.insertadas = [];
    const res = await mencionar(['22222222-2222-4222-8222-222222222222']);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificados: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza payloads inválidos', async () => {
    const res = await app.request('/documentos/doc-1/menciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagina_id: 'no-uuid', usuario_ids: [] }),
    });
    expect(res.status).toBe(400);
  });
});

