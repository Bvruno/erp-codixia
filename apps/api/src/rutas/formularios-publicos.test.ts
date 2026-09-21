import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app';
import type { AjustesFormulario } from '@erp/shared';
import { AJUSTES_FORMULARIO_DEFAULT } from '@erp/shared';

const estado = vi.hoisted(() => ({
  form: null as Record<string, unknown> | null,
  invitado: null as { id: string; formulario_id: string; nombre: string; estado: string } | null,
  listas: [] as { tipo: string; valor: string }[],
  respuestaExistente: null as { id: string } | null,
  insertError: null as { code?: string; message: string } | null,
  inserts: [] as Record<string, unknown>[],
  updatesInvitado: [] as { valores: Record<string, unknown>; id: string }[],
}));

vi.mock('../lib/captura-errores', () => ({
  captureErrorServer: vi.fn(async () => undefined),
}));

function builder(resultado: unknown) {
  const promesa = Promise.resolve(resultado);
  const b: Record<string, unknown> = {
    eq: () => b,
    in: () => b,
    limit: () => promesa,
    maybeSingle: () => promesa,
    then: promesa.then.bind(promesa),
  };
  return b;
}

vi.mock('../lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: (tabla: string) => {
      if (tabla === 'formularios') {
        return { select: () => builder({ data: estado.form, error: null }) };
      }
      if (tabla === 'formulario_listas') {
        return { select: () => builder({ data: estado.listas, error: null }) };
      }
      if (tabla === 'formulario_respuestas') {
        return {
          select: () => builder({ data: estado.respuestaExistente, error: null }),
          insert: async (fila: Record<string, unknown>) => {
            estado.inserts.push(fila);
            return { error: estado.insertError };
          },
        };
      }
      if (tabla === 'formulario_invitados') {
        return {
          select: () => builder({ data: estado.invitado, error: null }),
          update: (valores: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              estado.updatesInvitado.push({ valores, id });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    },
  })),
}));

const app = crearApp('http://web');

const ESQUEMA = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'General',
      preguntas: [
        { id: 'q1', tipo: 'texto_corto', titulo: 'Nombre', requerida: true },
      ],
    },
  ],
};

function formBase(overrides: Partial<Record<string, unknown>> = {}, ajustes: Partial<AjustesFormulario> = {}) {
  return {
    id: 'form-1',
    name: 'Encuesta demo',
    description: null,
    estado: 'publicado',
    esquema: ESQUEMA,
    ajustes: { ...AJUSTES_FORMULARIO_DEFAULT, ...ajustes },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.form = formBase();
  estado.invitado = null;
  estado.listas = [];
  estado.respuestaExistente = null;
  estado.insertError = null;
  estado.inserts = [];
  estado.updatesInvitado = [];
});

describe('GET /publico/formularios/:token', () => {
  it('404 si el token no existe', async () => {
    estado.form = null;
    const res = await app.request('/publico/formularios/tok-a');
    expect(res.status).toBe(404);
  });

  it('410 si el formulario no está publicado', async () => {
    estado.form = formBase({ estado: 'cerrado' });
    const res = await app.request('/publico/formularios/tok-b');
    expect(res.status).toBe(410);
  });

  it('devuelve solo campos públicos', async () => {
    const res = await app.request('/publico/formularios/tok-c');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { formulario: Record<string, unknown> };
    expect(json.formulario).toMatchObject({
      id: 'form-1',
      nombre: 'Encuesta demo',
      modo_acceso: 'publico',
    });
    expect(json.formulario).not.toHaveProperty('token_publico_hash');
    expect(json.formulario).not.toHaveProperty('ajustes');
  });
});

describe('POST /publico/formularios/:token/identificar', () => {
  it('en modo público permite sin identificador', async () => {
    const res = await app.request('/publico/formularios/tok-d/identificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', valor: 'x@y.co' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ permitido: true, motivo: 'ok' });
  });

  it('lista blanca rechaza a quien no está listado', async () => {
    estado.form = formBase({}, { modo_acceso: 'lista', lista_modo: 'blanca' });
    estado.listas = [{ tipo: 'email', valor: 'cliente@x.com' }];
    const res = await app.request('/publico/formularios/tok-e/identificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', valor: 'otro@x.com' }),
    });
    expect(await res.json()).toMatchObject({ permitido: false, motivo: 'no_listado' });
  });

  it('lista negra bloquea a quien está listado', async () => {
    estado.form = formBase({}, { modo_acceso: 'lista', lista_modo: 'negra' });
    estado.listas = [{ tipo: 'dni', valor: '12345678' }];
    const res = await app.request('/publico/formularios/tok-f/identificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'dni', valor: '12.345.678' }),
    });
    expect(await res.json()).toMatchObject({ permitido: false, motivo: 'bloqueado' });
  });

  it('una respuesta por persona marca ya_respondio', async () => {
    estado.form = formBase({}, { modo_acceso: 'lista', una_respuesta_por_persona: true });
    estado.listas = [{ tipo: 'email', valor: 'cliente@x.com' }];
    estado.respuestaExistente = { id: 'resp-1' };
    const res = await app.request('/publico/formularios/tok-g/identificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', valor: 'cliente@x.com' }),
    });
    expect(await res.json()).toMatchObject({ permitido: false, motivo: 'ya_respondio' });
  });
});

