import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { etag } from 'hono/etag';
import { rutasAuth } from './rutas/auth';
import { rutasInvitaciones } from './rutas/invitaciones';
import { rutasOrganizacion } from './rutas/organizacion';
import { rutasTelegram } from './rutas/telegram';
import { rutasMiembros } from './rutas/miembros';
import { rutasStorage } from './rutas/storage';
import { rutasErrores } from './rutas/errores';
import { rutasDebug } from './rutas/debug';
import { rutasEntidades } from './rutas/entidades';
import { rutasTareas } from './rutas/tareas';
import { rutasDocumentos } from './rutas/documentos';
import { rutasMapas } from './rutas/mapas';
import { rutasTodos } from './rutas/todos';
import { rutasCalendario } from './rutas/calendario';
import { rutasHorarios } from './rutas/horarios';
import { rutasPerfil } from './rutas/perfil';
import { rutasColaboradores } from './rutas/colaboradores';
import { rutasAuditoria } from './rutas/auditoria';
import { rutasNotificaciones } from './rutas/notificaciones';
import { rutasCron } from './rutas/cron';
import { rutasFormularios } from './rutas/formularios';
import { rutasFormulariosPublicos } from './rutas/formularios-publicos';
import { captureErrorServer } from './lib/captura-errores';
import { conRequestId, logApi, logsActivos, siguienteId } from './lib/log';

const comprimirRespuestas = compress();
const etiquetarRespuestas = etag();

export function crearApp(webOrigin: string) {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: webOrigin,
      allowHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    })
  );

  // Respuestas GET revalidables por ETag (304 sin body) y nunca cacheadas a
  // ciegas: `private, no-cache` obliga a revalidar, y como cada respuesta ya
  // viene filtrada por RLS el validador es específico del usuario.
  app.use('*', async (c, next) => {
    await next();
    if (c.req.method !== 'GET' || c.req.path === '/cws') return;
    if (c.res.ok || c.res.status === 304) {
      c.header('Cache-Control', 'private, no-cache');
    }
  });

  // Orden: compress() registrado antes que etag() para que el ETag se
  // calcule sobre el body sin comprimir y el 304 salga liviano.
  app.use('*', async (c, next) => (c.req.path === '/cws' ? next() : comprimirRespuestas(c, next)));
  app.use('*', async (c, next) => (c.req.path === '/cws' ? next() : etiquetarRespuestas(c, next)));

  // Traza de flujo (dev): cada request recibe un id y las llamadas a
  // Supabase que provoca se prefijan con el mismo id (lib/log.ts).
  app.use('*', async (c, next) => {
    if (!logsActivos() || c.req.path === '/cws') {
      await next();
      return;
    }
    const id = siguienteId();
    const inicio = Date.now();
    await conRequestId(id, async () => {
      logApi(`← ${c.req.method} ${c.req.path}`);
      try {
        await next();
      } finally {
        let estado: number | string = '?';
        try {
          estado = c.res.status;
        } catch {
          // respuesta no disponible (error antes de construirla)
        }
        logApi(`→ ${estado} ${Date.now() - inicio}ms`);
      }
    });
  });

  app.get('/salud', (c) =>
    c.json({ estado: 'ok', servicio: 'erp-empresarial-api', version: '0.1.0' })
  );

  app.route('/auth', rutasAuth);
  app.route('/invitaciones', rutasInvitaciones);
  app.route('/organizacion', rutasOrganizacion);
  app.route('/telegram', rutasTelegram);
  app.route('/miembros', rutasMiembros);
  app.route('/storage', rutasStorage);
  app.route('/errores', rutasErrores);
  app.route('/debug', rutasDebug);
  app.route('/entidades', rutasEntidades);
  app.route('/tareas', rutasTareas);
  app.route('/documentos', rutasDocumentos);
  app.route('/mapas', rutasMapas);
  app.route('/todos', rutasTodos);
  app.route('/calendario', rutasCalendario);
  app.route('/horarios', rutasHorarios);
  app.route('/perfil', rutasPerfil);
  app.route('/colaboradores', rutasColaboradores);
  app.route('/auditoria', rutasAuditoria);
  app.route('/notificaciones', rutasNotificaciones);
  app.route('/formularios', rutasFormularios);
  app.route('/publico/formularios', rutasFormulariosPublicos);
  app.route('/cron', rutasCron);

  app.notFound((c) => c.json({ error: 'No encontrado' }, 404));

  app.onError((err, c) => {
    console.error('[error]', err);
    void captureErrorServer({
      source: 'server',
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error ? err.stack : undefined,
      route: c.req.path,
      method: c.req.method,
    });
    return c.json({ error: 'Error interno del servidor' }, 500);
  });

  return app;
}