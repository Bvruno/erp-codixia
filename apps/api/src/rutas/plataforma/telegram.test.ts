import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearApp } from '../../app';

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }));
vi.mock('@/supabase/verificar-token', () => ({
  verificarJwt: vi.fn(),
  crearClienteJwt: vi.fn(),
}));
vi.mock('@/lib/captura-errores', () => ({ captureErrorServer: vi.fn() }));
vi.mock('@/lib/telegram-bot', () => ({
  consultarBot: vi.fn(async () => ({
    bot: {
      id: 1,
      username: 'erp_bot',
      nombre: 'ERP',
      puede_unirse_grupos: true,
      lee_todos_los_grupos: false,
      soporta_inline: false,
    },
    error: null,
  })),
  consultarWebhook: vi.fn(async () => ({
    estado: { activo: false, url: null, pendientes: 0, ultimo_error: null },
    error: null,
  })),
  activarWebhook: vi.fn(async () => ({ ok: true, error: null })),
  desactivarWebhook: vi.fn(async () => ({ ok: true, error: null })),
  sincronizarUpdates: vi.fn(async () => ({ procesados: 1, vinculado: false, offset: 5 })),
  procesarUpdates: vi.fn(async () => ({ procesados: 1, vinculado: false, offset: 5 })),
}));

import { getAdminClient } from '@/lib/supabase/admin';
import { verificarJwt } from '@/supabase/verificar-token';
import { invalidarTelegramCache } from '@/lib/telegram-plataforma';
import { invalidarPlataformaCache } from '@/middleware/requerir-plataforma';
import { consultarBot, procesarUpdates } from '@/lib/telegram-bot';

const mockedAdmin = vi.mocked(getAdminClient);
const mockedVerificarJwt = vi.mocked(verificarJwt);

const app = crearApp('http://localhost:5173', 'http://localhost:5174');

type Resultado = { data?: unknown; error?: unknown; count?: number };
const colas = new Map<string, Resultado[]>();

function siguiente(tabla: string): Resultado {
  const cola = colas.get(tabla);
  return cola?.shift() ?? { data: null, error: null, count: 0 };
}

function crearConsulta(tabla: string) {
  const consulta: Record<string, unknown> = {};
  for (const metodo of [
    'select',
    'eq',
    'in',
    'gte',
    'lt',
    'is',
    'limit',
    'order',
    'update',
    'insert',
  ]) {
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
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { id: 'user-1', email: 'jefe@empresa.com' } },
          error: null,
        })),
        listUsers: vi.fn(async () => ({
          data: { users: [{ id: 'user-1', email: 'jefe@empresa.com' }] },
          error: null,
        })),
      },
    },
  } as unknown as ReturnType<typeof getAdminClient>;
}

const CONFIG = {
  id: 1,
  bot_token: '8710651176:AAH2cOebZko9V13_dyvXXWBlMu2I69sCMm4',
  chat_destino: '5344637405',
  chat_etiqueta: 'Bruno',
  enabled: true,
  nivel_minimo: 'error',
  agrupar_errores_segundos: 300,
  rate_limit_hora: 30,
  quiet_hours: { activo: false, desde: '22:00', hasta: '08:00' },
  markdown: true,
  digest_activo: true,
  digest_hora: '09:00:00',
  webhook_secret: 'secreto-webhook',
  update_offset: 0,
  updated_at: '2026-09-22T10:00:00Z',
};

function encolarAcceso() {
  colas.set('platform_admins', [
    { data: { user_id: 'user-1' }, error: null },
    { data: { user_id: 'user-1' }, error: null },
    { data: { user_id: 'user-1' }, error: null },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  colas.clear();
  invalidarTelegramCache();
  invalidarPlataformaCache('user-1');
  mockedAdmin.mockReturnValue(adminStub());
  mockedVerificarJwt.mockResolvedValue({ id: 'user-1', email: 'jefe@empresa.com' });
});

describe('telegram de plataforma: guard', () => {
  it('exige plataforma', async () => {
    colas.set('platform_admins', [{ data: null, error: null }]);
    const res = await app.request('/plataforma/telegram/config', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(403);
  });
});

describe('telegram de plataforma: config', () => {
  it('devuelve la config enmascarada con estado del bot', async () => {
    encolarAcceso();
    colas.set('platform_telegram_config', [{ data: CONFIG, error: null }]);
    // El `maybeSingle` del último envío se evalúa antes que los counts
    // (llamada directa en el array de Promise.all): por eso va primero.
    colas.set('platform_telegram_envios', [
      { data: { created_at: '2026-09-22T10:00:00Z' }, error: null },
      { data: null, error: null, count: 3 },
      { data: null, error: null, count: 1 },
    ]);

    const res = await app.request('/plataforma/telegram/config', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { bot_token_mascara: string; chat_destino: string; token_origen: string };
      bot: { configurado: boolean; username: string | null };
      salud: { envios_24h: number };
    };
    expect(json.data.bot_token_mascara).toBe('••••••••CMm4');
    expect(json.data.chat_destino).toBe('5344637405');
    expect(json.data.token_origen).toBe('bd');
    expect(json.bot.username).toBe('erp_bot');
    expect(json.salud.envios_24h).toBe(3);
  });

  it('guarda cambios sin exigir el token', async () => {
    encolarAcceso();
    colas.set('platform_telegram_config', [
      { data: CONFIG, error: null }, // update
      { data: CONFIG, error: null }, // recarga para la respuesta
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    ]);
    colas.set('platform_audit_logs', [{ data: null, error: null }]);

    const res = await app.request('/plataforma/telegram/config', {
      method: 'PUT',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, digest_hora: '08:30' }),
    });
    expect(res.status).toBe(200);
  });

  it('valida el token con getMe', async () => {
    encolarAcceso();
    colas.set('platform_telegram_config', [{ data: CONFIG, error: null }]);
    const res = await app.request('/plataforma/telegram/config/probar', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      bot: { username: string };
      es_token_guardado: boolean;
    };
    expect(json.ok).toBe(true);
    expect(json.bot.username).toBe('erp_bot');
    expect(json.es_token_guardado).toBe(true);
  });

  it('devuelve el detalle exacto cuando el token escrito falla', async () => {
    encolarAcceso();
    colas.set('platform_telegram_config', [{ data: CONFIG, error: null }]);
    vi.mocked(consultarBot).mockResolvedValueOnce({
      bot: null,
      error: 'Unauthorized',
    });

    const res = await app.request('/plataforma/telegram/config/probar', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_token: '123:token-malo' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; error: string; es_token_guardado: boolean };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('Unauthorized');
    expect(json.es_token_guardado).toBe(false);
  });
});

