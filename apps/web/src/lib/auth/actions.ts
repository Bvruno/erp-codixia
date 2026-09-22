import { createClient } from '../supabase/client';
import { API_URL } from '../api/base';
import { rutaVistaPorDefecto } from '../vista-inicial';

function tokenActual(): string | null {
  return createClient().auth.getSession().then(({ data }) => data.session?.access_token ?? null) as unknown as string | null;
}

async function jwtHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}

// ---- Sesión (browser supabase + validación server) ----

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const inviteToken = (formData.get('invite') as string) || '';

  if (!email || !password) return { error: 'Email y contraseña requeridos' };

  const { data, error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!data.session || !data.user) return { error: 'No se pudo iniciar sesión' };

  const res = await fetch(`${API_URL}/auth/estado`, { headers: await jwtHeaders() });
  if (res.status === 403) {
    const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
    await createClient().auth.signOut();
    return {
      error: cuerpo.error ?? 'Tu cuenta está bloqueada. Contacta al administrador.',
    };
  }
  if (!res.ok) {
    await createClient().auth.signOut();
    return { error: 'no-access' };
  }
  const estado = await res.json();
  if (!estado.perfil?.organization_id) {
    if (inviteToken) {
      const invRes = await fetch(`${API_URL}/invitaciones/${encodeURIComponent(inviteToken)}`);
      if (invRes.ok) {
        return { success: true, redirect: `/invitacion/${inviteToken}` };
      }
    }
    await createClient().auth.signOut();
    return { error: 'no-access' };
  }

  return {
    success: true,
    redirect: rutaVistaPorDefecto(estado.perfil?.preferences?.default_view),
  };
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('full_name') as string;
  const consent = formData.get('consent') as string;
  const inviteToken = (formData.get('invite') as string) || '';

  if (!email || !password || !fullName) return { error: 'Todos los campos son requeridos' };
  if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' };
  if (consent !== 'on') return { error: 'Debes aceptar los términos y la política de privacidad' };
  if (!inviteToken) return { error: 'El registro solo está disponible mediante un link de invitación' };

  const invRes = await fetch(`${API_URL}/invitaciones/${encodeURIComponent(inviteToken)}`);
  if (!invRes.ok) {
    return { error: 'Link de invitación inválido o expirado' };
  }

  const { data, error } = await createClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: 'No se pudo crear el usuario' };
  if (!data.session) {
    return { info: 'Revisa tu email para confirmar la cuenta antes de continuar.' };
  }
  return { success: true, redirect: `/invitacion/${inviteToken}` };
}

export async function sendPasswordResetEmail(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email requerido' };
  const { error } = await createClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/restablecer-password`,
  });
  if (error) return { error: error.message };
  return { info: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' };
}

export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string;
  if (!password || password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres' };
  }
  const { error } = await createClient().auth.updateUser({ password });
  if (error) return { error: error.message };
  return { success: true, redirect: '/login?reset=ok' };
}

export async function logout() {
  await createClient().auth.signOut();
  return { success: true, redirect: '/login' };
}

// OAuth Google: supabase-js (PKCE) canjea el code al volver a /auth/callback;
// la validación de acceso vive en lib/auth/callback.ts.
export async function iniciarSesionGoogle(redirectTo: string) {
  const { error } = await createClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) return { error: error.message };
  return { success: true };
}

// Decide el destino post-OAuth: usuario con org (enriquece perfil) o sin org
// (solo continúa con invitación válida).
export async function decidirOAuth(next: string) {
  const res = await fetch(`${API_URL}/auth/oauth/decide`, {
    method: 'POST',
    headers: await jwtHeaders(),
    body: JSON.stringify({ next }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: (json.error as string) ?? 'google-no-account' };
  return { redirect: (json.redirect as string) ?? '/' };
}

// ---- Invitaciones ----

export async function getInvitation(token: string) {
  const res = await fetch(`${API_URL}/invitaciones/${encodeURIComponent(token)}`);
  const json = await res.json();
  if (!res.ok) return { error: json.error ?? 'Invitación no encontrada' };
  return { data: json.data, organizationName: json.organization_name, scopeName: null };
}

export async function acceptInvitation(token: string) {
  const res = await fetch(`${API_URL}/invitaciones/${encodeURIComponent(token)}/aceptar`, {
    method: 'POST',
    headers: await jwtHeaders(),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error ?? 'No se pudo aceptar la invitación' };
  return { success: true, redirect: json.redirect };
}

export async function rejectInvitation(token: string) {
  await fetch(`${API_URL}/invitaciones/${encodeURIComponent(token)}/rechazar`, { method: 'POST' });
  return { success: true, redirect: '/login' };
}

export async function createInvitation(input: {
  role: 'admin' | 'collaborator';
  expiresAt: string;
  entityType?: string | null;
  entityId?: string | null;
  permission?: string | null;
  inherit?: boolean;
}) {
  const res = await fetch(`${API_URL}/invitaciones`, {
    method: 'POST',
    headers: await jwtHeaders(),
    body: JSON.stringify({
      role: input.role,
      expires_at: input.expiresAt,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      permission: input.permission ?? null,
      inherit: input.inherit,
    }),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error ?? 'Error al generar la invitación' };
  return { success: true, token: json.token, link: json.link };
}

export async function saveAssignmentGrants(input: {
  assigneeId: string;
  mainListId?: string | null;
  grants: {
    entity_type: string;
    entity_id: string;
    permission: string;
    inherit: boolean;
  }[];
}) {
  const res = await fetch(`${API_URL}/invitaciones/grants`, {
    method: 'POST',
    headers: await jwtHeaders(),
    body: JSON.stringify({
      assignee_id: input.assigneeId,
      main_list_id: input.mainListId ?? null,
      grants: input.grants,
    }),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error ?? 'Error otorgando accesos' };
  return { success: true, note: json.note };
}

