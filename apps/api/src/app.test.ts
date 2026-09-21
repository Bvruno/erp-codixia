import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearApp } from './app';

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}));
vi.mock('@/supabase/verificar-token', () => ({
  verificarJwt: vi.fn(),
  crearClienteJwt: vi.fn(),
}));
vi.mock('@/lib/invites', () => ({
  hashInviteToken: (t: string) => `hash-${t}`,
}));
vi.mock('@/lib/captura-errores', () => ({
  captureErrorServer: vi.fn(),
}));

import { getAdminClient } from '@/lib/supabase/admin';
import { verificarJwt, crearClienteJwt } from '@/supabase/verificar-token';

const mockedAdmin = vi.mocked(getAdminClient);
const mockedVerificarJwt = vi.mocked(verificarJwt);
const mockedCrearClienteJwt = vi.mocked(crearClienteJwt);

const app = crearApp('http://localhost:5173');

function adminStub() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        insert: vi.fn(async () => ({ data: null, error: null })),
        update: vi.fn(async () => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
      })),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    })),
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: null } })) } },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://x/y' } })),
      })),
    },
  } as unknown as ReturnType<typeof getAdminClient>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAdmin.mockReturnValue(adminStub() as never);
  mockedVerificarJwt.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
  mockedCrearClienteJwt.mockReturnValue({
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: { session: null, user: null },
        error: null,
      })),
      signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  } as never);
});

describe('salud', () => {
  it('responde ok', async () => {
    const res = await app.request('/salud');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ estado: 'ok' });
  });
});

describe('caché HTTP', () => {
  it('incluye ETag y Cache-Control privado en GET', async () => {
    const res = await app.request('/salud');
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('responde 304 sin body cuando el ETag coincide', async () => {
    const res1 = await app.request('/salud');
    const etag = res1.headers.get('etag');
    expect(etag).toBeTruthy();
    const res2 = await app.request('/salud', {
      headers: { 'If-None-Match': etag! },
    });
    expect(res2.status).toBe(304);
    expect(await res2.text()).toBe('');
  });

  it('comprime la respuesta cuando el cliente acepta gzip', async () => {
    const res = await app.request('/salud', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(['gzip', 'br']).toContain(res.headers.get('content-encoding'));
  });

  it('CORS permite X-Refresh-Token y cachea el preflight', async () => {
    const res = await app.request('/salud', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,x-refresh-token',
      },
    });
    expect(res.status).toBe(204);
    const allow = res.headers.get('access-control-allow-headers') ?? '';
    expect(allow.toLowerCase()).toContain('x-refresh-token');
    expect(res.headers.get('access-control-max-age')).toBe('86400');
  });
});

describe('rutasAuth', () => {
  it('rechaza login sin credenciales', async () => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rechaza signup sin token de invitación', async () => {
    const res = await app.request('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@x.com', password: '123456', full_name: 'X', consent: 'on' }),
    });
    expect(res.status).toBe(400);
  });

  it('exige sesión en /auth/estado', async () => {
    const res = await app.request('/auth/estado');
    expect(res.status).toBe(401);
  });
});

describe('rutasOrganizacion', () => {
  it('exige sesión', async () => {
    const res = await app.request('/organizacion/perfil');
    expect(res.status).toBe(401);
  });
});

describe('rutasDebug', () => {
  it('exige sesión', async () => {
    const res = await app.request('/debug/base-datos');
    expect(res.status).toBe(401);
  });
});

describe('no encontrado', () => {
  it('404 en rutas inexistentes', async () => {
    const res = await app.request('/no-existe');
    expect(res.status).toBe(404);
  });
});