import type { ContextoUsuario } from '../middleware/verificar-jwt';
import { Hono } from 'hono';
import { getAdminClient } from '../lib/supabase/admin';
import { verificarJwtMiddleware } from '../middleware/verificar-jwt';
import { requerirAdmin } from '../middleware/requerir-admin';

export const rutasDebug = new Hono<{ Variables: { usuario: ContextoUsuario } }>();

rutasDebug.use('/*', verificarJwtMiddleware, requerirAdmin);

// GET /debug/base-datos — conteos y diagnóstico (solo admin).
rutasDebug.get('/base-datos', async (c) => {
  const admin = getAdminClient();
  const resultados: Record<string, unknown> = {};

  const tablas = [
    'organizations',
    'profiles',
    'workspaces',
    'workspace_folders',
    'task_lists',
    'entity_visibility',
    'tasks',
    'task_notes',
  ];

  for (const tabla of tablas) {
    const { count, error } = await admin.from(tabla).select('*', {
      count: 'exact',
      head: true,
    });
    resultados[tabla] = error ? { error: error.message } : { count: count ?? 0 };
  }

  const { data: rls, error: rlsErr } = await admin.rpc('debug_rls_status');
  const { data: policies, error: polErr } = await admin.rpc('debug_policies');
  const { data: columns, error: colErr } = await admin.rpc('debug_columns');

  return c.json({
    conteos: resultados,
    rls: rlsErr ? { error: rlsErr.message } : rls,
    policies: polErr ? { error: polErr.message } : policies,
    columns: colErr ? { error: colErr.message } : columns,
  });
});

// GET /debug/auth — verifica clientes de Supabase.
rutasDebug.get('/auth', async (c) => {
  const admin = getAdminClient();
  const { error } = await admin.from('organizations').select('id', { head: true, count: 'exact' });
  return c.json({
    url: process.env.SUPABASE_URL ? 'EXISTE' : 'FALTA',
    service_role: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'EXISTE' : 'FALTA',
    consulta_admin: error ? `ERROR: ${error.message}` : 'OK',
  });
});
