import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }));

import { getAdminClient } from '@/lib/supabase/admin';
import {
  emitirEvento,
  emitirErrorPlataforma,
  enHorarioSilencio,
  horaEnZona,
  invalidarTelegramCache,
} from './telegram-plataforma';

const mockedAdmin = vi.mocked(getAdminClient);

type Resultado = { data?: unknown; error?: unknown; count?: number };
const colas = new Map<string, Resultado[]>();

function siguiente(tabla: string): Resultado {
  const cola = colas.get(tabla);
  return cola?.shift() ?? { data: null, error: null, count: 0 };
}

function crearConsulta(tabla: string) {
  const consulta: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in', 'gte', 'lt', 'is', 'limit', 'update', 'insert']) {
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

const CONFIG_BASE = {
  bot_token: 'token-123',
  chat_destino: '5344637405',
  enabled: true,
  nivel_minimo: 'error',
  agrupar_errores_segundos: 300,
  rate_limit_hora: 30,
  quiet_hours: { activo: false, desde: '22:00', hasta: '08:00' },
  markdown: true,
  webhook_secret: null,
  update_offset: 0,
  updated_at: null,
};

const EVENTO_SOLICITUD = {
  evento: 'solicitud_nueva',
  categoria: 'solicitudes',
  habilitado: true,
  plantilla: '📥 {{empresa}} — {{contacto}}',
  orden: 1,
};

function encolarConfig(config: Partial<typeof CONFIG_BASE> = {}, veces = 1) {
  colas.set(
    'platform_telegram_config',
    Array.from({ length: veces }, () => ({ data: { ...CONFIG_BASE, ...config }, error: null }))
  );
}

function encolarEventos(eventos: unknown[] = [EVENTO_SOLICITUD]) {
  colas.set('platform_telegram_eventos', [{ data: eventos, error: null }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  colas.clear();
  invalidarTelegramCache();
  mockedAdmin.mockReturnValue(adminStub());
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('emitirEvento', () => {
  it('si la config está deshabilitada solo crea la campana', async () => {
    encolarConfig({ enabled: false });
    encolarEventos();
    colas.set('platform_notifications', [{ data: null, error: null }]);

    await emitirEvento('solicitud_nueva', { empresa: 'Acme', contacto: 'Ana' });

    const inserciones = colas.get('platform_notifications') ?? [];
    expect(inserciones).toHaveLength(0); // la cola se consumió
    expect(fetch).not.toHaveBeenCalled();
  });

  it('envía a Telegram y registra el envío cuando está habilitado', async () => {
    encolarConfig();
    encolarEventos();
    colas.set('platform_notifications', [{ data: null, error: null }]);
    colas.set('platform_telegram_envios', [
      { data: null, error: null, count: 0 }, // rate limit
      { data: null, error: null }, // insert envío
    ]);

    await emitirEvento('solicitud_nueva', { empresa: 'Acme', contacto: 'Ana' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sendMessage');
    const cuerpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(cuerpo.chat_id).toBe('5344637405');
    expect(cuerpo.text).toContain('Acme');
    expect(cuerpo.text).not.toContain('{{');
  });

  it('respeta el nivel mínimo para warnings', async () => {
    encolarConfig({ nivel_minimo: 'error' });
    encolarEventos([
      {
        evento: 'error_nuevo',
        categoria: 'salud',
        habilitado: true,
        plantilla: '{{mensaje}}',
        orden: 16,
      },
    ]);
    colas.set('platform_notifications', [{ data: null, error: null }]);

    await emitirEvento('error_nuevo', { mensaje: 'leve' }, { nivel: 'warning', referencia: 'e1' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('deduplica por referencia dentro de la ventana', async () => {
    encolarConfig();
    encolarEventos([
      {
        evento: 'error_nuevo',
        categoria: 'salud',
        habilitado: true,
        plantilla: '{{mensaje}}',
        orden: 16,
      },
    ]);
    colas.set('platform_notifications', [{ data: null, error: null }]);
    colas.set('platform_telegram_envios', [{ data: { id: 1 }, error: null }]);

    await emitirEvento('error_nuevo', { mensaje: 'boom' }, { nivel: 'error', referencia: 'e1' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('respeta el horario de silencio en eventos no críticos', async () => {
    encolarConfig({
      quiet_hours: { activo: true, desde: '00:00', hasta: '23:59' },
    });
    encolarEventos();
    colas.set('platform_notifications', [{ data: null, error: null }]);

    await emitirEvento('solicitud_nueva', { empresa: 'Acme', contacto: 'Ana' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('corta por rate limit', async () => {
    encolarConfig({ rate_limit_hora: 5 });
    encolarEventos();
    colas.set('platform_notifications', [{ data: null, error: null }]);
    colas.set('platform_telegram_envios', [{ data: null, error: null, count: 5 }]);

    await emitirEvento('solicitud_nueva', { empresa: 'Acme', contacto: 'Ana' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('nunca lanza aunque falle la red', async () => {
    encolarConfig();
    encolarEventos();
    colas.set('platform_notifications', [{ data: null, error: null }]);
    colas.set('platform_telegram_envios', [
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      })
    );

    await expect(
      emitirEvento('solicitud_nueva', { empresa: 'Acme', contacto: 'Ana' })
    ).resolves.toBeUndefined();
  });

  it('ignora eventos desconocidos', async () => {
    await emitirEvento('evento_inexistente', {});
    expect(mockedAdmin).not.toHaveBeenCalled();
  });
});

describe('emitirErrorPlataforma', () => {
  it('resuelve el nombre de la organización y emite error_nuevo', async () => {
    encolarConfig();
    colas.set('platform_telegram_eventos', [
      {
        data: [
          {
            evento: 'error_nuevo',
            categoria: 'salud',
            habilitado: true,
            plantilla: '🚨 {{mensaje}} ({{empresa}})',
            orden: 16,
          },
        ],
        error: null,
      },
    ]);
    colas.set('organizations', [{ data: { name: 'Acme' }, error: null }]);
    colas.set('platform_notifications', [{ data: null, error: null }]);
    colas.set('platform_telegram_envios', [
      { data: null, error: null }, // dedupe: sin repetido
      { data: null, error: null, count: 0 }, // rate limit
      { data: null, error: null }, // insert
    ]);

    await emitirErrorPlataforma({
      id: 'err-1',
      source: 'server',
      message: 'boom',
      organizationId: 'org-1',
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sendMessage');
    expect(JSON.parse(String(init.body)).text).toContain('Acme');
  });
});

describe('utilidades de tiempo', () => {
  it('horaEnZona devuelve HH:MM', () => {
    expect(horaEnZona('UTC', new Date('2026-09-22T10:30:00Z'))).toBe('10:30');
  });

  it('enHorarioSilencio usa la hora de Perú (GMT-5)', () => {
    const quiet = { activo: true, desde: '22:00', hasta: '08:00' };
    // 23:30Z = 18:30 en Lima → fuera del silencio
    expect(enHorarioSilencio(quiet, new Date('2026-09-22T23:30:00Z'))).toBe(false);
    // 07:30Z = 02:30 en Lima → dentro
    expect(enHorarioSilencio(quiet, new Date('2026-09-22T07:30:00Z'))).toBe(true);
    // 12:00Z = 07:00 en Lima → dentro
    expect(enHorarioSilencio(quiet, new Date('2026-09-22T12:00:00Z'))).toBe(true);
    // 16:00Z = 11:00 en Lima → fuera
    expect(enHorarioSilencio(quiet, new Date('2026-09-22T16:00:00Z'))).toBe(false);
    expect(enHorarioSilencio({ ...quiet, activo: false })).toBe(false);
  });
});
