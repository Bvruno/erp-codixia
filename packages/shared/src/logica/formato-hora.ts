import type { TimeFormat } from '../tipos/index';

// Formatea una hora "HH:mm" (o "HH:mm:ss") según la preferencia 12h/24h.
// Entrada inválida se devuelve tal cual para no romper la UI.
export function formatearHora(
  hora: string | null | undefined,
  formato: TimeFormat,
): string {
  if (!hora) return '';
  const [parteHora, parteMinuto = '00'] = hora.split(':');
  const horas = Number(parteHora);
  if (!Number.isFinite(horas)) return hora;
  const minutos = parteMinuto.slice(0, 2).padStart(2, '0');
  if (formato === '24h') {
    return `${String(horas).padStart(2, '0')}:${minutos}`;
  }
  const sufijo = horas >= 12 ? 'PM' : 'AM';
  const h12 = horas % 12 === 0 ? 12 : horas % 12;
  return `${h12}:${minutos} ${sufijo}`;
}

// Igual que formatearHora pero desde un Date (hora local del navegador).
export function formatearHoraDesdeFecha(fecha: Date, formato: TimeFormat): string {
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return formatearHora(`${horas}:${minutos}`, formato);
}