describe('POST /publico/formularios/:token/respuestas', () => {
  const enviar = (token: string, body: Record<string, unknown>) =>
    app.request(`/publico/formularios/${token}/respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('rechaza respuesta inválida con errores por pregunta', async () => {
    const res = await enviar('tok-h', { respuestas: {} });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { errores: { pregunta_id: string }[] };
    expect(json.errores).toEqual([{ pregunta_id: 'q1', mensaje: 'Esta pregunta es obligatoria' }]);
    expect(estado.inserts).toHaveLength(0);
  });

  it('guarda la respuesta con identificador hasheado (sin PII cruda)', async () => {
    const res = await enviar('tok-i', {
      identificador: { tipo: 'email', valor: 'Cliente@X.com' },
      respuestas: { q1: 'Ana' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(estado.inserts).toHaveLength(1);
    const fila = estado.inserts[0];
    expect(fila.respuestas).toEqual({ q1: 'Ana' });
    expect(typeof fila.identificador_hash).toBe('string');
    expect(JSON.stringify(fila)).not.toContain('Cliente@X.com');
  });

  it('exige consentimiento cuando está configurado', async () => {
    estado.form = formBase({}, { requiere_consentimiento: true });
    const res = await enviar('tok-j', { respuestas: { q1: 'Ana' } });
    expect(res.status).toBe(400);
    expect(estado.inserts).toHaveLength(0);
  });

  it('modo personal rechaza el enlace general', async () => {
    estado.form = formBase({}, { modo_acceso: 'personal' });
    const res = await enviar('tok-k', { respuestas: { q1: 'Ana' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ motivo: 'requiere_invitacion' });
  });

  it('honeypot: responde ok pero no inserta', async () => {
    const res = await enviar('tok-l', { respuestas: { q1: 'Ana' }, website: 'bot' });
    expect(res.status).toBe(200);
    expect(estado.inserts).toHaveLength(0);
  });

  it('acepta identificador null (cliente sin gate) y guarda sin hash', async () => {
    const res = await enviar('tok-null', {
      identificador: null,
      respuestas: { q1: 'Ana' },
    });
    expect(res.status).toBe(200);
    expect(estado.inserts).toHaveLength(1);
    expect(estado.inserts[0].identificador_hash).toBeNull();
  });
});

const ESQUEMA_IF = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'Inicio',
      preguntas: [
        {
          id: 'plan',
          tipo: 'opcion_multiple',
          titulo: 'Plan',
          requerida: true,
          opciones: [
            { id: 'a', etiqueta: 'A' },
            { id: 'b', etiqueta: 'B' },
          ],
        },
        {
          id: 'detalle',
          tipo: 'texto_corto',
          titulo: 'Detalle',
          requerida: true,
          logica: {
            mostrar_si: {
              id: 'r1',
              condiciones: [{ pregunta_id: 'plan', operador: 'igual', valor: 'a' }],
              modo: 'todas',
            },
          },
        },
      ],
      ramas: [
        {
          id: 'ra',
          regla: {
            id: 'r2',
            condiciones: [{ pregunta_id: 'plan', operador: 'igual', valor: 'a' }],
            modo: 'todas',
          },
          destino: 'enviar',
        },
      ],
    },
    {
      id: 's2',
      titulo: 'Solo B',
      preguntas: [{ id: 'extra', tipo: 'texto_corto', titulo: 'Extra', requerida: true }],
    },
  ],
};

describe('POST respuestas con lógica IF', () => {
  const enviar = (token: string, body: Record<string, unknown>) =>
    app.request(`/publico/formularios/${token}/respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    estado.form = formBase({ esquema: ESQUEMA_IF });
  });

  it('exige la pregunta visible y no la oculta', async () => {
    // plan=a muestra detalle (requerida) → falta.
    const res = await enviar('tok-if-a', { respuestas: { plan: 'a' } });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { errores: { pregunta_id: string }[] };
    expect(json.errores.map((e) => e.pregunta_id)).toEqual(['detalle']);
  });

  it('el salto omite secciones intermedias (no exige sus requeridas)', async () => {
    const res = await enviar('tok-if-b', { respuestas: { plan: 'a', detalle: 'ok' } });
    expect(res.status).toBe(200);
    expect(estado.inserts).toHaveLength(1);
  });

  it('descarta respuestas ocultas o de secciones saltadas antes de guardar', async () => {
    const res = await enviar('tok-if-c', {
      respuestas: { plan: 'a', detalle: 'ok', extra: 'no debió viajar' },
    });
    expect(res.status).toBe(200);
    expect(estado.inserts[0].respuestas).toEqual({ plan: 'a', detalle: 'ok' });
  });

  it('sin salto exige la pregunta de la sección siguiente', async () => {
    const res = await enviar('tok-if-d', { respuestas: { plan: 'b' } });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { errores: { pregunta_id: string }[] };
    expect(json.errores.map((e) => e.pregunta_id)).toEqual(['extra']);
  });
});

