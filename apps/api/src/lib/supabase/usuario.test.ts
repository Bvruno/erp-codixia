import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import {
  crearClienteUsuario,
  clienteUsuarioMiddleware,
  limpiarClientesUsuario,
} from '@/lib/supabase/usuario';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { createClient as supabaseCreate } from '@supabase/supabase-js';
const mockedCreate = vi.mocked(supabaseCreate);

function clienteFake() {
  return { auth: { setSession: vi.fn() } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  limpiarClientesUsuario();
  process.env.SUPABASE_URL = 'https://db.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
});

afterEach(() => {
  limpiarClientesUsuario();
  vi.useRealTimers();
});

describe('crearClienteUsuario', () => {
  it('crea client con anon key y setSession con access+refresh', async () => {
    const cliente = clienteFake();
    const setSession = (cliente as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    setSession.mockResolvedValue({ error: null });
    mockedCreate.mockReturnValue(cliente);

    const resultado = await crearClienteUsuario('tok-acceso', 'tok-refresh');

    expect(mockedCreate).toHaveBeenCalledWith(
      'https://db.supabase.co',
      'anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) })
    );
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'tok-acceso',
      refresh_token: 'tok-refresh',
    });
    expect(resultado).toBe(cliente);
  });

  it('reusa el cliente cacheado para el mismo access_token', async () => {
    const cliente = clienteFake();
    const setSession = (cliente as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    setSession.mockResolvedValue({ error: null });
    mockedCreate.mockReturnValue(cliente);

    const a = await crearClienteUsuario('tok', 'ref');
    const b = await crearClienteUsuario('tok', 'ref');

    expect(a).toBe(b);
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(setSession).toHaveBeenCalledTimes(1);
  });

  it('devuelve null si setSession falla', async () => {
    const cliente = clienteFake();
    const setSession = (cliente as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    setSession.mockResolvedValue({ error: { message: 'token inválido' } });
    mockedCreate.mockReturnValue(cliente);

    expect(await crearClienteUsuario('tok', 'ref')).toBeNull();
  });

  it('no sirve entradas vencidas (expira con el JWT)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const cliente = clienteFake();
    const cliente2 = clienteFake();
    const setSession = (cliente as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    const setSession2 = (cliente2 as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    setSession.mockResolvedValue({ error: null });
    setSession2.mockResolvedValue({ error: null });
    mockedCreate.mockReturnValueOnce(cliente).mockReturnValueOnce(cliente2);

    // exp 60 segundos después del momento actual
    const payload = Buffer.from(JSON.stringify({ exp: 60 })).toString('base64url');
    const token = `cabecera.${payload}.firma`;

    const a = await crearClienteUsuario(token, 'ref');
    expect(a).toBe(cliente);

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z')); // expirado
    const b = await crearClienteUsuario(token, 'ref');
    expect(b).toBe(cliente2);
    expect(mockedCreate).toHaveBeenCalledTimes(2);
  });

  it('token sin exp usa TTL corto', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const cliente = clienteFake();
    const cliente2 = clienteFake();
    const setSession = (cliente as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    const setSession2 = (cliente2 as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    setSession.mockResolvedValue({ error: null });
    setSession2.mockResolvedValue({ error: null });
    mockedCreate.mockReturnValueOnce(cliente).mockReturnValueOnce(cliente2);

    const token = 'cabecera.sin-payload-json.firma';
    const a = await crearClienteUsuario(token, 'ref');
    expect(a).toBe(cliente);

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'));
    const b = await crearClienteUsuario(token, 'ref');
    expect(b).toBe(cliente2);
  });
});

// JWT-like con `sub` decodificable (el middleware lo exige para exponer usuarioId).
function tokenConSub(sub = 'u1'): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `cabecera.${payload}.firma`;
}

describe('clienteUsuarioMiddleware', () => {
  it('inyecta el cliente en el contexto con headers válidos', async () => {
    const cliente = clienteFake();
    const setSession = (cliente as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    setSession.mockResolvedValue({ error: null });
    mockedCreate.mockReturnValue(cliente);

    const app = new Hono<{ Variables: { supabase: typeof cliente; usuarioId: string } }>();
    app.use('/*', clienteUsuarioMiddleware);
    app.get('/datos', (c) => c.json({ ok: Boolean(c.get('supabase')), usuarioId: c.get('usuarioId') }));

    const res = await app.request('/datos', {
      headers: {
        Authorization: `Bearer ${tokenConSub('u1')}`,
        'X-Refresh-Token': 'tok-refresh',
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, usuarioId: 'u1' });
  });

  it('401 sin Authorization o sin refresh token', async () => {
    const app = new Hono<{ Variables: { supabase: ReturnType<typeof clienteFake>; usuarioId: string } }>();
    app.use('/*', clienteUsuarioMiddleware);
    app.get('/datos', (c) => c.json({ ok: Boolean(c.get('supabase')) }));

    const sinAuth = await app.request('/datos', { headers: { 'X-Refresh-Token': 'r' } });
    expect(sinAuth.status).toBe(401);

    const sinRefresh = await app.request('/datos', {
      headers: { Authorization: 'Bearer t' },
    });
    expect(sinRefresh.status).toBe(401);
  });

  it('401 si el token no expone sub', async () => {
    const cliente = clienteFake();
    mockedCreate.mockReturnValue(cliente);

    const app = new Hono<{ Variables: { supabase: typeof cliente; usuarioId: string } }>();
    app.use('/*', clienteUsuarioMiddleware);
    app.get('/datos', (c) => c.json({ ok: true }));

    const res = await app.request('/datos', {
      headers: { Authorization: 'Bearer tok-sin-jwt', 'X-Refresh-Token': 'r' },
    });
    expect(res.status).toBe(401);
  });

  it('401 si setSession falla', async () => {
    const cliente = clienteFake();
    const setSession = (cliente as never as { auth: { setSession: ReturnType<typeof vi.fn> } }).auth
      .setSession;
    setSession.mockResolvedValue({ error: { message: 'no' } });
    mockedCreate.mockReturnValue(cliente);

    const app = new Hono<{ Variables: { supabase: typeof cliente; usuarioId: string } }>();
    app.use('/*', clienteUsuarioMiddleware);
    app.get('/datos', (c) => c.json({ ok: true }));

    const res = await app.request('/datos', {
      headers: { Authorization: `Bearer ${tokenConSub()}`, 'X-Refresh-Token': 'r' },
    });
    expect(res.status).toBe(401);
  });
});