import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/admin';

// Helpers compartidos por las rutas de la plataforma. Todo corre con
// service role: la autorización vive en el middleware requerirPlataforma.

export interface ResultadoEmpresa {
  organizationId: string;
  invitationId: string;
  token: string;
  link: string;
  expiresAt: string;
}

/**
 * Crea empresa (sin dueño) + ajustes por defecto + invitación de admin.
 * El invitado la reclama en el onboarding (claim_organization).
 * Si algo falla, no deja empresas huérfanas.
 */
export async function crearEmpresaConInvitacion(input: {
  nombre: string;
  planId?: string | null;
  diasInvitacion: number;
  actorId: string;
}): Promise<{ ok: true; data: ResultadoEmpresa } | { ok: false; error: string; status: 400 | 500 }> {
  const admin = getAdminClient();

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: input.nombre,
      owner_id: null,
      plan_id: input.planId ?? null,
    })
    .select('id')
    .single();
  if (orgErr || !org) {
    return { ok: false, error: 'No se pudo crear la empresa', status: 500 };
  }

  const { error: settingsErr } = await admin.from('org_settings').upsert(
    {
      organization_id: org.id,
      daily_hours: 8,
      weekly_hours: 40,
      timezone: 'America/Mexico_City',
    },
    { onConflict: 'organization_id' }
  );
  if (settingsErr) {
    await admin.from('organizations').delete().eq('id', org.id);
    return { ok: false, error: 'No se pudo configurar la empresa', status: 500 };
  }

  if (input.planId) {
    const { error: subErr } = await admin.from('org_subscriptions').upsert(
      {
        organization_id: org.id,
        plan_id: input.planId,
        estado: 'activa',
        periodo_inicio: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    );
    if (subErr) {
      await admin.from('organizations').delete().eq('id', org.id);
      return { ok: false, error: 'No se pudo asignar el plan', status: 500 };
    }
  }

  const token = randomUUID();
  const expiresAt = new Date(
    Date.now() + input.diasInvitacion * 86_400_000
  ).toISOString();

  const { data: invitacion, error: inviteErr } = await admin
    .from('invitations')
    .insert({
      organization_id: org.id,
      // El trigger trg_invitations_hash_token lo guarda como SHA-256.
      token,
      created_by: input.actorId,
      expires_at: expiresAt,
      status: 'pending',
      role: 'admin',
    })
    .select('id')
    .single();
  if (inviteErr || !invitacion) {
    await admin.from('organizations').delete().eq('id', org.id);
    return { ok: false, error: 'No se pudo generar la invitación', status: 500 };
  }

  const base = (process.env.WEB_ORIGIN ?? '').replace(/\/+$/, '');
  return {
    ok: true,
    data: {
      organizationId: org.id,
      invitationId: invitacion.id,
      token,
      link: `${base}/invitacion/${token}`,
      expiresAt,
    },
  };
}

/** Registra una acción de plataforma. Nunca lanza ni rompe la operación. */
export async function registrarAuditoria(input: {
  actorId: string;
  accion: string;
  entidadTipo?: string;
  entidadId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getAdminClient()
      .from('platform_audit_logs')
      .insert({
        actor_id: input.actorId,
        accion: input.accion,
        entidad_tipo: input.entidadTipo ?? null,
        entidad_id: input.entidadId ?? null,
        payload: input.payload ?? {},
      });
  } catch {
    // La auditoría no puede tumbar la acción principal.
  }
}

export function paginacion(query: { page?: string; pageSize?: string }): {
  page: number;
  pageSize: number;
  desde: number;
  hasta: number;
} {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(query.pageSize ?? '25', 10) || 25)
  );
  const desde = (page - 1) * pageSize;
  return { page, pageSize, desde, hasta: desde + pageSize - 1 };
}

/** Mapa id → { email, nombre } de auth.users (paginado, hasta 10k). */
export async function usuariosAuthPorId(
  ids: string[]
): Promise<Map<string, { email: string | null; nombre: string | null }>> {
  const mapa = new Map<string, { email: string | null; nombre: string | null }>();
  if (ids.length === 0) return mapa;
  const pendientes = new Set(ids);
  const admin = getAdminClient();
  for (let page = 1; page <= 10 && pendientes.size > 0; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const usuarios = data?.users ?? [];
    if (usuarios.length === 0) break;
    for (const u of usuarios) {
      if (!pendientes.has(u.id)) continue;
      pendientes.delete(u.id);
      mapa.set(u.id, {
        email: u.email ?? null,
        nombre:
          (u.user_metadata?.full_name as string | undefined) ??
          (u.user_metadata?.name as string | undefined) ??
          null,
      });
    }
  }
  return mapa;
}

export async function buscarUsuarioPorEmail(
  email: string
): Promise<{ id: string; email: string | null } | null> {
  const objetivo = email.trim().toLowerCase();
  const admin = getAdminClient();
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const usuarios = data?.users ?? [];
    if (usuarios.length === 0) return null;
    const encontrado = usuarios.find((u) => (u.email ?? '').toLowerCase() === objetivo);
    if (encontrado) return { id: encontrado.id, email: encontrado.email ?? null };
  }
  return null;
}
