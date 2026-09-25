import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../app';

const PAGINA_A = '11111111-1111-4111-8111-111111111111';
const PAGINA_B = '22222222-2222-4222-8222-222222222222';
const PAGINA_C = '33333333-3333-4333-8333-333333333333';

const estado = vi.hoisted(() => ({
  paginas: [] as { id: string }[],
  actualizadas: [] as { id: string; position: number }[],
  filasEscritura: 1,
  errorLectura: null as { message?: string; code?: string } | null,
}));

vi.mock('../lib/supabase/usuario', () => ({
  clienteUsuarioMiddleware: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>
  ) => {
    c.set('usuarioId', '44444444-4444-4444-8444-444444444444');
    c.set('supabase', {
      from: (tabla: string) => {
        if (tabla !== 'document_pages') throw new Error(`tabla inesperada: ${tabla}`);
        return {
          select: () => ({
            eq: async () => ({ data: estado.paginas, error: estado.errorLectura }),
          }),
          update: (cambios: { position: number }) => ({
            eq: (columna: string, valor: string) => ({
              eq: () => ({
                select: async () => {
                  if (columna === 'id') {
                    estado.actualizadas.push({ id: valor, position: cambios.position });
                  }
                  return {
                    data: Array.from({ length: estado.filasEscritura }, () => ({ id: valor })),
                    error: null,
                  };
                },
              }),
            }),
          }),
        };
      },
    });
    await next();
  },
}));

const app = crearApp('http://localhost:5173');

function reordenar(orden: string[]) {
  return app.request('/documentos/doc-1/paginas/reordenar', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orden }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.paginas = [{ id: PAGINA_A }, { id: PAGINA_B }, { id: PAGINA_C }];
  estado.actualizadas = [];
  estado.filasEscritura = 1;
  estado.errorLectura = null;
});

describe('PATCH /documentos/:id/paginas/reordenar', () => {
  it('rechaza payloads inválidos', async () => {
    expect((await reordenar([])).status).toBe(400);
    expect(
      (
        await app.request('/documentos/doc-1/paginas/reordenar', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: ['no-uuid'] }),
        })
      ).status
    ).toBe(400);
  });

  it('rechaza un orden que no cubre exactamente las páginas del documento', async () => {
    expect((await reordenar([PAGINA_A, PAGINA_B])).status).toBe(400);
    expect(
      (await reordenar([PAGINA_A, PAGINA_B, '55555555-5555-4555-8555-555555555555'])).status
    ).toBe(400);
    expect(estado.actualizadas).toEqual([]);
  });

  it('persiste la posición según el orden recibido', async () => {
    const res = await reordenar([PAGINA_C, PAGINA_A, PAGINA_B]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(estado.actualizadas).toEqual([
      { id: PAGINA_C, position: 0 },
      { id: PAGINA_A, position: 1 },
      { id: PAGINA_B, position: 2 },
    ]);
  });

  it('403 cuando RLS no deja escribir ninguna fila', async () => {
    estado.filasEscritura = 0;
    const res = await reordenar([PAGINA_B, PAGINA_A, PAGINA_C]);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('42501');
  });
});
