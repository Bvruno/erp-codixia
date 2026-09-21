import { Outlet, createFileRoute, useLocation, useParams } from '@tanstack/react-router';
import { EntityDashboard } from '@/components/tareas/entity-dashboard';

export const Route = createFileRoute('/_aplicacion/proyectos/$id')({
  component: Proyecto,
});

// Layout de workspace: ruta terminal (/proyectos/<ws>) → dashboard del
// workspace; con hijo (carpeta/lista/...) → Outlet. Sin esto los hijos
// nunca renderizan.
function Proyecto() {
  const { id } = useParams({ from: Route.id });
  const segs = useLocation().pathname.split('/').filter(Boolean);
  if (segs.length > 2) return <Outlet />;
  return <EntityDashboard scope={{ type: 'workspace', id }} />;
}