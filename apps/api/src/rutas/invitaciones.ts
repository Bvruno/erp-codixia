import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getAdminClient } from '../lib/supabase/admin';
import { hashInviteToken } from '@erp/shared';
import { verificarJwtMiddleware } from '../middleware/verificar-jwt';
import { crearClienteJwt } from '../supabase/verificar-token';

export const rutasInvitaciones = new Hono();

const VALID_ENTITY_TYPES = ['workspace', 'folder', 'list', 'document', 'mindmap', 'todo', 'formulario'];
const VALID_PERMISSIONS = ['read', 'write', 'manage'];

const esquemaCrear = z.object({
  role: z.enum(['admin', 'collaborator']),
  expires_at: z.string(),
  entity_type: z.string().optional().nullable(),
  entity_id: z.string().optional().nullable(),
  permission: z.string().optional().nullable(),
  inherit: z.boolean().optional(),
});

const esquemaGrants = z.object({
  assignee_id: z.string().uuid(),
  main_list_id: z.string().uuid().optional().nullable(),
  grants: z.array(
    z.object({
      entity_type: z.string(),
      entity_id: z.string(),
      permission: z.string(),
      inherit: z.boolean(),
    })
  ),
});

function inviteEntityTable(
  entityType: string
):
  | 'workspaces'
  | 'workspace_folders'
  | 'task_lists'
  | 'documents'
  | 'mind_maps'
  | 'formularios' {
  switch (entityType) {
    case 'workspace':
      return 'workspaces';
    case 'folder':
      return 'workspace_folders';
    case 'list':
      return 'task_lists';
    case 'mindmap':
      return 'mind_maps';
    case 'formulario':
      return 'formularios';
    default:
      return 'documents';
  }
}

