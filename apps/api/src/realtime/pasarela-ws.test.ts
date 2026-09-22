import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

let handlerFactory: (() => {
  onOpen?: (evt: unknown, ws: unknown) => void;
  onMessage: (evt: { data: string }, ws: unknown) => Promise<void> | void;
  onClose?: () => void;
}) | null = null;

vi.mock('@hono/node-ws', () => ({
  createNodeWebSocket: () => ({
    injectWebSocket: vi.fn(),
    upgradeWebSocket: (fn: () => unknown) => {
      handlerFactory = fn as never;
      return fn;
    },
  }),
}));

const setAuthMock = vi.fn();
const setSessionMock = vi.fn(async () => ({ data: { session: {} }, error: null }));
const getSessionMock = vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } }));
const canalFake = {
  on: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  send: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { setSession: setSessionMock, getSession: getSessionMock },
    realtime: { setAuth: setAuthMock },
    channel: () => canalFake,
  }),
}));

vi.mock('../supabase/verificar-token', () => ({
  verificarJwt: vi.fn(async () => ({ id: 'u1', email: 'a@b.c' })),
}));

const mocks = vi.hoisted(() => {
  const estado = {
    perfil: { blocked: false, organizations: { status: 'activa' } } as Record<string, unknown> | null,
    maybeSingle: vi.fn(),
  };
  estado.maybeSingle = vi.fn(async () => ({ data: estado.perfil, error: null }));
  return estado;
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
  }),
}));

import { crearPasarelaRealtime } from './pasarela-ws';

function wsFake() {
  return { send: vi.fn(), close: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  canalFake.on.mockClear();
  canalFake.subscribe.mockClear();
  canalFake.unsubscribe.mockClear();
  handlerFactory = null;
  mocks.perfil = { blocked: false, organizations: { status: 'activa' } };
  mocks.maybeSingle.mockImplementation(async () => ({ data: mocks.perfil, error: null }));
});

describe('pasarela realtime', () => {
  async function autenticar() {
    crearPasarelaRealtime(new Hono());
    const handlers = handlerFactory!();
    const ws = wsFake();
    await handlers.onMessage(
      { data: JSON.stringify({ type: 'auth', token: 'tok', refresh_token: 'ref' }) },
      ws
    );
    return { handlers, ws };
  }

  it('autentica con setSession + setAuth y responde auth_ok', async () => {
    const { ws } = await autenticar();
    expect(setSessionMock).toHaveBeenCalledWith({ access_token: 'tok', refresh_token: 'ref' });
    expect(setAuthMock).toHaveBeenCalledWith('tok');
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth_ok' }));
  });

  it('reenvía los eventos con cfg y desuscribe el canal previo al re-suscribir', async () => {
    const { handlers, ws } = await autenticar();
    const cfg = { event: '*', schema: 'public', table: 'tasks', filter: 'list_id=eq.L1' };
    await handlers.onMessage(
      {
        data: JSON.stringify({
          type: 'subscribe',
          channel: 'c1',
          listeners: [{ evt: 'postgres_changes', cfg }],
        }),
      },
      ws
    );

    const callback = canalFake.on.mock.calls[0][2] as (payload: unknown) => void;
    callback({ eventType: 'UPDATE', table: 'tasks', new: { id: 't1' }, old: {} });

    const reenviado = ws.send.mock.calls
      .map((c) => JSON.parse(c[0] as string) as Record<string, unknown>)
      .find((m) => m.type === 'postgres_changes');
    expect(reenviado).toMatchObject({ channel: 'c1', cfg });

    // Re-suscripción: cancela el canal anterior antes de crear el nuevo.
    await handlers.onMessage(
      {
        data: JSON.stringify({
          type: 'subscribe',
          channel: 'c1',
          listeners: [{ evt: 'postgres_changes', cfg }],
        }),
      },
      ws
    );
    expect(canalFake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('responde auth_error si la sesión no quedó lista', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } } as never);
    const { ws } = await autenticar();
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth_error' }));
  });

  it('cierra el socket si la empresa está suspendida', async () => {
    mocks.perfil = { blocked: false, organizations: { status: 'suspendida' } };
    const { ws } = await autenticar();
    expect(ws.close).toHaveBeenCalledWith(1008, 'Cuenta sin acceso');
    expect(ws.send).not.toHaveBeenCalledWith(JSON.stringify({ type: 'auth_ok' }));
  });

  it('cierra el socket si la cuenta está bloqueada', async () => {
    mocks.perfil = { blocked: true, organizations: null };
    const { ws } = await autenticar();
    expect(ws.close).toHaveBeenCalledWith(1008, 'Cuenta sin acceso');
  });

  it('envía heartbeats periódicos y los detiene al cerrar', async () => {
    vi.useFakeTimers();
    try {
      crearPasarelaRealtime(new Hono());
      const handlers = handlerFactory!();
      const ws = wsFake();
      handlers.onOpen?.({}, ws);

      vi.advanceTimersByTime(25_000);
      const pings = ws.send.mock.calls.filter(
        (c) => c[0] === JSON.stringify({ type: 'ping' })
      );
      expect(pings).toHaveLength(1);

      handlers.onClose?.();
      vi.advanceTimersByTime(50_000);
      const trasCerrar = ws.send.mock.calls.filter(
        (c) => c[0] === JSON.stringify({ type: 'ping' })
      );
      expect(trasCerrar).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reenvía el estado de error del canal de Supabase', async () => {
    const { handlers, ws } = await autenticar();
    await handlers.onMessage(
      {
        data: JSON.stringify({
          type: 'subscribe',
          channel: 'c1',
          listeners: [{ evt: 'postgres_changes', cfg: { table: 'tasks' } }],
        }),
      },
      ws
    );

    const onStatus = canalFake.subscribe.mock.calls[0][0] as (status: string) => void;
    onStatus('CHANNEL_ERROR');

    const mensaje = ws.send.mock.calls
      .map((c) => JSON.parse(c[0] as string) as Record<string, unknown>)
      .find((m) => m.type === 'canal_status');
    expect(mensaje).toMatchObject({ channel: 'c1', status: 'CHANNEL_ERROR' });
  });
});

afterEach(() => {
  vi.useRealTimers();
});
