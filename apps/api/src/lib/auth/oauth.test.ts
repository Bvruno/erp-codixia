import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminGet = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminGet(),
}));

import { resolveOAuthNewUser, updateOAuthProfile } from '@/lib/auth/oauth';
import { hashInviteToken } from '@/lib/invites';

function adminWithInvite(status: string | null, expiresAt: string | null) {
  const eqMock = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({
      data: status === null ? null : { status, expires_at: expiresAt },
    })),
  }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const chain = {
    select: selectMock,
    eq: eqMock,
    update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  };
  return { from: vi.fn(() => chain), chain };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveOAuthNewUser', () => {
  it('permite continuar con invitación pendiente válida', async () => {
    adminGet.mockReturnValue(adminWithInvite('pending', '2099-01-01'));
    const res = await resolveOAuthNewUser('/invite/token-ok');
    expect(res).toEqual({ allow: true });
  });

  it('permite continuar con la ruta actual /invitacion/{token}', async () => {
    adminGet.mockReturnValue(adminWithInvite('pending', '2099-01-01'));
    const res = await resolveOAuthNewUser('/invitacion/token-ok');
    expect(res).toEqual({ allow: true });
  });

  it('busca la invitación por hash del token', async () => {
    const { from, chain } = adminWithInvite('pending', '2099-01-01');
    adminGet.mockReturnValue({ from });
    await resolveOAuthNewUser('/invitacion/token-ok');
    expect(from).toHaveBeenCalledWith('invitations');
    expect(chain.eq).toHaveBeenCalledWith('token', await hashInviteToken('token-ok'));
  });

  it('rechaza si el flujo no viene de una invitación', async () => {
    adminGet.mockReturnValue(adminWithInvite(null, null));
    const res = await resolveOAuthNewUser('/calendario');
    expect(res).toEqual({ allow: false, reason: 'no-account' });
  });

  it('rechaza invitación aceptada', async () => {
    adminGet.mockReturnValue(adminWithInvite('accepted', '2099-01-01'));
    const res = await resolveOAuthNewUser('/invite/token-ok');
    expect(res).toEqual({ allow: false, reason: 'invite-invalid' });
  });

  it('rechaza invitación expirada', async () => {
    adminGet.mockReturnValue(adminWithInvite('pending', '2000-01-01'));
    const res = await resolveOAuthNewUser('/invite/token-ok');
    expect(res).toEqual({ allow: false, reason: 'invite-invalid' });
  });

  it('rechaza token inexistente', async () => {
    adminGet.mockReturnValue(adminWithInvite(null, null));
    const res = await resolveOAuthNewUser('/invite/token-inexistente');
    expect(res).toEqual({ allow: false, reason: 'invite-invalid' });
  });
});

describe('updateOAuthProfile', () => {
  function adminWithProfile(profile: Record<string, unknown> | null) {
    const chain = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: profile })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    };
    return { from: vi.fn(() => chain), chain };
  }

  it('actualiza nombre y avatar si cambian', async () => {
    const { from, chain } = adminWithProfile({
      full_name: 'Viejo',
      avatar_url: null,
    });
    adminGet.mockReturnValue({ from });
    const res = await updateOAuthProfile('u1', 'Nuevo', 'https://a/p.png');
    expect(res).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(chain.update).toHaveBeenCalledWith({
      full_name: 'Nuevo',
      avatar_url: 'https://a/p.png',
    });
  });

  it('no actualiza si los datos son iguales', async () => {
    const { from, chain } = adminWithProfile({
      full_name: 'Igual',
      avatar_url: 'https://a/p.png',
    });
    adminGet.mockReturnValue({ from });
    const res = await updateOAuthProfile('u1', 'Igual', 'https://a/p.png');
    expect(res).toEqual({ success: true });
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('devuelve error si no existe el perfil', async () => {
    const { from } = adminWithProfile(null);
    adminGet.mockReturnValue({ from });
    const res = await updateOAuthProfile('u1', 'Nuevo');
    expect(res).toEqual({ error: 'Perfil no encontrado' });
  });
});
