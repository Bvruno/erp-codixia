import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { hashInviteToken, zAjustesFormulario, zEsquemaFormulario, normalizarIdentificador, validarEsquemaLogica } from '@erp/shared';
import { clienteUsuarioMiddleware, type VariablesDatos } from '../lib/supabase/usuario';
import { getAdminClient } from '../lib/supabase/admin';
import { mapearError } from './entidades';

export const rutasFormularios = new Hono<{ Variables: VariablesDatos }>();

rutasFormularios.use('/*', clienteUsuarioMiddleware);

const CAMPOS_FORMULARIO =
  'id, organization_id, workspace_id, folder_id, name, description, visibility, estado, position, esquema, ajustes, publicado_at, created_by, created_at, updated_at';

function nuevoToken(): string {
  return randomBytes(32).toString('base64url');
}

const ALFABETO_CODIGO = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Código corto (6 alfanumérico) que resuelve el link público. */
function nuevoCodigo(): string {
  const bytes = randomBytes(6);
  let codigo = '';
  for (let i = 0; i < 6; i += 1) {
    codigo += ALFABETO_CODIGO[bytes[i] % ALFABETO_CODIGO.length];
  }
  return codigo;
}

// GET /formularios/:id — definición completa (RLS decide visibilidad).
rutasFormularios.get('/:id', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase
    .from('formularios')
    .select(CAMPOS_FORMULARIO)
    .eq('id', c.req.param('id'))
    .maybeSingle();
  if (error) return mapearError(c, error, 'Formulario no encontrado');
  if (!data) return c.json({ error: 'Formulario no encontrado' }, 404);
  return c.json({ formulario: data });
});

const esquemaPatch = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  esquema: zEsquemaFormulario.optional(),
  ajustes: zAjustesFormulario.optional(),
});

// PUT /formularios/:id — autosave del editor (nombre, esquema, ajustes).
rutasFormularios.put('/:id', async (c) => {
  const body = esquemaPatch.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  if (Object.keys(body.data).length === 0) return c.json({ success: true });

  if (body.data.esquema) {
    const erroresLogica = validarEsquemaLogica(body.data.esquema);
    if (erroresLogica.length > 0) {
      return c.json({ error: 'La lógica condicional tiene errores', errores: erroresLogica }, 400);
    }
  }

  const supabase = c.get('supabase');
  const { error } = await supabase
    .from('formularios')
    .update(body.data)
    .eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo guardar el formulario');
  return c.json({ success: true });
});

// POST /formularios/:id/publicar — exige esquema con al menos una pregunta
// y genera el token público (el crudo solo viaja en la respuesta).
rutasFormularios.post('/:id/publicar', async (c) => {
  const supabase = c.get('supabase');
  const { data: form, error } = await supabase
    .from('formularios')
    .select('id, esquema')
    .eq('id', c.req.param('id'))
    .maybeSingle();
  if (error) return mapearError(c, error, 'Formulario no encontrado');
  if (!form) return c.json({ error: 'Formulario no encontrado' }, 404);

  const preguntas = (form.esquema?.secciones ?? []).reduce(
    (sum: number, s: { preguntas?: unknown[] }) => sum + (s.preguntas?.length ?? 0),
    0
  );
  if (preguntas === 0) {
    return c.json({ error: 'Agrega al menos una pregunta antes de publicar' }, 400);
  }

  const erroresLogica = validarEsquemaLogica(form.esquema);
  if (erroresLogica.length > 0) {
    return c.json({ error: 'La lógica condicional tiene errores', errores: erroresLogica }, 400);
  }

  const token = nuevoToken();
  const tokenHash = await hashInviteToken(token);
  const publicadoAt = new Date().toISOString();

  let codigo = '';
  for (let intento = 0; intento < 5; intento += 1) {
    codigo = nuevoCodigo();
    const { error: saveError } = await supabase
      .from('formularios')
      .update({
        estado: 'publicado',
        token_publico_hash: tokenHash,
        codigo_publico: codigo,
        publicado_at: publicadoAt,
      })
      .eq('id', form.id);
    if (!saveError) return c.json({ token, codigo });
    if (saveError.code !== '23505') {
      return mapearError(c, saveError, 'No se pudo publicar el formulario');
    }
  }
  return c.json({ error: 'No se pudo generar el código del enlace' }, 500);
});

// POST /formularios/:id/cerrar — deja de aceptar respuestas.
rutasFormularios.post('/:id/cerrar', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase
    .from('formularios')
    .update({ estado: 'cerrado' })
    .eq('id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo cerrar el formulario');
  return c.json({ success: true });
});

// POST /formularios/:id/token/rotar — invalida el link anterior.
rutasFormularios.post('/:id/token/rotar', async (c) => {
  const token = nuevoToken();
  const tokenHash = await hashInviteToken(token);
  const supabase = c.get('supabase');
  for (let intento = 0; intento < 5; intento += 1) {
    const codigo = nuevoCodigo();
    const { error } = await supabase
      .from('formularios')
      .update({ token_publico_hash: tokenHash, codigo_publico: codigo })
      .eq('id', c.req.param('id'));
    if (!error) return c.json({ token, codigo });
    if (error.code !== '23505') {
      return mapearError(c, error, 'No se pudo rotar el enlace');
    }
  }
  return c.json({ error: 'No se pudo generar el código del enlace' }, 500);
});

