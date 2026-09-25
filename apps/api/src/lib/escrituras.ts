// Escrituras verificables: PostgREST responde 204/200 aunque RLS haya
// filtrado todas las filas de un UPDATE/DELETE (sin permiso o sobre filas
// inexistentes). Encadenar `.select('id')` y contar filas permite al
// caller distinguir un guardado real de un falso OK.

type ErrorPg = { message?: string; code?: string };

export type ResultadoEscritura = {
  filas: number;
  error: ErrorPg | null;
};

export async function ejecutarEscritura(
  consulta: PromiseLike<{ data: unknown[] | null; error: ErrorPg | null }>
): Promise<ResultadoEscritura> {
  const res = await consulta;
  return { filas: res.data?.length ?? 0, error: res.error };
}

// Respuesta estándar cuando una escritura no tocó ninguna fila: RLS la
// filtró (sin permiso) o la fila ya no existe. Mismo código que Postgres
// para "insufficient_privilege" para que el SPA lo trate como 403.
export function sinPermisoEscritura(c: {
  json: (b: unknown, s?: number) => Response;
}): Response {
  return c.json(
    {
      error: 'No tienes permiso para modificar este elemento o ya no existe',
      code: '42501',
    },
    403
  );
}
