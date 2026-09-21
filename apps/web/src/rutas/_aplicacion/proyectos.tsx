import { Outlet, createFileRoute } from '@tanstack/react-router';
import { TareasLayout } from '@/components/tareas/tareas-layout';

export const Route = createFileRoute('/_aplicacion/proyectos')({
  component: Proyectos,
});

function Proyectos() {
  return (
    <TareasLayout>
      <Outlet />
    </TareasLayout>
  );
}
