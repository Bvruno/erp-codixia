import { createClient } from '../supabase/client';
import { API_URL } from '../api/base';

async function jwtHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}

// Completa el onboarding del dueño vía API.
export async function completeOnboarding(formData: FormData) {
  const res = await fetch(`${API_URL}/auth/onboarding`, {
    method: 'POST',
    headers: await jwtHeaders(),
    body: JSON.stringify({
      org_name: (formData.get('org_name') as string) ?? '',
      timezone: (formData.get('timezone') as string) || 'America/Lima',
      daily_hours: Number(formData.get('daily_hours')) || 8,
      weekly_hours: Number(formData.get('weekly_hours')) || 40,
    }),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error ?? 'Error completando el onboarding' };
  return { success: true, redirect: json.redirect ?? '/' };
}