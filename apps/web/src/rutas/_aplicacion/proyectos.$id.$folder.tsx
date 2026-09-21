import { Outlet, createFileRoute, useLocation, useParams } from '@tanstack/react-router';
import { EntityDashboard } from '@/components/tareas/entity-dashboard';

export const Route = createFileRoute('/_aplicacion/proyectos/$id/$folder')({
  component: Carpeta,
});

// Layout de carpeta: ruta terminal (/proyectos/<ws>/<folder>) → dashboard
// de la carpeta; con hijo (lista/documento/mapa/todo) → Outlet.
function Carpeta() {
  const { id, folder } = useParams({ from: Route.id });
  const segs = useLocation().pathname.split('/').filter(Boolean);
  if (segs.length > 3) return <Outlet />;
  return <EntityDashboard scope={{ type: 'folder', id: folder, wsId: id }} />;
}