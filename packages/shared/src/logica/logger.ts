// Logger estructurado mínimo (salida JSON por línea).
// La captura a error_logs (DB) la hace la capa de API (captureErrorServer),
// no esta librería: shared no depende de supabase.
export function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  ctx?: Record<string, unknown>,
) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...ctx,
  });
  if (level === 'error') {
    console.error(entry);
  } else if (level === 'warn') {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}
