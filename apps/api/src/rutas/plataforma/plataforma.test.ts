import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearApp } from '../../app';

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }));
vi.mock('@/supabase/verificar-token', () => ({
  verificarJwt: vi.fn(),
  crearClienteJwt: vi.fn(),
}));
vi.mock('@/lib/captura-errores', () => ({ captureErrorServer: vi.fn() }));

import { getAdminClient } from '@/lib/supabase/admin';
import { verificarJwt } from '@/supabase/verificar-token';
import { invalidarPlataformaCache } from '@/middleware/requerir-plataforma';

const mockedAdmin = vi.mocked(getAdminClient);
const mockedVerificarJwt = vi.mocked(verificarJwt);

const app = crearApp('http://localhost:5173', 'http://localhost:5174');

type Resultado = { data?: unknown; error?: unknown; count?: number };

// Cola de respuestas por tabla: cada consulta await consume la siguiente.
const colas = new Map<string, Resultado[]>();
const llamadas: { tabla: string; metodo: string; args: unknown[] }[] = [];

function siguiente(tabla: string): Resultado {
  const cola = colas.get(tabla);
  return cola?.shift() ?? { data: null, error: null, count: 0 };
}

function crearConsulta(tabla: string) {
  const registrado = (metodo: string) => (...args: unknown[]) => {
    llamadas.push({ tabla, metodo, args });
    return consulta;
  };
  const consulta: Record<string, unknown> = {};
  for (const metodo of [
    'select',
    'eq',
    'in',
    'or',
    'ilike',
    'order',
    'range',
    'gte',
    'is',
    'limit',
    'update',
    'delete',
  ]) {
    consulta[metodo] = registrado(metodo);
  }
  consulta.insert = registrado('insert');
  consulta.upsert = registrado('upsert');
  consulta.maybeSingle = vi.fn(async () => siguiente(tabla));
  consulta.single = vi.fn(async () => siguiente(tabla));
  consulta.then = (resolver: (valor: Resultado) => unknown, rechazar?: (e: unknown) => unknown) =>
    Promise.resolve(siguiente(tabla)).then(resolver, rechazar);
  return consulta;
}

function adminStub() {
  return {
    from: vi.fn((tabla: string) => crearConsulta(tabla)),
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: {
            users: [{ id: 'user-1', email: 'jefe@empresa.com', user_metadata: { full_name: 'Jefe' } }],
          },
          error: null,
        })),
        getUserById: vi.fn(async () => ({
          data: { user: { id: 'user-1', email: 'jefe@empresa.com' } },
          error: null,
        })),
      },
    },
  } as unknown as ReturnType<typeof getAdminClient>;
}

const SOLICITUD = {
  id: 'sol-1',
  empresa: 'Empresa Nueva',
  email: 'owner@empresa.com',
  estado: 'pendiente',
  notas_admin: null,
};

function encolarPlatformAdmin(esAdmin = true) {
  colas.set('platform_admins', [
    { data: esAdmin ? { user_id: 'user-1' } : null, error: null },
    { data: esAdmin ? { user_id: 'user-1' } : null, error: null },
    { data: esAdmin ? { user_id: 'user-1' } : null, error: null },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  colas.clear();
  llamadas.length = 0;
  invalidarPlataformaCache('user-1');
  mockedAdmin.mockReturnValue(adminStub());
  mockedVerificarJwt.mockResolvedValue({ id: 'user-1', email: 'jefe@empresa.com' });
});

describe('plataforma: endpoint público de solicitudes', () => {
  it('registra una solicitud válida sin autenticación', async () => {
    colas.set('owner_applications', [{ data: null, error: null }]);
    const res = await app.request('/plataforma/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
      body: JSON.stringify({
        nombre_contacto: 'Ana',
        email: 'Ana@Empresa.com',
        empresa: 'Empresa SA',
        consentimiento: true,
      }),
    });
    expect(res.status).toBe(201);

    const insercion = llamadas.find(
      (l) => l.tabla === 'owner_applications' && l.metodo === 'insert'
    );
    expect(insercion).toBeTruthy();
    const fila = insercion!.args[0] as Record<string, unknown>;
    expect(fila.email).toBe('ana@empresa.com');
    expect(fila.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rechaza datos inválidos', async () => {
    const res = await app.request('/plataforma/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.2' },
      body: JSON.stringify({ email: 'no-email' }),
    });
    expect(res.status).toBe(400);
  });

  it('responde ok falso ante honeypot sin tocar la base', async () => {
    const res = await app.request('/plataforma/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.3' },
      body: JSON.stringify({
        nombre_contacto: 'Bot',
        email: 'bot@spam.com',
        empresa: 'Spam',
        consentimiento: true,
        website: 'http://spam.com',
      }),
    });
    expect(res.status).toBe(200);
    expect(llamadas.some((l) => l.tabla === 'owner_applications')).toBe(false);
  });

  it('limita por IP', async () => {
    colas.set('owner_applications', Array.from({ length: 8 }, () => ({ data: null, error: null })));
    const payload = JSON.stringify({
      nombre_contacto: 'Ana',
      email: 'ana@empresa.com',
      empresa: 'Empresa SA',
      consentimiento: true,
    });
    let ultimo = 0;
    for (let i = 0; i < 6; i++) {
      const res = await app.request('/plataforma/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.9.9.9' },
        body: payload,
      });
      ultimo = res.status;
    }
    expect(ultimo).toBe(429);
  });
});

