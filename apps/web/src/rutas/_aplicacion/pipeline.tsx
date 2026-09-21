import { createFileRoute } from '@tanstack/react-router';
import PipelinePage from '@/paginas/dashboard/pipeline';
import { validarBusquedaPipeline } from '@/lib/pipeline-filtros';

export const Route = createFileRoute('/_aplicacion/pipeline')({
  validateSearch: validarBusquedaPipeline,
  component: PipelinePage,
});
