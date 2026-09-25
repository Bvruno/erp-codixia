import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }));

import { getAdminClient } from '@/lib/supabase/admin';
import { invalidarTelegramCache } from './telegram-plataforma';
import { consultarBot, consultarWebhook, procesarUpdates } from './telegram-bot';

const mockedAdmin = vi.mocked(getAdminClient);

type Resultado = { data?: unknown; error?: unknown; count?: number };
const colas = new Map<string, Resultado[]>();

function siguiente(tabla: string): Resultado {
  return colas.get(tabla)?.shift() ?? { data: null, error: null, count: 0 };
}

function crearConsulta(tabla: string) {
  const consulta: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in', 'gte', 'is', 'limit', 'order', 'update', 'insert']) {
    consulta[metodo] = () => consulta;
  }
  consulta.upsert = () => consulta;
  consulta.maybeSingle = vi.fn(async () => siguiente(tabla));
  consulta.single = vi.fn(async () => siguiente(tabla));
  consulta.then = (resolver: (v: Resultado) => unknown, rechazar?: (e: unknown) => unknown) =>
    Promise.resolve(siguiente(tabla)).then(resolver, rechazar);
  return consulta;
}

function adminStub() {
  return {
    from: vi.fn((tabla: string) => crearConsulta(tabla)),
  } as unknown as ReturnType<typeof getAdminClient>;
}

const CONFIG = {
  id: 1,
  bot_token: 'token-123',
  chat_destino: null as string | null,
  enabled: true,
  nivel_minimo: 'error',
  agrupar_errores_segundos: 300,
  rate_limit_hora: 30,
  quiet_hours: { activo: false, desde: '22:00', hasta: '08:00', timezone: 'UTC' },
  markdown: true,
  webhook_secret: null,
  update_offset: 0,
};

let enviados: { chat_id: string; text: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  colas.clear();
  invalidarTelegramCache();
  enviados = [];
  mockedAdmin.mockReturnValue(adminStub());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)) as { chat_id: string; text: string });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const UPDATE_START = {
  update_id: 10,
  message: {
    message_id: 1,
    chat: { id: 5344637405, type: 'private', first_name: 'Bruno' },
    text: '/start',
  },
};

describe('diagnóstico del bot', () => {
  it('consultarBot devuelve capacidades con getMe ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            result: {
              id: 42,
              username: 'erp_bot',
              first_name: 'ERP',
              can_join_groups: true,
              can_read_all_group_messages: false,
              supports_inline_queries: false,
            },
          }),
          { status: 200 }
        )
      )
    );

    const res = await consultarBot('token');
    expect(res.error).toBeNull();
    expect(res.bot).toMatchObject({
      id: 42,
      username: 'erp_bot',
      puede_unirse_grupos: true,
      lee_todos_los_grupos: false,
    });
  });

  it('consultarBot propaga la descripción exacta del error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), { status: 401 })
      )
    );

    const res = await consultarBot('token-malo');
    expect(res.bot).toBeNull();
    expect(res.error).toBe('Unauthorized');
  });

  it('consultarWebhook reporta el error de consulta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      })
    );

    const res = await consultarWebhook('token');
    expect(res.estado).toBeNull();
    expect(res.error).toBe('sin red');
  });
});

describe('procesarUpdates', () => {
  it('vincula el destino con /start cuando no hay chat configurado', async () => {
    colas.set('platform_telegram_config', [
      { data: CONFIG, error: null }, // cargarConfig
      { data: null, error: null }, // update chat_destino
      { data: null, error: null }, // update offset
    ]);

    const resultado = await procesarUpdates('token-123', [UPDATE_START]);

    expect(resultado.vinculado).toBe(true);
    expect(resultado.offset).toBe(11);
    expect(enviados[0].chat_id).toBe('5344637405');
    expect(enviados[0].text).toContain('Chat vinculado');
  });

  it('responde el chat_id sin vincular si ya hay destino distinto', async () => {
    colas.set('platform_telegram_config', [
      { data: { ...CONFIG, chat_destino: '999' }, error: null },
      { data: null, error: null }, // update offset
    ]);

    const resultado = await procesarUpdates('token-123', [UPDATE_START]);

    expect(resultado.vinculado).toBe(false);
    expect(enviados[0].text).toContain('5344637405');
    expect(enviados[0].text).toContain('999');
  });

  it('/estado responde el resumen', async () => {
    colas.set('platform_telegram_config', [
      { data: { ...CONFIG, chat_destino: '5344637405' }, error: null },
      { data: null, error: null }, // update offset
    ]);
    colas.set('owner_applications', [{ data: null, error: null, count: 2 }]);
    colas.set('organizations', [
      { data: null, error: null, count: 4 },
      { data: null, error: null, count: 1 },
    ]);
    colas.set('error_logs', [{ data: null, error: null, count: 3 }]);
    colas.set('billing_records', [{ data: null, error: null, count: 5 }]);

    await procesarUpdates('token-123', [
      { ...UPDATE_START, message: { ...UPDATE_START.message, text: '/estado' } },
    ]);

    const texto = enviados[0].text;
    expect(texto).toContain('Solicitudes pendientes: 2');
    expect(texto).toContain('Empresas activas: 4 · suspendidas: 1');
    expect(texto).toContain('Errores abiertos: 3');
  });

  it('ignora updates sin texto y no toca el offset si no hay cambios', async () => {
    colas.set('platform_telegram_config', [
      { data: { ...CONFIG, chat_destino: '5344637405', update_offset: 50 }, error: null },
    ]);

    const resultado = await procesarUpdates('token-123', [
      { update_id: 49, message: { message_id: 2, chat: { id: 1, type: 'private' } } },
    ]);

    expect(resultado.procesados).toBe(0);
    expect(resultado.offset).toBe(50);
    expect(enviados).toHaveLength(0);
  });
});
