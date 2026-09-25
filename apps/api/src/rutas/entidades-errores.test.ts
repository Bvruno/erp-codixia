import { describe, expect, it } from 'vitest';
import { mapearError } from './entidades';

type Captura = { cuerpo: { error?: string; code?: string }; status?: number };

function contexto() {
  const capturas: Captura[] = [];
  return {
    capturas,
    json: (cuerpo: unknown, status?: number): Response => {
      capturas.push({ cuerpo: cuerpo as Captura['cuerpo'], status });
      return new Response(JSON.stringify(cuerpo), { status });
    },
  };
}

describe('mapearError', () => {
  it('traduce RLS/privilegios (42501) a 403 con mensaje accionable', () => {
    const c = contexto();
    const res = mapearError(c, {
      code: '42501',
      message: 'new row violates row-level security policy for table "documents"',
    });
    expect(res.status).toBe(403);
    expect(c.capturas[0].cuerpo.error).toMatch(/no tienes permiso/i);
    expect(c.capturas[0].cuerpo.code).toBe('42501');
  });

  it('traduce el FK del contenedor a un 400 claro', () => {
    const c = contexto();
    const res = mapearError(c, {
      code: '23503',
      message:
        'insert or update on table "entities" violates foreign key constraint "entities_parent_id_fkey"',
    });
    expect(res.status).toBe(400);
    expect(c.capturas[0].cuerpo.error).toMatch(/destino ya no existe/i);
  });

  it('traduce duplicados (23505) a 409', () => {
    const c = contexto();
    const res = mapearError(c, {
      code: '23505',
      message: 'duplicate key value violates unique constraint "x"',
    });
    expect(res.status).toBe(409);
    expect(c.capturas[0].cuerpo.error).toMatch(/ya existe/i);
  });

  it('conserva el mensaje original en errores no clasificados', () => {
    const c = contexto();
    const res = mapearError(c, { code: '23514', message: 'regla de negocio' });
    expect(res.status).toBe(400);
    expect(c.capturas[0].cuerpo.error).toBe('regla de negocio');
  });

  it('usa el fallback si no hay mensaje', () => {
    const c = contexto();
    const res = mapearError(c, {}, 'No se pudo crear');
    expect(res.status).toBe(400);
    expect(c.capturas[0].cuerpo.error).toBe('No se pudo crear');
  });
});