async function entityOrgOf(
  entityType: string,
  entityId: string
): Promise<string | null> {
  const tabla = inviteEntityTable(entityType);
  const { data } = await getAdminClient()
    .from(tabla)
    .select('organization_id')
    .eq('id', entityId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

// GET /invitaciones/:token — datos públicos de la invitación (pre-auth).
rutasInvitaciones.get('/:token', async (c) => {
  const token = c.req.param('token');
  const supabase = crearClienteJwt();
  const { data: invitacion } = await supabase.rpc('get_invitation', {
    p_token: await hashInviteToken(token),
  });

  if (!invitacion || invitacion.length === 0) {
    return c.json({ error: 'Invitación no encontrada' }, 404);
  }

  const admin = getAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', invitacion[0].organization_id)
    .maybeSingle();

  return c.json({ data: invitacion[0], organization_name: org?.name ?? null });
});

// POST /invitaciones/:token/aceptar — asigna org/rol/grants al usuario.
rutasInvitaciones.post('/:token/aceptar', verificarJwtMiddleware, async (c) => {
  const token = c.req.param('token');
  const usuario = c.get('usuario');
  const admin = getAdminClient();

  const { data: invitacion } = await admin
    .from('invitations')
    .select('*')
    .eq('token', await hashInviteToken(token))
    .maybeSingle();

  if (
    !invitacion ||
    invitacion.status !== 'pending' ||
    new Date(invitacion.expires_at) < new Date()
  ) {
    return c.json({ error: 'Invitación inválida o expirada' }, 400);
  }

  const { data: perfil } = await admin
    .from('profiles')
    .select('organization_id, full_name')
    .eq('id', usuario.id)
    .maybeSingle();
  if (!perfil) return c.json({ error: 'Perfil no encontrado' }, 404);

  // Sanitización de grant (el path service-role no re-evalúa RLS).
  const hasScope = !!invitacion.entity_type && !!invitacion.entity_id;
  let permission: string | null = null;
  let inherit = true;

  if (hasScope) {
    if (!VALID_ENTITY_TYPES.includes(invitacion.entity_type)) {
      return c.json({ error: 'Invitación inválida' }, 400);
    }
    permission = VALID_PERMISSIONS.includes(invitacion.permission)
      ? invitacion.permission
      : 'read';
    inherit = typeof invitacion.inherit === 'boolean' ? invitacion.inherit : true;

    const entityOrg = await entityOrgOf(
      invitacion.entity_type,
      invitacion.entity_id
    );
    if (entityOrg !== invitacion.organization_id) {
      return c.json({ error: 'Invitación inválida' }, 400);
    }
  }

  const updates: Record<string, unknown> = {
    organization_id: invitacion.organization_id,
    role: invitacion.role,
    access_mode:
      hasScope && invitacion.role === 'collaborator' ? 'grants_only' : 'org',
  };

if (!perfil.full_name || perfil.full_name === usuario.email) {
    const { data: authUser } = await admin.auth.admin.getUserById(usuario.id);
    const meta = authUser.user?.user_metadata ?? {};
    updates.full_name = meta.full_name || meta.name || usuario.email || 'Usuario';
  }

  const { error: perfilErr } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', usuario.id);
  if (perfilErr) return c.json({ error: 'Error actualizando perfil' }, 500);

  if (hasScope && invitacion.entity_id) {
    const { error: grantErr } = await admin.from('entity_visibility').upsert(
      {
        entity_type: invitacion.entity_type,
        entity_id: invitacion.entity_id,
        profile_id: usuario.id,
        permission,
        inherit,
      },
      { onConflict: 'entity_type,entity_id,profile_id' }
    );
    if (grantErr) return c.json({ error: 'Error asignando accesos' }, 500);
  }

  const { error: inviteErr } = await admin
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitacion.id);
  if (inviteErr) return c.json({ error: 'Error actualizando invitación' }, 500);

  // Primer admin de empresa sin dueño → onboarding.
  const { data: org } = await admin
    .from('organizations')
    .select('owner_id')
    .eq('id', invitacion.organization_id)
    .maybeSingle();
  const needsOnboarding = invitacion.role === 'admin' && org && org.owner_id === null;

  if (needsOnboarding) {
    await admin
      .from('profiles')
      .update({ onboarding_pending: true })
      .eq('id', usuario.id);
  }

  return c.json({
    success: true,
    redirect: needsOnboarding ? '/onboarding' : '/calendario',
  });
});

// POST /invitaciones/:token/rechazar
rutasInvitaciones.post('/:token/rechazar', async (c) => {
  const token = c.req.param('token');
  const admin = getAdminClient();
  const { data: invitacion } = await admin
    .from('invitations')
    .select('id, status')
    .eq('token', await hashInviteToken(token))
    .maybeSingle();
  if (invitacion && invitacion.status === 'pending') {
    await admin.from('invitations').update({ status: 'rejected' }).eq('id', invitacion.id);
  }
  return c.json({ success: true });
});

// POST /invitaciones — crear invitación (admin; admin-role solo owner).
rutasInvitaciones.post('/', verificarJwtMiddleware, async (c) => {
  const body = esquemaCrear.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos de invitación inválidos' }, 400);
  const usuario = c.get('usuario');
  const me = usuario.perfil;
  if (!me?.organization_id) return c.json({ error: 'Tu cuenta está bloqueada' }, 403);
  if (me.role !== 'admin') {
    return c.json({ error: 'Solo administradores pueden generar invitaciones' }, 403);
  }

  const admin = getAdminClient();
  if (body.data.role === 'admin') {
    const { data: org } = await admin
      .from('organizations')
      .select('owner_id')
      .eq('id', me.organization_id)
      .maybeSingle();
    if (!org || org.owner_id !== usuario.id) {
      return c.json(
        { error: 'Solo el dueño de la organización puede invitar administradores' },
        403
      );
    }
  }

  const expiresAt = new Date(body.data.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    return c.json({ error: 'Fecha de expiración inválida' }, 400);
  }

  const hasScope = !!body.data.entity_type && !!body.data.entity_id;
  const scopeType = hasScope ? body.data.entity_type : null;
  const scopeId = hasScope ? body.data.entity_id : null;
  if (hasScope && scopeType && scopeId) {
    if (
      !VALID_ENTITY_TYPES.includes(scopeType) ||
      !VALID_PERMISSIONS.includes(body.data.permission ?? '')
    ) {
      return c.json({ error: 'Alcance de acceso inválido' }, 400);
    }
    const entityOrg = await entityOrgOf(scopeType, scopeId);
    if (entityOrg !== me.organization_id) {
      return c.json(
        { error: 'La entidad seleccionada no pertenece a tu organización' },
        400
      );
    }
  }

  const token = randomUUID();
  const { error } = await admin.from('invitations').insert({
    organization_id: me.organization_id,
    token: await hashInviteToken(token),
    created_by: usuario.id,
    expires_at: expiresAt.toISOString(),
    status: 'pending',
    role: body.data.role,
    entity_type: scopeType,
    entity_id: scopeId,
    permission: scopeType ? body.data.permission : null,
    inherit: scopeType
      ? typeof body.data.inherit === 'boolean'
        ? body.data.inherit
        : true
      : true,
  });
  if (error) return c.json({ error: 'Error al generar la invitación' }, 500);

  return c.json({
    success: true,
    token,
    link: `${process.env.WEB_ORIGIN}/invitacion/${token}`,
  });
});

// POST /invitaciones/:id/cancelar
rutasInvitaciones.post('/:id/cancelar', verificarJwtMiddleware, async (c) => {
  const usuario = c.get('usuario');
  const me = usuario.perfil;
  if (!me?.organization_id || me.role !== 'admin') {
    return c.json({ error: 'Solo administradores pueden cancelar invitaciones' }, 403);
  }
  const { error } = await getAdminClient()
    .from('invitations')
    .update({ status: 'cancelled' })
    .eq('id', c.req.param('id'))
    .eq('organization_id', me.organization_id);
  if (error) return c.json({ error: 'No se pudo cancelar la invitación' }, 500);
  return c.json({ success: true });
});

// POST /invitaciones/grants — otorga grants de acceso a un miembro.
rutasInvitaciones.post('/grants', verificarJwtMiddleware, async (c) => {
  const body = esquemaGrants.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos de grants inválidos' }, 400);
  const usuario = c.get('usuario');
  const me = usuario.perfil;

  if (!me?.organization_id) return c.json({ error: 'Debes iniciar sesión' }, 401);
  if (body.data.grants.length === 0) return c.json({ success: true });

  const admin = getAdminClient();
  const { data: objetivo } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', body.data.assignee_id)
    .maybeSingle();
  if (!objetivo || objetivo.organization_id !== me.organization_id) {
    return c.json({ error: 'Destinatario no válido' }, 400);
  }

  let rows = body.data.grants.filter(
    (g) =>
      VALID_ENTITY_TYPES.includes(g.entity_type) &&
      VALID_PERMISSIONS.includes(g.permission) &&
      g.entity_id
  );

  let nota: string | null = null;

  if (me.role !== 'admin') {
    const mainOnly = rows.filter(
      (g) => g.entity_type === 'list' && g.entity_id === body.data.main_list_id
    );
    if (mainOnly.length !== rows.length) {
      nota = 'Solo administradores pueden otorgar accesos adicionales';
    }
    rows = mainOnly.map((g) => ({ ...g, permission: 'read' }));
  }

  if (rows.length === 0) {
    return c.json({ success: true, note: nota ?? 'Sin accesos para aplicar' });
  }

  const { error } = await admin.from('entity_visibility').upsert(
    rows.map((g) => ({
      entity_type: g.entity_type,
      entity_id: g.entity_id,
      profile_id: body.data.assignee_id,
      permission: g.permission,
      inherit: g.inherit,
    })),
    { onConflict: 'entity_type,entity_id,profile_id' }
  );
  if (error) return c.json({ error: 'Error otorgando accesos' }, 500);

  return c.json({ success: true, note: nota });
});

