import CalendarioView, { type ViewMode, type FiltrosCalendario } from './calendario-view';

export default function CalendarioPage() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('v');
  const initialView: ViewMode | undefined =
    v === 'day' || v === 'week' || v === 'month' || v === 'year' ? v : undefined;
  const tipo = params.get('tipo');
  const initialFilters: FiltrosCalendario = {
    ws: params.get('ws') || 'all',
    asignado: params.get('asignado') || 'all',
    tipo: tipo === 'tareas' || tipo === 'notas' ? tipo : 'todas',
    estado: params.get('estado') || 'all',
  };
  return <CalendarioView initialView={initialView} initialFilters={initialFilters} />;
}