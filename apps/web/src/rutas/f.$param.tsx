import { createFileRoute, useParams } from '@tanstack/react-router';
import { ResponderPublico } from '@/components/formularios/responder-publico';

export const Route = createFileRoute('/f/$param')({
  component: FormularioPublicoPage,
});

function FormularioPublicoPage() {
  const { param } = useParams({ from: Route.id });
  return <ResponderPublico credencial={param} modo="general" />;
}
