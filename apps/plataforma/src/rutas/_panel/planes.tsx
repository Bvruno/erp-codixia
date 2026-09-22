import { createFileRoute } from '@tanstack/react-router';
import { PlanesPage } from '@/paginas/panel/planes';

export const Route = createFileRoute('/_panel/planes')({
  component: PlanesPage,
});
