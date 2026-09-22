import { Hono } from 'hono';
import { createHash } from 'crypto';
import { zSolicitudOwner } from '@erp/shared';
import { getAdminClient } from '../lib/supabase/admin';
import { crearLimitador, ipDeRequest } from '../lib/rate-limit';
import { captureErrorServer } from '../lib/captura-errores';

// Único endpoint público de la plataforma: el formulario de acceso de
// owners. Corre con service role + rate limit por IP y nunca revela si
// un correo ya solicitó acceso.

export const rutasPlataformaPublica = new Hono();

const limitadorSolicitud = crearLimitador({ ventanaMs: 60 * 60_000, max: 5 });

function hashIp(ip: string): string {
  const salt =
    process.env.PLATFORM_IP_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

const MENSAJE_OK =
  'Recibimos tu solicitud. Revisaremos tu perfil y te contactaremos por correo.';

// POST /plataforma/solicitudes — alta pública de una solicitud de owner.
rutasPlataformaPublica.post('/solicitudes', async (c) => {
  const ip = ipDeRequest(c);
  if (!limitadorSolicitud.permitido(ip)) {
    return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, 429);
  }

  const body = zSolicitudOwner.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);

  // Honeypot: respuesta de éxito falsa sin tocar la base.
  if (body.data.website) return c.json({ ok: true, mensaje: MENSAJE_OK });

  const email = body.data.email.toLowerCase();
  const admin = getAdminClient();

  const { data: existente, error: busquedaErr } = await admin
    .from('owner_applications')
    .select('id')
    .eq('email', email)
    .in('estado', ['pendiente', 'en_revision', 'invitada'])
    .maybeSingle();
  if (busquedaErr) {
    void captureErrorServer({
      source: 'server',
      message: `Fallo consultando solicitud existente: ${busquedaErr.message}`,
      route: '/plataforma/solicitudes',
      method: 'POST',
    });
    return c.json({ error: 'No se pudo registrar la solicitud' }, 500);
  }
  // Sin filtración de duplicados: misma respuesta que un alta nueva.
  if (existente) return c.json({ ok: true, mensaje: MENSAJE_OK });

  const { error } = await admin.from('owner_applications').insert({
    nombre_contacto: body.data.nombre_contacto,
    email,
    telefono: body.data.telefono,
    empresa: body.data.empresa,
    sitio_web: body.data.sitio_web,
    pais: body.data.pais,
    sector: body.data.sector,
    tamano_equipo: body.data.tamano_equipo ?? null,
    motivacion: body.data.motivacion,
    referido_por: body.data.referido_por,
    consentimiento_at: new Date().toISOString(),
    ip_hash: hashIp(ip),
  });
  if (error) {
    void captureErrorServer({
      source: 'server',
      message: `Fallo guardando solicitud de owner: ${error.message}`,
      route: '/plataforma/solicitudes',
      method: 'POST',
    });
    return c.json({ error: 'No se pudo registrar la solicitud' }, 500);
  }

  return c.json({ ok: true, mensaje: MENSAJE_OK }, 201);
});
