import type { ContextoUsuario } from '../middleware/verificar-jwt';
import { Hono } from 'hono';
import { getAdminClient } from '../lib/supabase/admin';
import { verificarJwtMiddleware } from '../middleware/verificar-jwt';
import { requerirAdmin } from '../middleware/requerir-admin';
import { collectOrgExport, exportFileName } from '../lib/org-export';
import { captureErrorServer } from '../lib/captura-errores';

export const rutasOrganizacion = new Hono<{ Variables: { usuario: ContextoUsuario } }>();

rutasOrganizacion.use('/*', verificarJwtMiddleware);

// GET /organizacion/perfil — datos básicos de la org del usuario.
rutasOrganizacion.get('/perfil', async (c) => {
  const usuario = c.get('usuario');
  const orgId = usuario.perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const { data: org } = await getAdminClient()
    .from('organizations')
    .select('id, name, owner_id')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return c.json({ error: 'Organización no encontrada' }, 404);

  return c.json({
    data: { ...org, es_owner: org.owner_id === usuario.id },
  });
});

// GET /organizacion/exportar — JSON completo de la org (admin).
rutasOrganizacion.get('/exportar', requerirAdmin, async (c) => {
  const orgId = c.get('usuario').perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const datos = await collectOrgExport(getAdminClient(), orgId);
  return c.json(datos);
});

// GET /organizacion/exportar.xlsx — Excel de la org (admin).
rutasOrganizacion.get('/exportar.xlsx', requerirAdmin, async (c) => {
  const orgId = c.get('usuario').perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const datos = await collectOrgExport(getAdminClient(), orgId);

  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'ERP Empresarial';

  for (const [tabla, filas] of Object.entries(datos.tables ?? {})) {
    if (!Array.isArray(filas) || filas.length === 0) continue;
    const hoja = workbook.addWorksheet(tabla.slice(0, 31));
    const columnas = Object.keys(filas[0] as Record<string, unknown>);
    hoja.addRow(columnas);
    for (const filaRaw of filas) {
      const fila = filaRaw as Record<string, unknown>;
      hoja.addRow(
        columnas.map((col) => {
          const v = fila[col];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return JSON.stringify(v);
          return v;
        })
      );
    }
    hoja.columns.forEach((col) => {
      col.width = 24;
    });
  }

  const nombre = exportFileName(datos.organization_id, 'xlsx');
  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}.xlsx"`,
    },
  });
});

// DELETE /organizacion/sesiones — revoca TODAS las sesiones del usuario.
rutasOrganizacion.delete('/sesiones', async (c) => {
  const usuario = c.get('usuario');
  if (!usuario.perfil || usuario.perfil.role !== 'admin') {
    return c.json({ error: 'Sin permisos' }, 403);
  }

  const res = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/admin/users/${usuario.id}/sessions`,
    {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  );

  if (!res.ok) {
    void captureErrorServer({
      source: 'server',
      message: 'No se pudieron cerrar las sesiones',
      route: '/organizacion/sesiones',
      method: 'DELETE',
      userId: usuario.id,
    });
    return c.json({ error: 'No se pudieron cerrar las sesiones' }, 500);
  }

  return c.json({ success: true });
});

// POST /organizacion/eliminar — borra la org (owner).
rutasOrganizacion.post('/eliminar', requerirAdmin, async (c) => {
  const usuario = c.get('usuario');
  const orgId = usuario.perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const admin = getAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .maybeSingle();
  if (!org || org.owner_id !== usuario.id) {
    return c.json({ error: 'Solo el dueño puede eliminar la organización' }, 403);
  }

  const { error } = await admin.from('organizations').delete().eq('id', orgId);
  if (error) return c.json({ error: 'No se pudo eliminar la organización' }, 500);

  return c.json({ success: true });
});
