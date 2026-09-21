import { createFileRoute } from '@tanstack/react-router';
import ConfiguracionPage from '@/paginas/dashboard/configuracion';

export const Route = createFileRoute('/_aplicacion/configuracion')({
  component: ConfiguracionPage,
});