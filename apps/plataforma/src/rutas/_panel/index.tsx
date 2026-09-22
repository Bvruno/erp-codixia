import { createFileRoute } from '@tanstack/react-router';
import { EstadisticasPage } from '@/paginas/panel/estadisticas';

export const Route = createFileRoute('/_panel/')({
  component: EstadisticasPage,
});
