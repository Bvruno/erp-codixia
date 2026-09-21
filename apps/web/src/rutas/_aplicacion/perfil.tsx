import { createFileRoute } from '@tanstack/react-router';
import PerfilPage from '@/paginas/dashboard/perfil';

export const Route = createFileRoute('/_aplicacion/perfil')({
  component: PerfilPage,
});