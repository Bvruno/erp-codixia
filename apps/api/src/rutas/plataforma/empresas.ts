import { Hono } from 'hono';
import {
  zCrearEmpresaOwner,
  zEliminarEmpresa,
  zSuspenderEmpresa,
  type EmpresaPlataforma,
} from '@erp/shared';
import { getAdminClient } from '../../lib/supabase/admin';
import { emitirEvento } from '../../lib/telegram-plataforma';
import {
  invalidarPerfilCache,
  type ContextoUsuario,
} from '../../middleware/verificar-jwt';
import {
  crearEmpresaConInvitacion,
  paginacion,
  registrarAuditoria,
  usuariosAuthPorId,
} from './comun';
export const rutasEmpresas = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

const DIAS_ACTIVO = 30 * 86_400_000;

async function invalidarMiembros(organizationId: string): Promise<void> {
  const { data } = await getAdminClient()
    .from('profiles')
    .select('id')
    .eq('organization_id', organizationId);
  for (const fila of data ?? []) invalidarPerfilCache(fila.id as string);
}

async function mapearEmpresas(orgs: Record<string, unknown>[]): Promise<EmpresaPlataforma[]> {
  if (orgs.length === 0) return [];
  const admin = getAdminClient();
  const ids = orgs.map((o) => o.id as string);
  const ownerIds = orgs
    .map((o) => o.owner_id as string | null)
    .filter((id): id is string => Boolean(id));

  const [{ data: perfiles }, { data: subs }, { data: planes }, usuarios] = await Promise.all([
    admin
      .from('profiles')
      .select('organization_id, last_active_at')
      .in('organization_id', ids)
      .limit(10_000),
    admin
      .from('org_subscriptions')
      .select('organization_id, estado')
      .in('organization_id', ids),
    admin.from('plans').select('id, nombre'),
    usuariosAuthPorId(ownerIds),
  ]);

  const nombresPlan = new Map(
    (planes ?? []).map((p) => [p.id as string, p.nombre as string])
  );
  const subsPorOrg = new Map(
    (subs ?? []).map((s) => [s.organization_id as string, s.estado as string])
  );

  const limiteActividad = Date.now() - DIAS_ACTIVO;
  const miembros = new Map<string, number>();
  const activos = new Map<string, number>();
  const ultima = new Map<string, string>();
  for (const p of perfiles ?? []) {
    const org = p.organization_id as string;
    miembros.set(org, (miembros.get(org) ?? 0) + 1);
    const visto = p.last_active_at as string | null;
    if (visto && new Date(visto).getTime() >= limiteActividad) {
      activos.set(org, (activos.get(org) ?? 0) + 1);
    }
    if (visto && (!ultima.get(org) || visto > ultima.get(org)!)) {
      ultima.set(org, visto);
    }
  }

  return orgs.map((o) => {
    const id = o.id as string;
    const ownerId = (o.owner_id as string | null) ?? null;
    const usuario = ownerId ? usuarios.get(ownerId) : undefined;
    const planId = (o.plan_id as string | null) ?? null;
    return {
      id,
      nombre: o.name as string,
      estado: (o.status as EmpresaPlataforma['estado']) ?? 'activa',
      suspendida_at: (o.suspended_at as string | null) ?? null,
      suspension_motivo: (o.suspended_reason as string | null) ?? null,
      plan_id: planId,
      plan_nombre: planId ? nombresPlan.get(planId) ?? null : null,
      owner_id: ownerId,
      owner_nombre: usuario?.nombre ?? null,
      owner_email: usuario?.email ?? null,
      miembros: miembros.get(id) ?? 0,
      miembros_activos_30d: activos.get(id) ?? 0,
      suscripcion_estado:
        (subsPorOrg.get(id) as EmpresaPlataforma['suscripcion_estado']) ?? null,
      creada_at: o.created_at as string,
      ultima_actividad: ultima.get(id) ?? null,
    };
  });
}

