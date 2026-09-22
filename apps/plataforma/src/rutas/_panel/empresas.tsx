import { createFileRoute } from '@tanstack/react-router';
import { EmpresasPage } from '@/paginas/panel/empresas';

export const Route = createFileRoute('/_panel/empresas')({
  component: EmpresasPage,
});
