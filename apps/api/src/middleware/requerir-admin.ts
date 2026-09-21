import { createMiddleware } from 'hono/factory';
import type { ContextoUsuario } from './verificar-jwt';

// Guard de administrador: exige rol admin en el perfil.
export const requerirAdmin = createMiddleware<{
  Variables: { usuario: ContextoUsuario };
}>(async (c, next) => {
  const usuario = c.get('usuario');
  if (!usuario.perfil || usuario.perfil.role !== 'admin') {
    return c.json({ error: 'Se requieren permisos de administrador' }, 403);
  }
  await next();
});