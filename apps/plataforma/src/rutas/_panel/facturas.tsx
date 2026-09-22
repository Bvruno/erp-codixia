import { createFileRoute } from '@tanstack/react-router';
import { FacturasPage } from '@/paginas/panel/facturas';

export const Route = createFileRoute('/_panel/facturas')({
  component: FacturasPage,
});
