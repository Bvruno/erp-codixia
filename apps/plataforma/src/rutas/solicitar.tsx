import { createFileRoute } from '@tanstack/react-router';
import { SolicitarPage } from '@/paginas/publico/solicitar';

export const Route = createFileRoute('/solicitar')({
  component: SolicitarPage,
});
