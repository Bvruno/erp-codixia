import { Hono } from 'hono';
import {
  ESTADOS_SOLICITUD,
  type EstadisticasPlataforma,
  type EstadoSolicitud,
} from '@erp/shared';
import { getAdminClient } from '../../lib/supabase/admin';
import type { ContextoUsuario } from '../../middleware/verificar-jwt';

export const rutasEstadisticas = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

const DIAS_30 = 30 * 86_400_000;

// GET /plataforma/estadisticas — métricas globales de la plataforma.
rutasEstadisticas.get('/', async (c) => {
  const admin = getAdminClient();
  const hace30 = new Date(Date.now() - DIAS_30).toISOString();

  const [
    { data: orgs },
    { data: solicitudes },
    { data: planes },
    { data: subs },
    { count: miembrosTotales },
    { count: miembrosActivos },
    { count: tareasAbiertas },
    { count: documentos },
    { data: facturas30 },
  ] = await Promise.all([
    admin.from('organizations').select('id, status, plan_id, created_at'),    admin.from('owner_applications').select('estado'),
    admin.from('plans').select('id, nombre, precio_mensual'),
    admin.from('org_subscriptions').select('organization_id, plan_id, precio_acordado'),
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('last_active_at', hace30),
    admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .is('completed_at', null),
    admin.from('documents').select('id', { count: 'exact', head: true }),
    admin
      .from('billing_records')
      .select('monto, estado, created_at')
      .gte('created_at', hace30),
  ]);

  const organizaciones = (orgs ?? []) as {
    id: string;
    status: string;
    plan_id: string | null;
    created_at: string;
  }[];

  const porEstado = Object.fromEntries(
    ESTADOS_SOLICITUD.map((e) => [e, 0])
  ) as Record<EstadoSolicitud, number>;
  for (const s of solicitudes ?? []) {
    const estado = s.estado as EstadoSolicitud;
    if (estado in porEstado) porEstado[estado] += 1;
  }

  const precios = new Map(
    (planes ?? []).map((p) => [p.id as string, Number(p.precio_mensual)])
  );
  const preciosAcordados = new Map(
    (subs ?? []).map((s) => [s.organization_id as string, s.precio_acordado as number | null])
  );

  const porPlan = new Map<string, { empresas: number; mrr: number }>();
  let mrr = 0;
  for (const org of organizaciones) {
    if (!org.plan_id) continue;
    const acumulado = porPlan.get(org.plan_id) ?? { empresas: 0, mrr: 0 };
    acumulado.empresas += 1;
    if (org.status === 'activa') {
      const precio = preciosAcordados.get(org.id) ?? precios.get(org.plan_id) ?? 0;
      acumulado.mrr += Number(precio) || 0;
      mrr += Number(precio) || 0;
    }
    porPlan.set(org.plan_id, acumulado);
  }

  let facturado30 = 0;
  let cobrado30 = 0;
  for (const f of facturas30 ?? []) {
    if (f.estado === 'anulada') continue;
    const monto = Number(f.monto) || 0;
    facturado30 += monto;
    if (f.estado === 'pagada') cobrado30 += monto;
  }

  const estadisticas: EstadisticasPlataforma = {
    empresas: {
      total: organizaciones.length,
      activas: organizaciones.filter((o) => o.status === 'activa').length,
      suspendidas: organizaciones.filter((o) => o.status === 'suspendida').length,
      nuevas_30d: organizaciones.filter((o) => o.created_at >= hace30).length,
    },
    solicitudes: porEstado,
    planes: (planes ?? []).map((p) => {
      const acumulado = porPlan.get(p.id as string) ?? { empresas: 0, mrr: 0 };
      return {
        plan_id: p.id as string,
        plan_nombre: p.nombre as string,
        empresas: acumulado.empresas,
        mrr: acumulado.mrr,
      };
    }),
    uso: {
      miembros_totales: miembrosTotales ?? 0,
      miembros_activos_30d: miembrosActivos ?? 0,
      tareas_abiertas: tareasAbiertas ?? 0,
      documentos: documentos ?? 0,
      facturado_30d: facturado30,
      cobrado_30d: cobrado30,
    },
    mrr_estimado: mrr,
  };

  return c.json({ data: estadisticas });
});
