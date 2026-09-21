import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  AJUSTES_FORMULARIO_DEFAULT,
  evaluarAccesoFormulario,
  hashInviteToken,
  mensajeAcceso,
  normalizarIdentificador,
  sanearRespuestas,
  validarRespuestas,
  zAjustesFormulario,
  zRespuestasFormulario,
  zEsquemaFormulario,
} from '@erp/shared';
import type {
  AjustesFormulario,
  EntradaLista,
  FormularioPublico,
  FormularioEsquema,
} from '@erp/shared';
import { getAdminClient } from '../lib/supabase/admin';
import { crearLimitador, ipDeRequest } from '../lib/rate-limit';
import { captureErrorServer } from '../lib/captura-errores';

// Canal externo (clientes sin cuenta). Todo corre con service role y
// valida contra el token pÃºblico o el token personal del invitado; el
// SPA nunca decide acceso.

export const rutasFormulariosPublicos = new Hono();

const CAMPOS_PUBLICOS = 'id, name, description, estado, esquema, ajustes';

type FilaFormulario = {
  id: string;
  name: string;
  description: string | null;
  estado: 'borrador' | 'publicado' | 'cerrado';
  esquema: FormularioEsquema;
  ajustes: AjustesFormulario;
};

const limitadorLectura = crearLimitador({ ventanaMs: 60_000, max: 60 });
const limitadorEnvio = crearLimitador({ ventanaMs: 60_000, max: 10 });
const limitadorIdentificacion = crearLimitador({ ventanaMs: 60_000, max: 15 });

function ajustesDe(fila: { ajustes: unknown }): AjustesFormulario {
  const parsed = zAjustesFormulario.safeParse(fila.ajustes);
  return parsed.success ? parsed.data : { ...AJUSTES_FORMULARIO_DEFAULT };
}

function esquemaDe(fila: { esquema: unknown }): FormularioEsquema {
  const parsed = zEsquemaFormulario.safeParse(fila.esquema);
  return parsed.success ? parsed.data : { version: 1, secciones: [] };
}

function aPublico(fila: FilaFormulario): FormularioPublico {
  const ajustes = ajustesDe(fila);
  return {
    id: fila.id,
    nombre: fila.name,
    descripcion: fila.description,
    esquema: esquemaDe(fila),
    modo_acceso: ajustes.modo_acceso,
    identificadores: ajustes.identificadores,
    requiere_consentimiento: ajustes.requiere_consentimiento,
    texto_privacidad: ajustes.texto_privacidad,
    mensaje_confirmacion: ajustes.mensaje_confirmacion,
  };
}

async function resolverPorToken(token: string): Promise<FilaFormulario | null> {
  const { data } = await getAdminClient()
    .from('formularios')
    .select(CAMPOS_PUBLICOS)
    .eq('token_publico_hash', await hashInviteToken(token))
    .maybeSingle();
  return (data as FilaFormulario | null) ?? null;
}

/** Candidato a cÃ³digo: Ãºltimo segmento de <nombre>-<codigo6>. */
function candidatoCodigo(credencial: string): string | null {
  const idx = credencial.lastIndexOf('-');
  const candidato = (idx >= 0 ? credencial.slice(idx + 1) : credencial).toLowerCase();
  return /^[a-z0-9]{6}$/.test(candidato) ? candidato : null;
}

/**
 * Resuelve la credencial del link: primero el cÃ³digo corto (link nuevo
 * /f/<nombre>-<codigo>), luego el token largo (links ya compartidos).
 */
async function resolverCredencial(credencial: string): Promise<FilaFormulario | null> {
  const candidato = candidatoCodigo(credencial);
  if (candidato) {
    const { data } = await getAdminClient()
      .from('formularios')
      .select(CAMPOS_PUBLICOS)
      .eq('codigo_publico', candidato)
      .maybeSingle();
    if (data) return data as FilaFormulario;
  }
  return resolverPorToken(credencial);
}