describe('telegram de plataforma: eventos', () => {
  it('lista el catálogo completo y siembra los faltantes', async () => {
    encolarAcceso();
    colas.set('platform_telegram_eventos', [{ data: [], error: null }]);
    const res = await app.request('/plataforma/telegram/eventos', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { evento: string }[]; categorias: unknown[] };
    expect(json.data.length).toBeGreaterThan(15);
    expect(json.categorias.length).toBe(6);
  });

  it('404 en evento desconocido', async () => {
    encolarAcceso();
    colas.set('platform_telegram_config', [{ data: CONFIG, error: null }]);
    const res = await app.request('/plataforma/telegram/eventos/no_existe', {
      method: 'PUT',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ habilitado: true }),
    });
    expect(res.status).toBe(404);
  });

  it('actualiza un evento válido', async () => {
    encolarAcceso();
    colas.set('platform_telegram_eventos', [
      { data: null, error: null }, // existente
      { data: { evento: 'solicitud_nueva', habilitado: false }, error: null }, // upsert
    ]);
    colas.set('platform_audit_logs', [{ data: null, error: null }]);
    const res = await app.request('/plataforma/telegram/eventos/solicitud_nueva', {
      method: 'PUT',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ habilitado: false }),
    });
    expect(res.status).toBe(200);
  });

  it('valida el body', async () => {
    encolarAcceso();
    const res = await app.request('/plataforma/telegram/eventos/solicitud_nueva', {
      method: 'PUT',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ plantilla: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('telegram de plataforma: webhook público', () => {
  it('rechaza secret incorrecto', async () => {
    colas.set('platform_telegram_config', [{ data: CONFIG, error: null }]);
    const res = await app.request('/plataforma/telegram/webhook/otro-secreto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('procesa updates con el secret correcto', async () => {
    colas.set('platform_telegram_config', [{ data: CONFIG, error: null }]);
    const res = await app.request('/plataforma/telegram/webhook/secreto-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'secreto-webhook',
      },
      body: JSON.stringify({
        update_id: 7,
        message: { message_id: 1, chat: { id: 5344637405, type: 'private' }, text: '/estado' },
      }),
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(procesarUpdates)).toHaveBeenCalledTimes(1);
  });
});

describe('telegram de plataforma: campana', () => {
  it('lista notificaciones con no leídas', async () => {
    encolarAcceso();
    colas.set('platform_notifications', [
      {
        data: [
          {
            id: 2,
            evento: 'solicitud_nueva',
            titulo: 'Solicitud nueva',
            cuerpo: 'Acme',
            entidad_tipo: null,
            entidad_id: null,
            created_at: '2026-09-22T10:00:00Z',
          },
          {
            id: 1,
            evento: 'factura_pagada',
            titulo: 'Factura pagada',
            cuerpo: 'Acme',
            entidad_tipo: null,
            entidad_id: null,
            created_at: '2026-09-22T09:00:00Z',
          },
        ],
        error: null,
      },
    ]);
    colas.set('platform_notification_reads', [{ data: [{ notification_id: 1 }], error: null }]);

    const res = await app.request('/plataforma/telegram/notificaciones', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { id: number; leida: boolean }[];
      no_leidas: number;
    };
    expect(json.no_leidas).toBe(1);
    expect(json.data.find((n) => n.id === 1)?.leida).toBe(true);
  });

  it('marca notificaciones como leídas', async () => {
    encolarAcceso();
    colas.set('platform_notification_reads', [{ data: null, error: null }]);
    const res = await app.request('/plataforma/telegram/notificaciones/leer', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [1, 2] }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { marcadas: number };
    expect(json.marcadas).toBe(2);
  });
});
