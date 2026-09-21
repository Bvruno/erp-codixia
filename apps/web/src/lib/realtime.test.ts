// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invalidateMock = vi.fn();
const getSessionMock = vi.fn(async () => ({
  data: { session: { access_token: 'tok-1', refresh_token: 'ref-1' } },
}));

vi.mock('@/lib/query-client', () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => invalidateMock(...args) },
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

class WebSocketMock {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instancias: WebSocketMock[] = [];

  readyState = WebSocketMock.CONNECTING;
  enviados: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    WebSocketMock.instancias.push(this);
    setTimeout(() => {
      if (this.readyState !== WebSocketMock.CONNECTING) return;
      this.readyState = WebSocketMock.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(texto: string) {
    this.enviados.push(texto);
  }

  close() {
    if (this.readyState === WebSocketMock.CLOSED) return;
    this.readyState = WebSocketMock.CLOSED;
    this.onclose?.();
  }

  recibir(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
};

let realtime: typeof import('./realtime');

async function montar() {
  vi.resetModules();
  WebSocketMock.instancias = [];
  vi.stubGlobal('WebSocket', WebSocketMock);
  realtime = await import('./realtime');
}

function ultimoSocket(): WebSocketMock {
  return WebSocketMock.instancias[WebSocketMock.instancias.length - 1];
}

async function autenticar(ws: WebSocketMock) {
  await flush();
  ws.recibir({ type: 'auth_ok' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('canalRealtime (dispatch)', () => {
  it('entrega cada evento solo a los listeners de su tabla y filtro', async () => {
    await montar();
    const cbTasks = vi.fn();
    const cbNotes = vi.fn();
    realtime
      .canalRealtime('c1')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: 'list_id=eq.L1' },
        cbTasks
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, cbNotes)
      .subscribe();
    const ws = ultimoSocket();
    await autenticar(ws);

    ws.recibir({
      type: 'postgres_changes',
      channel: 'c1',
      cfg: { table: 'tasks', filter: 'list_id=eq.L1' },
      payload: { eventType: 'UPDATE', table: 'tasks', new: { id: 't1' }, old: {} },
    });
    ws.recibir({
      type: 'postgres_changes',
      channel: 'c1',
      cfg: { table: 'notes' },
      payload: { eventType: 'INSERT', table: 'notes', new: { id: 'n1' }, old: {} },
    });

    expect(cbTasks).toHaveBeenCalledTimes(1);
    expect(cbNotes).toHaveBeenCalledTimes(1);
    expect(cbNotes.mock.calls[0][0]).toMatchObject({ table: 'notes' });
  });

  it('un DELETE sin filtro no dispara al listener filtrado', async () => {
    await montar();
    const cbFiltrado = vi.fn();
    const cbDelete = vi.fn();
    realtime
      .canalRealtime('c2')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: 'list_id=eq.L1' },
        cbFiltrado
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, cbDelete)
      .subscribe();
    const ws = ultimoSocket();
    await autenticar(ws);

    ws.recibir({
      type: 'postgres_changes',
      channel: 'c2',
      cfg: { table: 'tasks' },
      payload: { eventType: 'DELETE', table: 'tasks', new: {}, old: { id: 't1' } },
    });

    expect(cbFiltrado).not.toHaveBeenCalled();
    expect(cbDelete).toHaveBeenCalledTimes(1);
  });

  it('revalida las queries al reconectar (catch-up)', async () => {
    await montar();
    realtime.canalRealtime('c3').on('postgres_changes', { table: 'tasks' }, vi.fn()).subscribe();
    const ws1 = ultimoSocket();
    await autenticar(ws1);
    expect(invalidateMock).not.toHaveBeenCalled();

    // Primera conexión: no hay catch-up.
    ws1.recibir({ type: 'postgres_changes', channel: 'c3', cfg: { table: 'tasks' }, payload: {} });

    // Se cae la conexión y se recupera al volver online.
    ws1.close();
    window.dispatchEvent(new Event('online'));
    const ws2 = ultimoSocket();
    expect(ws2).not.toBe(ws1);
    await autenticar(ws2);

    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it('reenvía la suscripción con sus listeners y cfg', async () => {
    await montar();
    realtime
      .canalRealtime('c4')
      .on('postgres_changes', { event: '*', table: 'tasks', filter: 'x=eq.1' }, vi.fn())
      .subscribe();
    const ws = ultimoSocket();
    await autenticar(ws);

    const subscribe = ws.enviados
      .map((t) => JSON.parse(t) as { type: string; listeners?: { cfg: unknown }[] })
      .find((m) => m.type === 'subscribe');
    expect(subscribe?.listeners?.[0]?.cfg).toMatchObject({ table: 'tasks', filter: 'x=eq.1' });
  });

  it('no encola unsubscribe: el canal re-suscrito antes del auth sobrevive', async () => {
    await montar();
    // Montaje/desmontaje/montaje típico (StrictMode) antes del auth_ok.
    const primero = realtime
      .canalRealtime('c5')
      .on('postgres_changes', { table: 'tasks' }, vi.fn());
    primero.subscribe();
    primero.unsubscribe();
    realtime.canalRealtime('c5').on('postgres_changes', { table: 'tasks' }, vi.fn()).subscribe();

    const ws = ultimoSocket();
    await autenticar(ws);

    const mensajesCanal = ws.enviados
      .map((t) => JSON.parse(t) as { type: string; channel?: string })
      .filter((m) => m.channel === 'c5');
    expect(mensajesCanal.map((m) => m.type)).toEqual(['subscribe']);
  });

  it('unsubscribe antes de autenticar no envía nada a la pasarela', async () => {
    await montar();
    const canal = realtime.canalRealtime('c6').on('postgres_changes', { table: 'tasks' }, vi.fn());
    canal.subscribe();
    canal.unsubscribe();
    const ws = ultimoSocket();
    await flush();

    const tipos = ws.enviados.map((t) => (JSON.parse(t) as { type: string }).type);
    expect(tipos).not.toContain('unsubscribe');
  });

  it('responde pong al heartbeat del servidor', async () => {
    await montar();
    realtime.canalRealtime('c7').on('postgres_changes', { table: 'tasks' }, vi.fn()).subscribe();
    const ws = ultimoSocket();
    await autenticar(ws);

    ws.recibir({ type: 'ping' });
    const tipos = ws.enviados.map((t) => (JSON.parse(t) as { type: string }).type);
    expect(tipos).toContain('pong');
  });

  it('revalida queries si el canal de Supabase falla', async () => {
    await montar();
    realtime.canalRealtime('c8').on('postgres_changes', { table: 'tasks' }, vi.fn()).subscribe();
    const ws = ultimoSocket();
    await autenticar(ws);
    invalidateMock.mockClear();

    ws.recibir({ type: 'canal_status', channel: 'c8', status: 'CHANNEL_ERROR' });
    expect(invalidateMock).toHaveBeenCalledTimes(1);

    invalidateMock.mockClear();
    ws.recibir({ type: 'canal_status', channel: 'c8', status: 'SUBSCRIBED' });
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
