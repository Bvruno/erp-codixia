import type { ContextoUsuario } from '../middleware/verificar-jwt';
import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { getAdminClient } from '../lib/supabase/admin';
import { verificarJwtMiddleware } from '../middleware/verificar-jwt';
import { captureErrorServer } from '../lib/captura-errores';

export const rutasStorage = new Hono<{ Variables: { usuario: ContextoUsuario } }>();

rutasStorage.use('/*', verificarJwtMiddleware);

// POST /storage/mindmap-imagenes — sube imagen de mapa mental.
// Multipart: campo "archivo". La ruta se organiza por org.
// Devuelve la URL pública del objeto.
rutasStorage.post('/mindmap-imagenes', async (c) => {
  const usuario = c.get('usuario');
  const orgId = usuario.perfil?.organization_id;
  if (!orgId) return c.json({ error: 'Sin organización' }, 403);

  const form = await c.req.formData();
  const archivo = form.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return c.json({ error: 'Archivo requerido' }, 400);
  }

  const nombre = `${orgId}/${randomUUID()}-${archivo.name.replace(/[^\w.-]/g, '_')}`;
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  const { error } = await getAdminClient().storage
    .from('mindmap-images')
    .upload(nombre, bytes, { contentType: archivo.type });

  if (error) {
    void captureErrorServer({
      source: 'server',
      message: 'Fallo subiendo imagen de mindmap',
      route: '/storage/mindmap-imagenes',
      method: 'POST',
      userId: usuario.id,
      organizationId: orgId,
      context: { detalle: error.message },
    });
    return c.json({ error: 'No se pudo subir la imagen' }, 500);
  }

  const { data } = getAdminClient().storage.from('mindmap-images').getPublicUrl(nombre);
  return c.json({ url: data.publicUrl });
});

