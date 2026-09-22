import { createFileRoute } from '@tanstack/react-router';
import { SolicitudesPage } from '@/paginas/panel/solicitudes';

export const Route = createFileRoute('/_panel/solicitudes')({
  component: SolicitudesPage,
});