type FilaInvitado = {
  id: string;
  formulario_id: string;
  nombre: string;
  estado: 'pendiente' | 'respondido' | 'revocado';
};

async function resolverInvitado(token: string): Promise<FilaInvitado | null> {
  const { data } = await getAdminClient()
    .from('formulario_invitados')
    .select('id, formulario_id, nombre, estado')
    .eq('token_hash', await hashInviteToken(token))
    .maybeSingle();
  return (data as FilaInvitado | null) ?? null;
}

/** Igual que la credencial pÃºblica: cÃ³digo corto primero, token despuÃ©s. */
async function resolverInvitadoCredencial(credencial: string): Promise<FilaInvitado | null> {
  const candidato = candidatoCodigo(credencial);
  if (candidato) {
    const { data } = await getAdminClient()
      .from('formulario_invitados')
      .select('id, formulario_id, nombre, estado')
      .eq('codigo', candidato)
      .maybeSingle();
    if (data) return data as FilaInvitado;
  }
  return resolverInvitado(credencial);
}

async function formularioPorId(id: string): Promise<FilaFormulario | null> {
  const { data } = await getAdminClient()
    .from('formularios')
    .select(CAMPOS_PUBLICOS)
    .eq('id', id)
    .maybeSingle();
  return (data as FilaFormulario | null) ?? null;
}

async function cargarListas(formularioId: string): Promise<EntradaLista[]> {
  const { data } = await getAdminClient()
    .from('formulario_listas')
    .select('tipo, valor')
    .eq('formulario_id', formularioId)
    .limit(1000);
  return (data ?? []) as EntradaLista[];
}

async function yaRespondio(
  formularioId: string,
  ajustes: AjustesFormulario,
  identificador: EntradaLista | null
): Promise<boolean> {
  if (!ajustes.una_respuesta_por_persona || !identificador) return false;
  const hash = await hashInviteToken(
    normalizarIdentificador(identificador.tipo, identificador.valor)
  );
  const { data } = await getAdminClient()
    .from('formulario_respuestas')
    .select('id')
    .eq('formulario_id', formularioId)
    .eq('identificador_hash', hash)
    .maybeSingle();
  return Boolean(data);
}

function noDisponible(c: Context) {
  return c.json({ error: mensajeAcceso('no_publicado'), motivo: 'no_publicado' }, 410);
}

// ---- enlace pÃºblico ----

// GET /publico/formularios/:token â€” definiciÃ³n pÃºblica.
rutasFormulariosPublicos.get('/:token', async (c) => {
  const ip = ipDeRequest(c);
  if (!limitadorLectura.permitido(ip)) return c.json({ error: 'Demasiadas solicitudes' }, 429);

  const form = await resolverCredencial(c.req.param('token'));
  if (!form) return c.json({ error: 'Formulario no encontrado' }, 404);
  if (form.estado !== 'publicado') return noDisponible(c);
  return c.json({ formulario: aPublico(form) });
});

const esquemaIdentificar = z.object({
  tipo: z.enum(['dni', 'email']),
  valor: z.string().min(1).max(200),
});

// POST /publico/formularios/:token/identificar â€” valida DNI/correo contra
// la lista blanca/negra sin revelar la lista.
rutasFormulariosPublicos.post('/:token/identificar', async (c) => {
  const ip = ipDeRequest(c);
  if (!limitadorIdentificacion.permitido(`${ip}:${c.req.param('token')}`)) {
    return c.json({ error: 'Demasiadas solicitudes' }, 429);
  }

  const body = esquemaIdentificar.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos invÃ¡lidos' }, 400);

  const form = await resolverCredencial(c.req.param('token'));
  if (!form) return c.json({ error: 'Formulario no encontrado' }, 404);
  if (form.estado !== 'publicado') return noDisponible(c);

  const ajustes = ajustesDe(form);
  const identificador = {
    tipo: body.data.tipo,
    valor: normalizarIdentificador(body.data.tipo, body.data.valor),
  };
  const evalRes = evaluarAccesoFormulario(ajustes, {
    estado: form.estado,
    identificador,
    lista: ajustes.modo_acceso === 'lista' ? await cargarListas(form.id) : [],
    yaRespondio: await yaRespondio(form.id, ajustes, identificador),
  });

  return c.json({
    permitido: evalRes.permitido,
    motivo: evalRes.motivo,
    mensaje: mensajeAcceso(evalRes.motivo),
  });
});

