import { createFileRoute } from '@tanstack/react-router';
import CalendarioPage from '@/paginas/dashboard/calendario';

export const Route = createFileRoute('/_aplicacion/calendario')({
  component: CalendarioPage,
});