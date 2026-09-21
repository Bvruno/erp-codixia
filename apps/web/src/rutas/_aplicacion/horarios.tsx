import { createFileRoute } from '@tanstack/react-router';
import HorariosPage from '@/paginas/dashboard/horarios';

export const Route = createFileRoute('/_aplicacion/horarios')({
  component: HorariosPage,
});