import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app';

const estado = vi.hoisted(() => ({
  form: null as { id: string; esquema: unknown } | null,
  updates: [] as Record<string, unknown>[],
}));

vi.mock('../lib/supabase/usuario', () => ({
  clienteUsuarioMiddleware: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>
  ) => {
    c.set('usuarioId', '33333333-3333-4333-8333-333333333333');
    c.set('supabase', {
      from: (tabla: string) => {
        if (tabla !== 'formularios') throw new Error(`tabla inesperada: ${tabla}`);
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: estado.form, error: null }) }),
          }),
          update: (valores: Record<string, unknown>) => {
            estado.updates.push(valores);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    });
    await next();
  },
}));

const app = crearApp('http://web');

beforeEach(() => {
  vi.clearAllMocks();
  estado.form = null;
  estado.updates = [];
});

describe('POST /formularios/:id/publicar', () => {
  it('404 si el formulario no existe o no es visible', async () => {
    const res = await app.request('/formularios/form-x/publicar', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('rechaza publicar sin preguntas', async () => {
    estado.form = { id: 'form-x', esquema: { version: 1, secciones: [] } };
    const res = await app.request('/formularios/form-x/publicar', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(estado.updates).toHaveLength(0);
  });

  it('publica, guarda solo el hash y el código, y devuelve ambos', async () => {
    estado.form = {
      id: 'form-x',
      esquema: {
        version: 1,
        secciones: [
          { id: 's1', titulo: 'S', preguntas: [{ id: 'q1', tipo: 'texto_corto', titulo: 'T', requerida: false }] },
        ],
      },
    };
    const res = await app.request('/formularios/form-x/publicar', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; codigo: string };
    expect(json.token.length).toBeGreaterThan(20);
    expect(json.codigo).toMatch(/^[a-z0-9]{6}$/);

    expect(estado.updates).toHaveLength(1);
    const patch = estado.updates[0];
    expect(patch.estado).toBe('publicado');
    expect(typeof patch.token_publico_hash).toBe('string');
    expect(patch.token_publico_hash).not.toBe(json.token);
    expect(String(patch.token_publico_hash)).toHaveLength(64);
    expect(patch.codigo_publico).toBe(json.codigo);
  });
});

describe('POST /formularios/:id/token/rotar', () => {
  it('genera token y código nuevos y persiste sus claves', async () => {
    const res = await app.request('/formularios/form-x/token/rotar', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; codigo: string };
    expect(json.codigo).toMatch(/^[a-z0-9]{6}$/);
    expect(estado.updates[0].token_publico_hash).not.toBe(json.token);
    expect(estado.updates[0].codigo_publico).toBe(json.codigo);
  });
});

describe('PUT /formularios/:id', () => {
  it('rechaza esquema inválido', async () => {
    const res = await app.request('/formularios/form-x', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ esquema: { version: 1, secciones: 'no-array' } }),
    });
    expect(res.status).toBe(400);
  });

  it('acepta ajustes válidos', async () => {
    const res = await app.request('/formularios/form-x', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nuevo nombre' }),
    });
    expect(res.status).toBe(200);
    expect(estado.updates[0]).toEqual({ name: 'Nuevo nombre' });
  });
});

const ESQUEMA_LOGICA_INVALIDA = {
  version: 1,
  secciones: [
    {
      id: 's1',
      titulo: 'S1',
      preguntas: [
        {
          id: 'q1',
          tipo: 'texto_corto',
          titulo: 'Q1',
          requerida: false,
          logica: {
            mostrar_si: {
              id: 'r1',
              condiciones: [{ pregunta_id: 'q2', operador: 'respondida' }],
              modo: 'todas',
            },
          },
        },
        { id: 'q2', tipo: 'texto_corto', titulo: 'Q2', requerida: false },
      ],
    },
  ],
};

describe('IF en PUT /formularios/:id', () => {
  it('rechaza lógica con referencia futura sin guardar', async () => {
    const res = await app.request('/formularios/form-x', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ esquema: ESQUEMA_LOGICA_INVALIDA }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { errores: unknown[] };
    expect(json.errores.length).toBeGreaterThan(0);
    expect(estado.updates).toHaveLength(0);
  });
});

describe('IF en POST /formularios/:id/publicar', () => {
  it('rechaza publicar con lógica inválida', async () => {
    estado.form = { id: 'form-x', esquema: ESQUEMA_LOGICA_INVALIDA };
    const res = await app.request('/formularios/form-x/publicar', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(estado.updates).toHaveLength(0);
  });
});
