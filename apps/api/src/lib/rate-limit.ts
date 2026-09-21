// Limitador de tasa en memoria (por proceso). Suficiente para endpoints
// públicos con una sola instancia; si algún día hay varias, migrar a un
// store compartido. Clave típica: `${ip}:${token}`.

export interface Limitador {
  permitido(clave: string): boolean;
}

export function crearLimitador({
  ventanaMs,
  max,
}: {
  ventanaMs: number;
  max: number;
}): Limitador {
  const ventanas = new Map<string, { inicio: number; conteo: number }>();
  const MAX_CLAVES = 5000;

  return {
    permitido(clave: string): boolean {
      const ahora = Date.now();
      const v = ventanas.get(clave);
      if (!v || ahora - v.inicio >= ventanaMs) {
        if (ventanas.size >= MAX_CLAVES) {
          for (const [k, val] of ventanas) {
            if (ahora - val.inicio >= ventanaMs) ventanas.delete(k);
          }
        }
        ventanas.set(clave, { inicio: ahora, conteo: 1 });
        return true;
      }
      if (v.conteo >= max) return false;
      v.conteo += 1;
      return true;
    },
  };
}

/** IP de cliente detrás del proxy (primer valor de x-forwarded-for). */
export function ipDeRequest(c: { req: { header: (name: string) => string | undefined } }): string {
  const reenviada = c.req.header('x-forwarded-for');
  const primera = reenviada?.split(',')[0]?.trim();
  return primera || c.req.header('x-real-ip') || 'local';
}
