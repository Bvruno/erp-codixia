import { Hono } from 'hono';
import { verificarJwtMiddleware, type ContextoUsuario } from '../../middleware/verificar-jwt';
import { requerirPlataforma } from '../../middleware/requerir-plataforma';
import { rutasSolicitudes } from './solicitudes';
import { rutasEmpresas } from './empresas';
import { rutasAdmins } from './admins';
import { rutasFacturacion } from './facturacion';
import { rutasEstadisticas } from './estadisticas';
import { rutasAuditoria } from './auditoria';
import { rutasTelegram } from './telegram';

// Panel de la plataforma. Todo exige JWT + fila en platform_admins;
// el formulario público vive en rutas/plataforma-publica.ts.
export const rutasPlataforma = new Hono<{
  Variables: { usuario: ContextoUsuario };
}>();

rutasPlataforma.use('/*', verificarJwtMiddleware, requerirPlataforma);

rutasPlataforma.route('/solicitudes', rutasSolicitudes);
rutasPlataforma.route('/empresas', rutasEmpresas);
rutasPlataforma.route('/admins', rutasAdmins);
rutasPlataforma.route('/estadisticas', rutasEstadisticas);
rutasPlataforma.route('/auditoria', rutasAuditoria);
rutasPlataforma.route('/telegram', rutasTelegram);
rutasPlataforma.route('/', rutasFacturacion);
