import { createClient } from '../supabase/client';
import { API_URL } from '../api/base';

async function jwtHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}

// Login del panel: valida credenciales y exige es_plataforma en la API.
export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  if (!email || !password) return { error: 'Email y contraseña requeridos' };

  const { data, error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!data.session) return { error: 'No se pudo iniciar sesión' };

  const res = await fetch(`${API_URL}/auth/estado`, { headers: await jwtHeaders() });
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
    await createClient().auth.signOut();
    return { error: cuerpo.error ?? 'No se pudo validar tu cuenta' };
  }

  const estado = (await res.json()) as { es_plataforma?: boolean };
  if (!estado.es_plataforma) {
    await createClient().auth.signOut();
    return { error: 'Tu cuenta no tiene acceso a la plataforma.' };
  }

  return { success: true, redirect: '/' };
}

export async function logout() {
  await createClient().auth.signOut();
  return { success: true, redirect: '/login' };
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
