import { Hono } from 'hono';
import {
  zCrearEmpresaOwner,
  zRechazarSolicitud,
  zRevisarSolicitud,
  type EstadoSolicitud,
} from '@erp/shared';
import { getAdminClient } from '../../lib/supabase/admin';
import type { ContextoUsuario } from '../../middleware/verificar-jwt';
import {
  crearEmpresaConInvitacion,
  paginacion,
  registrarAuditoria,
} from './comun';

export const rutasSolicitudes = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

const ESTADOS_VALIDOS: EstadoSolicitud[] = [
  'pendiente',
  'en_revision',
  'aprobada',
  'rechazada',
  'invitada',
  'activada',
];

// GET /plataforma/solicitudes — bandeja con filtros y paginación.
rutasSolicitudes.get('/', async (c) => {
  const { estado, q } = c.req.query();
  const { desde, hasta, page, pageSize } = paginacion(c.req.query());

  let consulta = getAdminClient()
    .from('owner_applications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(desde, hasta);

  if (estado && ESTADOS_VALIDOS.includes(estado as EstadoSolicitud)) {
    consulta = consulta.eq('estado', estado);
  }
  if (q?.trim()) {
    const patron = `%${q.trim().replace(/[%_]/g, '')}%`;
    consulta = consulta.or(
      `empresa.ilike.${patron},email.ilike.${patron},nombre_contacto.ilike.${patron}`
    );
  }

  const { data, count, error } = await consulta;
  if (error) return c.json({ error: 'No se pudieron cargar las solicitudes' }, 500);

  return c.json({ data: data ?? [], total: count ?? 0, page, pageSize });
});

// PATCH /plataforma/solicitudes/:id — notas y paso a "en revisión".
rutasSolicitudes.patch('/:id', async (c) => {
  const body = zRevisarSolicitud.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const cambios: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.data.notas_admin !== undefined) cambios.notas_admin = body.data.notas_admin;
  if (body.data.estado) {
    cambios.estado = body.data.estado;
    cambios.reviewed_by = c.get('usuario').id;
    cambios.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await getAdminClient()
    .from('owner_applications')
    .update(cambios)
    .eq('id', c.req.param('id'))
    .select('*')
    .maybeSingle();
  if (error || !data) return c.json({ error: 'Solicitud no encontrada' }, 404);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'solicitud.actualizar',
    entidadTipo: 'owner_application',
    entidadId: data.id,
    payload: { estado: data.estado },
  });

  return c.json({ data });
});

// POST /plataforma/solicitudes/:id/aprobar — crea empresa + invitación.
rutasSolicitudes.post('/:id/aprobar', async (c) => {
  const body = zCrearEmpresaOwner.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const admin = getAdminClient();
  const { data: solicitud } = await admin
    .from('owner_applications')
    .select('*')
    .eq('id', c.req.param('id'))
    .maybeSingle();
  if (!solicitud) return c.json({ error: 'Solicitud no encontrada' }, 404);
  if (solicitud.estado === 'invitada' || solicitud.estado === 'activada') {
    return c.json({ error: 'La solicitud ya fue invitada' }, 409);
  }
  if (solicitud.estado === 'rechazada') {
    return c.json({ error: 'La solicitud fue rechazada' }, 400);
  }

  const creada = await crearEmpresaConInvitacion({
    nombre: body.data.nombre?.trim() || solicitud.empresa,
    planId: body.data.plan_id ?? null,
    diasInvitacion: body.data.dias_invitacion ?? 14,
    actorId: c.get('usuario').id,
  });
  if (!creada.ok) return c.json({ error: creada.error }, creada.status);

  const notas = body.data.notas ?? solicitud.notas_admin;
  const { error: updErr } = await admin
    .from('owner_applications')
    .update({
      estado: 'invitada',
      organization_id: creada.data.organizationId,
      invitation_id: creada.data.invitationId,
      notas_admin: notas,
      reviewed_by: c.get('usuario').id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', solicitud.id);
  if (updErr) {
    // La empresa ya existe; no se revierte, solo se reporta.
    return c.json(
      {
        error: 'Empresa creada, pero no se pudo actualizar la solicitud',
        organization_id: creada.data.organizationId,
        link: creada.data.link,
      },
      500
    );
  }

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'solicitud.aprobar',
    entidadTipo: 'owner_application',
    entidadId: solicitud.id,
    payload: {
      empresa: body.data.nombre?.trim() || solicitud.empresa,
      organization_id: creada.data.organizationId,
    },
  });

  return c.json({
    ok: true,
    organization_id: creada.data.organizationId,
    link: creada.data.link,
    expira_at: creada.data.expiresAt,
  });
});

// POST /plataforma/solicitudes/:id/rechazar — cierra la solicitud.
rutasSolicitudes.post('/:id/rechazar', async (c) => {
  const body = zRechazarSolicitud.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'El motivo es obligatorio' }, 400);

  const { data, error } = await getAdminClient()
    .from('owner_applications')
    .update({
      estado: 'rechazada',
      notas_admin: body.data.motivo,
      reviewed_by: c.get('usuario').id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', c.req.param('id'))
    .select('id')
    .maybeSingle();
  if (error || !data) return c.json({ error: 'Solicitud no encontrada' }, 404);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'solicitud.rechazar',
    entidadTipo: 'owner_application',
    entidadId: data.id,
    payload: { motivo: body.data.motivo },
  });

  return c.json({ ok: true });
});
