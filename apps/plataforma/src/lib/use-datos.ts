import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/cliente';

// Lectura simple de datos del panel: estado local + recarga manual.
// `cargando` se deriva de la clave consultada para no setear estado
// sincrónicamente dentro del efecto.
export function useDatos<T>(ruta: string | null) {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<{
    clave: string;
    datos: T | null;
    error: string | null;
  } | null>(null);

  const clave = ruta ? `${ruta}#${version}` : null;

  useEffect(() => {
    if (!ruta || !clave) return;
    let activo = true;
    api
      .get<T>(ruta)
      .then((res) => {
        if (activo) setResultado({ clave, datos: res, error: null });
      })
      .catch((e: unknown) => {
        if (activo) {
          setResultado({
            clave,
            datos: null,
            error: e instanceof Error ? e.message : 'Error cargando datos',
          });
        }
      });
    return () => {
      activo = false;
    };
  }, [ruta, clave]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const actual = resultado?.clave === clave ? resultado : null;

  return {
    datos: actual?.datos ?? null,
    cargando: Boolean(ruta) && !actual,
    error: actual?.error ?? null,
    recargar,
    setDatos: (datos: T | null) =>
      setResultado(clave ? { clave, datos, error: null } : null),
  };
}
