import { usePerfil } from '@/lib/use-perfil';
import { formatearHora, formatearHoraDesdeFecha } from '@/lib/formato-hora';
import { DEFAULT_PREFERENCES, type TimeFormat } from '@/types';

// Formato de hora del usuario (12h/24h) desde las preferencias del perfil.
// Observa la caché compartida sin disparar GET; cae al valor por defecto.
export function useFormatoHora() {
  const perfilQuery = usePerfil({ enabled: false });
  const timeFormat: TimeFormat =
    perfilQuery.data?.profile?.preferences?.time_format ??
    DEFAULT_PREFERENCES.time_format;

  return {
    timeFormat,
    formatHora: (hora: string | null | undefined) =>
      formatearHora(hora, timeFormat),
    formatHoraDeFecha: (fecha: Date) =>
      formatearHoraDesdeFecha(fecha, timeFormat),
  };
}