const ESQUEMA_FANTASMA = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'Inicio',
      preguntas: [
        {
          id: 'q1',
          tipo: 'opcion_multiple',
          titulo: 'Plan',
          requerida: true,
          opciones: [
            { id: 'a', etiqueta: 'A' },
            { id: 'b', etiqueta: 'B' },
          ],
        },
      ],
    },
    {
      id: 's2',
      titulo: 'Detalle',
      preguntas: [
        {
          id: 'q2',
          tipo: 'texto_corto',
          titulo: 'Detalle',
          requerida: true,
          logica: {
            mostrar_si: {
              id: 'r1',
              condiciones: [{ pregunta_id: 'q1', operador: 'igual', valor: 'a' }],
              modo: 'todas',
            },
          },
        },
        {
          id: 'q3',
          tipo: 'texto_corto',
          titulo: 'Comentario',
          requerida: true,
          logica: {
            mostrar_si: {
              id: 'r2',
              condiciones: [{ pregunta_id: 'q2', operador: 'respondida' }],
              modo: 'todas',
            },
          },
        },
      ],
    },
  ],
};

describe('respuestas fantasma en el servidor', () => {
  beforeEach(() => {
    estado.form = formBase({ esquema: ESQUEMA_FANTASMA });
  });

  const enviar = (token: string, body: Record<string, unknown>) =>
    app.request(`/publico/formularios/${token}/respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('no exige ni guarda dependientes de una respuesta oculta', async () => {
    const res = await enviar('tok-fantasma-a', {
      respuestas: { q1: 'b', q2: 'fantasma', q3: 'viejo' },
    });
    expect(res.status).toBe(200);
    expect(estado.inserts[0].respuestas).toEqual({ q1: 'b' });
  });

  it('exige la cadena completa cuando la condición se cumple', async () => {
    const res = await enviar('tok-fantasma-b', { respuestas: { q1: 'a' } });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { errores: { pregunta_id: string }[] };
    expect(json.errores.map((e) => e.pregunta_id)).toEqual(['q2']);
  });
});

describe('enlace personal /publico/formularios/invitado/:token', () => {
  beforeEach(() => {
    estado.invitado = {
      id: 'inv-1',
      formulario_id: 'form-1',
      nombre: 'Ana Cliente',
      estado: 'pendiente',
    };
  });

  it('GET devuelve nombre y formulario', async () => {
    const res = await app.request('/publico/formularios/invitado/tok-m');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      formulario: { id: 'form-1' },
      invitado: { nombre: 'Ana Cliente', ya_respondio: false },
    });
  });

  it('GET 404 si el token personal no existe', async () => {
    estado.invitado = null;
    const res = await app.request('/publico/formularios/invitado/tok-n');
    expect(res.status).toBe(404);
  });

  it('POST guarda y marca al invitado como respondido', async () => {
    const res = await app.request('/publico/formularios/invitado/tok-o/respuestas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuestas: { q1: 'Ana' } }),
    });
    expect(res.status).toBe(200);
    expect(estado.inserts[0]).toMatchObject({ invitado_id: 'inv-1', formulario_id: 'form-1' });
    expect(estado.updatesInvitado[0]).toMatchObject({
      id: 'inv-1',
      valores: { estado: 'respondido' },
    });
  });

  it('POST 409 si el invitado ya respondió', async () => {
    estado.invitado!.estado = 'respondido';
    const res = await app.request('/publico/formularios/invitado/tok-p/respuestas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuestas: { q1: 'Ana' } }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ motivo: 'ya_respondio' });
  });

  it('POST 409 si la inserción choca con el índice único', async () => {
    estado.insertError = { code: '23505', message: 'duplicate key' };
    const res = await app.request('/publico/formularios/invitado/tok-q/respuestas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuestas: { q1: 'Ana' } }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ motivo: 'ya_respondio' });
  });
});

describe('resolución de credenciales del link', () => {
  it('acepta el link nuevo con nombre + código', async () => {
    const res = await app.request('/publico/formularios/encuesta-demo-ab12cd');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ formulario: { id: 'form-1' } });
  });

  it('el último segmento no-código cae al token legacy', async () => {
    const res = await app.request('/publico/formularios/token-largo-legacy.abc_DEF-123');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ formulario: { id: 'form-1' } });
  });

  it('el link personal acepta nombre + código', async () => {
    estado.invitado = {
      id: 'inv-1',
      formulario_id: 'form-1',
      nombre: 'Ana Cliente',
      estado: 'pendiente',
    };
    const res = await app.request('/publico/formularios/invitado/ana-cliente-zz99yy');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ invitado: { nombre: 'Ana Cliente' } });
  });
});
