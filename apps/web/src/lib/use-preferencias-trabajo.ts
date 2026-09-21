import { usePerfil } from '@/lib/use-perfil';
import { DEFAULT_PREFERENCES } from '@/types';

// Días laborables efectivos: si la preferencia quedó vacía se usan los
// laborables por defecto (lunes a viernes).
export function diasLaborablesEfectivos(
  workDays: number[] | null | undefined,
): number[] {
  return workDays && workDays.length > 0
    ? [...workDays].sort((a, b) => a - b)
    : DEFAULT_PREFERENCES.work_days;
}

export function esDiaLaborable(
  weekday: number,
  workDays: number[] | null | undefined,
): boolean {
  return diasLaborablesEfectivos(workDays).includes(weekday);
}

// Preferencias de jornada del perfil (observa la caché compartida, sin GET).
export function usePreferenciasTrabajo() {
  const perfilQuery = usePerfil({ enabled: false });
  const prefs = perfilQuery.data?.profile?.preferences;
  const workDays = diasLaborablesEfectivos(prefs?.work_days);
  const workdayStart = prefs?.workday_start || DEFAULT_PREFERENCES.workday_start;

  return {
    workDays,
    workdayStart,
    esLaborable: (weekday: number) => workDays.includes(weekday),
  };
}