describe('plataforma: guard de superadmin', () => {
  it('exige autenticación', async () => {
    mockedVerificarJwt.mockResolvedValue(null);
    const res = await app.request('/plataforma/solicitudes');
    expect(res.status).toBe(401);
  });

  it('rechaza usuarios sin fila en platform_admins', async () => {
    encolarPlatformAdmin(false);
    mockedAdmin.mockReturnValue(adminStub());
    const res = await app.request('/plataforma/solicitudes', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(403);
  });

  it('lista solicitudes para un platform admin', async () => {
    encolarPlatformAdmin();
    colas.set('owner_applications', [{ data: [SOLICITUD], error: null, count: 1 }]);
    const res = await app.request('/plataforma/solicitudes?estado=pendiente', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total: number; data: { id: string }[] };
    expect(json.total).toBe(1);
    expect(json.data[0].id).toBe('sol-1');
  });
});

describe('plataforma: aprobación de solicitudes', () => {
  it('crea empresa + invitación y actualiza la solicitud', async () => {
    encolarPlatformAdmin();
    colas.set('owner_applications', [
      { data: SOLICITUD, error: null },
      { data: { id: 'sol-1' }, error: null },
    ]);
    colas.set('organizations', [{ data: { id: 'org-1' }, error: null }]);
    colas.set('org_settings', [{ data: null, error: null }]);
    colas.set('invitations', [{ data: { id: 'inv-1' }, error: null }]);
    colas.set('platform_audit_logs', [{ data: null, error: null }]);

    const res = await app.request('/plataforma/solicitudes/sol-1/aprobar', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: 'pro' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { organization_id: string; link: string };
    expect(json.organization_id).toBe('org-1');
    expect(json.link).toContain('/invitacion/');

    const actualizacion = llamadas.find(
      (l) => l.tabla === 'owner_applications' && l.metodo === 'update'
    );
    expect(actualizacion).toBeTruthy();
    const cambios = actualizacion!.args[0] as Record<string, unknown>;
    expect(cambios.estado).toBe('invitada');
    expect(cambios.organization_id).toBe('org-1');
  });

  it('no re-invita una solicitud ya invitada', async () => {
    encolarPlatformAdmin();
    colas.set('owner_applications', [
      { data: { ...SOLICITUD, estado: 'invitada' }, error: null },
    ]);
    const res = await app.request('/plataforma/solicitudes/sol-1/aprobar', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });
});

describe('plataforma: empresas', () => {
  it('suspende una empresa y limpia cachés de miembros', async () => {
    encolarPlatformAdmin();
    colas.set('organizations', [{ data: { id: 'org-1', name: 'Empresa SA' }, error: null }]);
    colas.set('profiles', [{ data: [{ id: 'user-2' }], error: null }]);
    colas.set('platform_audit_logs', [{ data: null, error: null }]);

    const res = await app.request('/plataforma/empresas/org-1/suspender', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Impago' }),
    });
    expect(res.status).toBe(200);
    const actualizacion = llamadas.find(
      (l) => l.tabla === 'organizations' && l.metodo === 'update'
    );
    const cambios = actualizacion!.args[0] as Record<string, unknown>;
    expect(cambios.status).toBe('suspendida');
    expect(cambios.suspended_reason).toBe('Impago');
  });

  it('exige que la confirmación de borrado coincida con el nombre', async () => {
    encolarPlatformAdmin();
    colas.set('organizations', [{ data: { id: 'org-1', name: 'Empresa SA' }, error: null }]);
    const res = await app.request('/plataforma/empresas/org-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmacion: 'Otro Nombre' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('plataforma: administradores', () => {
  it('no permite auto-quitarse', async () => {
    encolarPlatformAdmin();
    const res = await app.request('/plataforma/admins/user-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(400);
  });

  it('agrega un admin por email si la cuenta existe', async () => {
    encolarPlatformAdmin();
    colas.set('platform_admins', [
      { data: { user_id: 'user-1' }, error: null }, // guard
      { data: null, error: null }, // existente
      { data: null, error: null }, // insert
    ]);
    colas.set('platform_audit_logs', [{ data: null, error: null }]);

    const res = await app.request('/plataforma/admins', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'jefe@empresa.com' }),
    });
    expect(res.status).toBe(201);
  });
});

describe('plataforma: CORS', () => {
  it('permite el origen del panel de plataforma', async () => {
    const res = await app.request('/salud', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5174',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');
  });
});
