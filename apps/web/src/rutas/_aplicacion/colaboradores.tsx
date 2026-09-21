import { createFileRoute } from '@tanstack/react-router';
import ColaboradoresPage from '@/paginas/dashboard/colaboradores';

export const Route = createFileRoute('/_aplicacion/colaboradores')({
  component: ColaboradoresPage,
});