// GET /formularios/:id/respuestas — respuestas con nombre de invitado
// (los nombres requieren manage; un writer ve la respuesta sin nombre).
rutasFormularios.get('/:id/respuestas', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase
    .from('formulario_respuestas')
    .select('*')
    .eq('formulario_id', c.req.param('id'))
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return mapearError(c, error, 'No se pudieron cargar las respuestas');

  const respuestas = data ?? [];
  const invitadoIds = [...new Set(respuestas.map((r) => r.invitado_id).filter(Boolean))] as string[];
  let nombres: Record<string, string> = {};
  if (invitadoIds.length > 0) {
    const { data: invitados } = await getAdminClient()
      .from('formulario_invitados')
      .select('id, nombre')
      .in('id', invitadoIds);
    nombres = Object.fromEntries((invitados ?? []).map((i) => [i.id, i.nombre]));
  }

  return c.json({
    respuestas: respuestas.map((r) => ({
      ...r,
      invitado_nombre: r.invitado_id ? nombres[r.invitado_id] ?? null : null,
    })),
  });
});

// DELETE /formularios/:id/respuestas/:rid
rutasFormularios.delete('/:id/respuestas/:rid', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase
    .from('formulario_respuestas')
    .delete()
    .eq('id', c.req.param('rid'))
    .eq('formulario_id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo eliminar la respuesta');
  return c.json({ success: true });
});

// ---- listas blancas/negras ----

const esquemaLista = z.object({
  entradas: z
    .array(
      z.object({
        tipo: z.enum(['dni', 'email']),
        valor: z.string().min(1).max(200),
        etiqueta: z.string().max(200).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

// GET /formularios/:id/listas
rutasFormularios.get('/:id/listas', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase
    .from('formulario_listas')
    .select('*')
    .eq('formulario_id', c.req.param('id'))
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) return mapearError(c, error, 'No se pudo cargar la lista');
  return c.json({ listas: data ?? [] });
});

// POST /formularios/:id/listas — agrega identificadores normalizados.
rutasFormularios.post('/:id/listas', async (c) => {
  const body = esquemaLista.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const supabase = c.get('supabase');
  const formularioId = c.req.param('id');
  const filas = body.data.entradas.map((e) => ({
    formulario_id: formularioId,
    tipo: e.tipo,
    valor: normalizarIdentificador(e.tipo, e.valor),
    etiqueta: e.etiqueta ?? null,
  }));
  const { error } = await supabase
    .from('formulario_listas')
    .upsert(filas, { onConflict: 'formulario_id,tipo,valor', ignoreDuplicates: true });
  if (error) return mapearError(c, error, 'No se pudo agregar a la lista');
  return c.json({ success: true, agregados: filas.length });
});

// DELETE /formularios/:id/listas/:listaId
rutasFormularios.delete('/:id/listas/:listaId', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase
    .from('formulario_listas')
    .delete()
    .eq('id', c.req.param('listaId'))
    .eq('formulario_id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo eliminar de la lista');
  return c.json({ success: true });
});

// ---- invitados (links personales) ----

const esquemaInvitados = z.object({
  invitados: z
    .array(
      z.object({
        nombre: z.string().min(1).max(200),
        tipo: z.enum(['dni', 'email']).nullable().optional(),
        valor: z.string().max(200).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

// GET /formularios/:id/invitados
rutasFormularios.get('/:id/invitados', async (c) => {
  const supabase = c.get('supabase');
  const { data, error } = await supabase
    .from('formulario_invitados')
    .select('id, formulario_id, nombre, tipo, valor, estado, respondido_at, created_at')
    .eq('formulario_id', c.req.param('id'))
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) return mapearError(c, error, 'No se pudieron cargar los invitados');
  return c.json({ invitados: data ?? [] });
});

// POST /formularios/:id/invitados — genera un código personal por
// persona (link /f/i/<nombre>-<codigo>); el token largo queda como hash
// heredado por compatibilidad.
rutasFormularios.post('/:id/invitados', async (c) => {
  const body = esquemaInvitados.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Datos inválidos' }, 400);
  const supabase = c.get('supabase');
  const formularioId = c.req.param('id');

  for (let intento = 0; intento < 5; intento += 1) {
    const filas = await Promise.all(
      body.data.invitados.map(async (i) => {
        const token = nuevoToken();
        return {
          formulario_id: formularioId,
          nombre: i.nombre,
          tipo: i.tipo ?? null,
          valor: i.valor ? normalizarIdentificador(i.tipo ?? 'email', i.valor) : null,
          token_hash: await hashInviteToken(token),
          codigo: nuevoCodigo(),
        };
      })
    );

    const { data, error } = await supabase
      .from('formulario_invitados')
      .insert(filas)
      .select('id, nombre, estado, codigo');
    if (!error) {
      return c.json({ invitados: data ?? [] });
    }
    if (error.code !== '23505') {
      return mapearError(c, error, 'No se pudieron crear los invitados');
    }
  }
  return c.json({ error: 'No se pudieron generar los códigos personales' }, 500);
});

// POST /formularios/:id/invitados/:invitadoId/revocar
rutasFormularios.post('/:id/invitados/:invitadoId/revocar', async (c) => {
  const supabase = c.get('supabase');
  const { error } = await supabase
    .from('formulario_invitados')
    .update({ estado: 'revocado' })
    .eq('id', c.req.param('invitadoId'))
    .eq('formulario_id', c.req.param('id'));
  if (error) return mapearError(c, error, 'No se pudo revocar la invitación');
  return c.json({ success: true });
});
