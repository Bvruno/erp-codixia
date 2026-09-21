import { createFileRoute, useParams } from '@tanstack/react-router';
import { ResponderPublico } from '@/components/formularios/responder-publico';

export const Route = createFileRoute('/f/invitado/$param')({
  component: FormularioInvitadoPage,
});

function FormularioInvitadoPage() {
  const { param } = useParams({ from: Route.id });
  return <ResponderPublico credencial={param} modo="personal" />;
}