// GET /plataforma/empresas — listado con métricas básicas.
rutasEmpresas.get('/', async (c) => {
  const { estado, q, plan } = c.req.query();
  const { desde, hasta, page, pageSize } = paginacion(c.req.query());

  let consulta = getAdminClient()
    .from('organizations')
    .select(
      'id, name, status, suspended_at, suspended_reason, plan_id, owner_id, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(desde, hasta);

  if (estado === 'activa' || estado === 'suspendida') consulta = consulta.eq('status', estado);
  if (plan) consulta = consulta.eq('plan_id', plan);
  if (q?.trim()) {
    consulta = consulta.ilike('name', `%${q.trim().replace(/[%_]/g, '')}%`);
  }

  const { data, count, error } = await consulta;
  if (error) return c.json({ error: 'No se pudieron cargar las empresas' }, 500);

  const empresas = await mapearEmpresas((data ?? []) as Record<string, unknown>[]);
  return c.json({ data: empresas, total: count ?? 0, page, pageSize });
});

// GET /plataforma/empresas/:id — ficha completa con uso y facturación.
rutasEmpresas.get('/:id', async (c) => {
  const admin = getAdminClient();
  const id = c.req.param('id');

  const { data: org, error } = await admin
    .from('organizations')
    .select(
      'id, name, status, suspended_at, suspended_reason, plan_id, owner_id, created_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !org) return c.json({ error: 'Empresa no encontrada' }, 404);

  const [empresa] = await mapearEmpresas([org as Record<string, unknown>]);

  const [
    { count: tareasAbiertas },
    { count: tareasTotal },
    { count: documentos },
    { count: formularios },
    { data: suscripcion },
    { data: facturas },
  ] = await Promise.all([
    admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', id)
      .is('completed_at', null),
    admin.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', id),
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', id),
    admin
      .from('formularios')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', id),
    admin.from('org_subscriptions').select('*').eq('organization_id', id).maybeSingle(),
    admin
      .from('billing_records')
      .select('*')
      .eq('organization_id', id)
      .order('periodo', { ascending: false })
      .limit(50),
  ]);

  return c.json({
    data: {
      ...empresa,
      uso: {
        tareas_abiertas: tareasAbiertas ?? 0,
        tareas_total: tareasTotal ?? 0,
        documentos: documentos ?? 0,
        formularios: formularios ?? 0,
      },
      suscripcion: suscripcion ?? null,
      facturas: facturas ?? [],
    },
  });
});

// POST /plataforma/empresas — invita a un owner sin solicitud previa.
rutasEmpresas.post('/', async (c) => {
  const body = zCrearEmpresaOwner.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const creada = await crearEmpresaConInvitacion({
    nombre: body.data.nombre,
    planId: body.data.plan_id ?? null,
    diasInvitacion: body.data.dias_invitacion,
    actorId: c.get('usuario').id,
  });
  if (!creada.ok) return c.json({ error: creada.error }, creada.status);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'empresa.crear',
    entidadTipo: 'organization',
    entidadId: creada.data.organizationId,
    payload: { nombre: body.data.nombre, email_owner: body.data.email_owner ?? null },
  });

  void emitirEvento(
    'empresa_creada',
    {
      empresa: body.data.nombre,
      owner_email: body.data.email_owner ?? '—',
      enlace_invitacion: creada.data.link,
    },
    { entidadTipo: 'organization', entidadId: creada.data.organizationId }
  );

  return c.json(
    {
      ok: true,
      organization_id: creada.data.organizationId,
      link: creada.data.link,
      expira_at: creada.data.expiresAt,
    },
    201
  );
});

// POST /plataforma/empresas/:id/suspender — bloquea a todos los miembros.
rutasEmpresas.post('/:id/suspender', async (c) => {
  const body = zSuspenderEmpresa.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'El motivo es obligatorio' }, 400);

  const { data, error } = await getAdminClient()
    .from('organizations')
    .update({
      status: 'suspendida',
      suspended_at: new Date().toISOString(),
      suspended_reason: body.data.motivo,
    })
    .eq('id', c.req.param('id'))
    .select('id, name')
    .maybeSingle();
  if (error || !data) return c.json({ error: 'Empresa no encontrada' }, 404);

  await invalidarMiembros(data.id);
  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'empresa.suspender',
    entidadTipo: 'organization',
    entidadId: data.id,
    payload: { motivo: body.data.motivo },
  });

  void emitirEvento(
    'empresa_suspendida',
    { empresa: data.name, motivo: body.data.motivo },
    { entidadTipo: 'organization', entidadId: data.id }
  );

  return c.json({ ok: true });
});

// POST /plataforma/empresas/:id/reactivar
rutasEmpresas.post('/:id/reactivar', async (c) => {
  const { data, error } = await getAdminClient()
    .from('organizations')
    .update({ status: 'activa', suspended_at: null, suspended_reason: null })
    .eq('id', c.req.param('id'))
    .select('id, name')
    .maybeSingle();
  if (error || !data) return c.json({ error: 'Empresa no encontrada' }, 404);

  await invalidarMiembros(data.id);
  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'empresa.reactivar',
    entidadTipo: 'organization',
    entidadId: data.id,
  });

  void emitirEvento(
    'empresa_reactivada',
    { empresa: data.name },
    { entidadTipo: 'organization', entidadId: data.id }
  );

  return c.json({ ok: true });
});

// DELETE /plataforma/empresas/:id — borrado definitivo con confirmación.
rutasEmpresas.delete('/:id', async (c) => {
  const body = zEliminarEmpresa.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Confirmación requerida' }, 400);

  const admin = getAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', c.req.param('id'))
    .maybeSingle();
  if (!org) return c.json({ error: 'Empresa no encontrada' }, 404);
  if (body.data.confirmacion !== org.name) {
    return c.json({ error: 'El nombre de confirmación no coincide' }, 400);
  }

  await invalidarMiembros(org.id);
  const { error } = await admin.from('organizations').delete().eq('id', org.id);
  if (error) return c.json({ error: 'No se pudo eliminar la empresa' }, 500);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'empresa.eliminar',
    entidadTipo: 'organization',
    entidadId: org.id,
    payload: { nombre: org.name },
  });

  void emitirEvento(
    'empresa_eliminada',
    { empresa: org.name },
    { entidadTipo: 'organization', entidadId: org.id }
  );

  return c.json({ ok: true });
});