const esquemaRespuesta = z.object({
  identificador: esquemaIdentificar.nullable().optional(),
  consentimiento: z.boolean().optional(),
  respuestas: zRespuestasFormulario,
  /** Honeypot anti-bots: si viene con valor, se ignora el envío. */
  website: z.string().max(200).optional(),
});

// POST /publico/formularios/:token/respuestas â€” revalida todo en servidor.
rutasFormulariosPublicos.post('/:token/respuestas', async (c) => {
  const ip = ipDeRequest(c);
  if (!limitadorEnvio.permitido(`${ip}:${c.req.param('token')}`)) {
    return c.json({ error: 'Demasiadas solicitudes' }, 429);
  }

  const body = esquemaRespuesta.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos invÃ¡lidos' }, 400);

  const form = await resolverCredencial(c.req.param('token'));
  if (!form) return c.json({ error: 'Formulario no encontrado' }, 404);
  if (form.estado !== 'publicado') return noDisponible(c);

  const ajustes = ajustesDe(form);

  // Bot: respuesta falsa sin tocar la base de datos.
  if (body.data.website) {
    return c.json({ ok: true, mensaje: ajustes.mensaje_confirmacion });
  }

  if (ajustes.requiere_consentimiento && body.data.consentimiento !== true) {
    return c.json({ error: 'Debes aceptar el aviso de privacidad para continuar' }, 400);
  }

  const identificador = body.data.identificador
    ? {
        tipo: body.data.identificador.tipo,
        valor: normalizarIdentificador(
          body.data.identificador.tipo,
          body.data.identificador.valor
        ),
      }
    : null;

  const evalRes = evaluarAccesoFormulario(ajustes, {
    estado: form.estado,
    identificador,
    lista: ajustes.modo_acceso === 'lista' ? await cargarListas(form.id) : [],
    yaRespondio: await yaRespondio(form.id, ajustes, identificador),
  });
  if (!evalRes.permitido) {
    return c.json({ error: mensajeAcceso(evalRes.motivo), motivo: evalRes.motivo }, 403);
  }

  const esquema = esquemaDe(form);
  const respuestasLimpias = sanearRespuestas(esquema, body.data.respuestas);
  const errores = validarRespuestas(esquema, respuestasLimpias);
  if (errores.length > 0) {
    return c.json({ error: 'Respuesta invÃ¡lida', errores }, 400);
  }

  const { error } = await getAdminClient()
    .from('formulario_respuestas')
    .insert({
      formulario_id: form.id,
      identificador_hash: identificador
        ? await hashInviteToken(
            normalizarIdentificador(identificador.tipo, identificador.valor)
          )
        : null,
      consentimiento: body.data.consentimiento === true,
      respuestas: respuestasLimpias,
    });
  if (error) {
    void captureErrorServer({
      source: 'server',
      message: `Fallo guardando respuesta pÃºblica: ${error.message}`,
      route: `/publico/formularios/${c.req.param('token')}/respuestas`,
      method: 'POST',
    });
    return c.json({ error: 'No se pudo guardar la respuesta' }, 500);
  }

  return c.json({ ok: true, mensaje: ajustes.mensaje_confirmacion });
});

// ---- enlace personal ----

