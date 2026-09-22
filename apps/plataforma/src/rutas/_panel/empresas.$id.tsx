import { createFileRoute } from '@tanstack/react-router';
import { EmpresaDetallePage } from '@/paginas/panel/empresa-detalle';

export const Route = createFileRoute('/_panel/empresas/$id')({
  component: EmpresaDetallePage,
});
