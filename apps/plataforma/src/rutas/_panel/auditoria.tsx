import { createFileRoute } from '@tanstack/react-router';
import { AuditoriaPage } from '@/paginas/panel/auditoria';

export const Route = createFileRoute('/_panel/auditoria')({
  component: AuditoriaPage,
});