// GET /publico/formularios/invitado/:token â€” datos del invitado + form.
rutasFormulariosPublicos.get('/invitado/:token', async (c) => {
  const ip = ipDeRequest(c);
  if (!limitadorLectura.permitido(ip)) return c.json({ error: 'Demasiadas solicitudes' }, 429);

  const invitado = await resolverInvitadoCredencial(c.req.param('token'));
  if (!invitado) return c.json({ error: 'InvitaciÃ³n no encontrada' }, 404);

  const form = await formularioPorId(invitado.formulario_id);
  if (!form) return c.json({ error: 'Formulario no encontrado' }, 404);
  if (form.estado !== 'publicado') return noDisponible(c);

  return c.json({
    formulario: aPublico(form),
    invitado: {
      nombre: invitado.nombre,
      ya_respondio: invitado.estado === 'respondido',
      estado: invitado.estado,
    },
  });
});

const esquemaRespuestaInvitado = z.object({
  consentimiento: z.boolean().optional(),
  respuestas: zRespuestasFormulario,
  website: z.string().max(200).optional(),
});

// POST /publico/formularios/invitado/:token/respuestas
rutasFormulariosPublicos.post('/invitado/:token/respuestas', async (c) => {
  const ip = ipDeRequest(c);
  if (!limitadorEnvio.permitido(`${ip}:${c.req.param('token')}`)) {
    return c.json({ error: 'Demasiadas solicitudes' }, 429);
  }

  const body = esquemaRespuestaInvitado.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos invÃ¡lidos' }, 400);

  const invitado = await resolverInvitadoCredencial(c.req.param('token'));
  if (!invitado) return c.json({ error: 'InvitaciÃ³n no encontrada' }, 404);

  const form = await formularioPorId(invitado.formulario_id);
  if (!form) return c.json({ error: 'Formulario no encontrado' }, 404);
  if (form.estado !== 'publicado') return noDisponible(c);

  const ajustes = ajustesDe(form);

  if (body.data.website) {
    return c.json({ ok: true, mensaje: ajustes.mensaje_confirmacion });
  }

  const evalRes = evaluarAccesoFormulario(ajustes, {
    estado: form.estado,
    invitado: { estado: invitado.estado },
  });
  if (!evalRes.permitido) {
    return c.json({ error: mensajeAcceso(evalRes.motivo), motivo: evalRes.motivo }, 403);
  }

  if (ajustes.requiere_consentimiento && body.data.consentimiento !== true) {
    return c.json({ error: 'Debes aceptar el aviso de privacidad para continuar' }, 400);
  }

  const esquemaInvitado = esquemaDe(form);
  const respuestasLimpias = sanearRespuestas(esquemaInvitado, body.data.respuestas);
  const errores = validarRespuestas(esquemaInvitado, respuestasLimpias);
  if (errores.length > 0) {
    return c.json({ error: 'Respuesta invÃ¡lida', errores }, 400);
  }

  const admin = getAdminClient();
  const { error } = await admin.from('formulario_respuestas').insert({
    formulario_id: form.id,
    invitado_id: invitado.id,
    consentimiento: body.data.consentimiento === true,
    respuestas: respuestasLimpias,
  });
  if (error) {
    if (error.code === '23505') {
      return c.json({ error: mensajeAcceso('ya_respondio'), motivo: 'ya_respondio' }, 409);
    }
    void captureErrorServer({
      source: 'server',
      message: `Fallo guardando respuesta de invitado: ${error.message}`,
      route: `/publico/formularios/invitado/${c.req.param('token')}/respuestas`,
      method: 'POST',
    });
    return c.json({ error: 'No se pudo guardar la respuesta' }, 500);
  }

  await admin
    .from('formulario_invitados')
    .update({ estado: 'respondido', respondido_at: new Date().toISOString() })
    .eq('id', invitado.id);

  return c.json({ ok: true, mensaje: ajustes.mensaje_confirmacion });
});
