import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolverCallbackOAuth } from './callback';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  unsubscribe: vi.fn(),
  onAuthStateChange: vi.fn(),
  sesionActual: vi.fn(),
  decidirOAuth: vi.fn(),
}));

vi.mock('../supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mocks.signOut,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}));

vi.mock('./sesion', () => ({
  sesionActual: mocks.sesionActual,
}));

vi.mock('./actions', () => ({
  decidirOAuth: mocks.decidirOAuth,
}));

const SESION = {
  userId: 'u-1',
  email: 'ana@empresa.com',
  accessToken: 'token-acceso',
  refreshToken: 'token-refresco',
};

function stubFetch(respuesta: { status?: number; body?: unknown }) {
  const status = respuesta.status ?? 200;
  const fetchMock = vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => respuesta.body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mocks.unsubscribe } },
  });
  mocks.decidirOAuth.mockResolvedValue({ redirect: '/calendario' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolverCallbackOAuth', () => {
  it('redirige a login con error auth cuando el proveedor devuelve error', async () => {
    const fetchMock = stubFetch({ body: {} });

    const resultado = await resolverCallbackOAuth({
      error: 'access_denied',
      esperaMs: 0,
    });

    expect(resultado).toEqual({ redirect: '/login?error=auth' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirige a login con error auth cuando no hay sesión', async () => {
    mocks.sesionActual.mockResolvedValue(null);
    const fetchMock = stubFetch({ body: {} });

    const resultado = await resolverCallbackOAuth({ esperaMs: 0 });

    expect(resultado).toEqual({ redirect: '/login?error=auth' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it('cierra sesión y redirige con error blocked si el perfil está bloqueado', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({ status: 403, body: { error: 'Tu cuenta está bloqueada' } });

    const resultado = await resolverCallbackOAuth({ esperaMs: 0 });

    expect(resultado).toEqual({ redirect: '/login?error=blocked' });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('cierra sesión y redirige con error auth si /auth/estado falla', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({ status: 500, body: { error: 'boom' } });

    const resultado = await resolverCallbackOAuth({ esperaMs: 0 });

    expect(resultado).toEqual({ redirect: '/login?error=auth' });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('redirige a onboarding cuando el perfil lo tiene pendiente', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({
      body: {
        perfil: { organization_id: 'org-1', onboarding_pending: true },
      },
    });

    const resultado = await resolverCallbackOAuth({
      next: '/proyectos',
      esperaMs: 0,
    });

    expect(resultado).toEqual({ redirect: '/onboarding' });
    expect(mocks.decidirOAuth).not.toHaveBeenCalled();
  });

  it('respeta el next saneado para usuarios con organización', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({
      body: {
        perfil: { organization_id: 'org-1', onboarding_pending: false },
      },
    });
    mocks.decidirOAuth.mockResolvedValue({ redirect: '/proyectos' });

    const resultado = await resolverCallbackOAuth({
      next: '/proyectos',
      esperaMs: 0,
    });

    expect(mocks.decidirOAuth).toHaveBeenCalledWith('/proyectos');
    expect(resultado).toEqual({ redirect: '/proyectos' });
  });

  it('usa la vista por defecto del perfil cuando no hay next', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({
      body: {
        perfil: {
          organization_id: 'org-1',
          onboarding_pending: false,
          preferences: { default_view: 'pipeline' },
        },
      },
    });
    mocks.decidirOAuth.mockResolvedValue({ redirect: '/pipeline' });

    const resultado = await resolverCallbackOAuth({ esperaMs: 0 });

    expect(mocks.decidirOAuth).toHaveBeenCalledWith('/pipeline');
    expect(resultado).toEqual({ redirect: '/pipeline' });
  });

  it('ignora un next externo y cae a la vista por defecto', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({
      body: {
        perfil: { organization_id: 'org-1', onboarding_pending: false },
      },
    });
    mocks.decidirOAuth.mockResolvedValue({ redirect: '/calendario' });

    const resultado = await resolverCallbackOAuth({
      next: '//evil.com/robo',
      esperaMs: 0,
    });

    expect(mocks.decidirOAuth).toHaveBeenCalledWith('/calendario');
    expect(resultado).toEqual({ redirect: '/calendario' });
  });

  it('cierra sesión y propaga google-no-account cuando no hay cuenta', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({
      body: {
        perfil: { organization_id: null, onboarding_pending: false },
      },
    });
    mocks.decidirOAuth.mockResolvedValue({ error: 'google-no-account' });

    const resultado = await resolverCallbackOAuth({ esperaMs: 0 });

    expect(resultado).toEqual({ redirect: '/login?error=google-no-account' });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('cierra sesión y propaga invite-invalid cuando la invitación expiró', async () => {
    mocks.sesionActual.mockResolvedValue(SESION);
    stubFetch({
      body: {
        perfil: { organization_id: null, onboarding_pending: false },
      },
    });
    mocks.decidirOAuth.mockResolvedValue({ error: 'invite-invalid' });

    const resultado = await resolverCallbackOAuth({
      next: '/invitacion/token-1',
      esperaMs: 0,
    });

    expect(mocks.decidirOAuth).toHaveBeenCalledWith('/invitacion/token-1');
    expect(resultado).toEqual({ redirect: '/login?error=invite-invalid' });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('espera la sesión emitida por onAuthStateChange cuando aún no está persistida', async () => {
    mocks.sesionActual.mockResolvedValueOnce(null).mockResolvedValue(null);
    mocks.onAuthStateChange.mockImplementation((callback) => {
      queueMicrotask(() =>
        callback('SIGNED_IN', {
          access_token: 'token-acceso',
          refresh_token: 'token-refresco',
          user: { id: 'u-1', email: 'ana@empresa.com' },
        })
      );
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });
    stubFetch({
      body: {
        perfil: { organization_id: 'org-1', onboarding_pending: false },
      },
    });
    mocks.decidirOAuth.mockResolvedValue({ redirect: '/calendario' });

    const resultado = await resolverCallbackOAuth({ esperaMs: 50 });

    expect(resultado).toEqual({ redirect: '/calendario' });
    expect(mocks.decidirOAuth).toHaveBeenCalledWith('/calendario');
  });
});
