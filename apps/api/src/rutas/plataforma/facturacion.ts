import { Hono } from 'hono';
import { z } from 'zod';
import {
  ESTADOS_FACTURA,
  zFactura,
  zPlan,
  zSuscripcion,
  type Factura,
} from '@erp/shared';
import { getAdminClient } from '../../lib/supabase/admin';
import type { ContextoUsuario } from '../../middleware/verificar-jwt';
import { paginacion, registrarAuditoria } from './comun';

export const rutasFacturacion = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

const zActualizarFactura = z.object({
  estado: z.enum(ESTADOS_FACTURA),
  metodo: z.string().trim().max(80).optional().nullable(),
  notas: z.string().trim().max(1000).optional().nullable(),
});

// ---- Planes ----

// GET /plataforma/planes
rutasFacturacion.get('/planes', async (c) => {
  const { data, error } = await getAdminClient()
    .from('plans')
    .select('*')
    .order('orden', { ascending: true });
  if (error) return c.json({ error: 'No se pudieron cargar los planes' }, 500);
  return c.json({ data: data ?? [] });
});

// PUT /plataforma/planes/:id — catálogo editable (sin pasarela de pago).
rutasFacturacion.put('/planes/:id', async (c) => {
  const body = zPlan.omit({ id: true }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos del plan inválidos' }, 400);

  const { data, error } = await getAdminClient()
    .from('plans')
    .upsert({ id: c.req.param('id'), ...body.data }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error || !data) return c.json({ error: 'No se pudo guardar el plan' }, 500);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'plan.actualizar',
    entidadTipo: 'plan',
    entidadId: data.id as string,
    payload: { precio_mensual: data.precio_mensual },
  });

  return c.json({ data });
});

// ---- Suscripciones ----

// PUT /plataforma/empresas/:id/suscripcion
rutasFacturacion.put('/empresas/:id/suscripcion', async (c) => {
  const body = zSuscripcion.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos de suscripción inválidos' }, 400);

  const admin = getAdminClient();
  const orgId = c.req.param('id');
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return c.json({ error: 'Empresa no encontrada' }, 404);

  const { data: plan } = await admin
    .from('plans')
    .select('id')
    .eq('id', body.data.plan_id)
    .maybeSingle();
  if (!plan) return c.json({ error: 'Plan no encontrado' }, 400);

  const { data, error } = await admin
    .from('org_subscriptions')
    .upsert(
      {
        organization_id: orgId,
        plan_id: body.data.plan_id,
        estado: body.data.estado,
        periodo_inicio: body.data.periodo_inicio ?? null,
        periodo_fin: body.data.periodo_fin ?? null,
        precio_acordado: body.data.precio_acordado ?? null,
        notas: body.data.notas,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    )
    .select('*')
    .single();
  if (error || !data) return c.json({ error: 'No se pudo guardar la suscripción' }, 500);

  await admin.from('organizations').update({ plan_id: body.data.plan_id }).eq('id', orgId);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'suscripcion.actualizar',
    entidadTipo: 'organization',
    entidadId: orgId,
    payload: { plan_id: body.data.plan_id, estado: body.data.estado },
  });

  return c.json({ data });
});

// ---- Facturación manual ----

// GET /plataforma/facturas
rutasFacturacion.get('/facturas', async (c) => {
  const { estado, organization_id } = c.req.query();
  const { desde, hasta, page, pageSize } = paginacion(c.req.query());

  let consulta = getAdminClient()
    .from('billing_records')
    .select('*, organizations(name)', { count: 'exact' })
    .order('periodo', { ascending: false })
    .range(desde, hasta);
  if (estado) consulta = consulta.eq('estado', estado);
  if (organization_id) consulta = consulta.eq('organization_id', organization_id);

  const { data, count, error } = await consulta;
  if (error) return c.json({ error: 'No se pudo cargar la facturación' }, 500);

  const facturas: Factura[] = (data ?? []).map((f) => ({
    id: f.id as string,
    organization_id: f.organization_id as string,
    empresa_nombre:
      ((f.organizations as { name?: string } | null)?.name as string | undefined) ?? undefined,
    periodo: f.periodo as string,
    monto: Number(f.monto),
    moneda: f.moneda as string,
    estado: f.estado as Factura['estado'],
    pagado_at: (f.pagado_at as string | null) ?? null,
    metodo: (f.metodo as string | null) ?? null,
    notas: (f.notas as string | null) ?? null,
    created_at: f.created_at as string,
  }));

  return c.json({ data: facturas, total: count ?? 0, page, pageSize });
});

// POST /plataforma/facturas — registro manual (sin pasarela).
rutasFacturacion.post('/facturas', async (c) => {
  const body = zFactura.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos de factura inválidos' }, 400);

  const { data, error } = await getAdminClient()
    .from('billing_records')
    .insert({
      organization_id: body.data.organization_id,
      periodo: body.data.periodo,
      monto: body.data.monto,
      moneda: body.data.moneda,
      estado: body.data.estado,
      metodo: body.data.metodo,
      notas: body.data.notas,
      pagado_at: body.data.estado === 'pagada' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();
  if (error || !data) return c.json({ error: 'No se pudo registrar la factura' }, 500);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'factura.crear',
    entidadTipo: 'billing_record',
    entidadId: data.id as string,
    payload: { monto: data.monto, periodo: data.periodo },
  });

  return c.json({ data }, 201);
});

// PATCH /plataforma/facturas/:id — marcar pagada/anulada, notas, método.
rutasFacturacion.patch('/facturas/:id', async (c) => {
  const body = zActualizarFactura.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  const { data, error } = await getAdminClient()
    .from('billing_records')
    .update({
      estado: body.data.estado,
      metodo: body.data.metodo,
      notas: body.data.notas,
      pagado_at: body.data.estado === 'pagada' ? new Date().toISOString() : null,
    })
    .eq('id', c.req.param('id'))
    .select('*')
    .maybeSingle();
  if (error || !data) return c.json({ error: 'Factura no encontrada' }, 404);

  await registrarAuditoria({
    actorId: c.get('usuario').id,
    accion: 'factura.actualizar',
    entidadTipo: 'billing_record',
    entidadId: data.id as string,
    payload: { estado: data.estado },
  });

  return c.json({ data });
});
