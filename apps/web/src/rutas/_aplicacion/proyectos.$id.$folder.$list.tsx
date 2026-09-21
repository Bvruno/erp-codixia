import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router';
import { TaskBoard } from '@/components/tareas/task-board';

export const Route = createFileRoute(
  '/_aplicacion/proyectos/$id/$folder/$list'
)({
  component: Lista,
});

// Lista: ruta terminal (/proyectos/<ws>/<folder>/<list>) → board de la
// lista; con hijo (tarea) → Outlet.
function Lista() {
  const segs = useLocation().pathname.split('/').filter(Boolean);
  if (segs.length > 4) return <Outlet />;
  return <TaskBoard />;
}