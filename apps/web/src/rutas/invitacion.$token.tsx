import { createFileRoute } from '@tanstack/react-router';
import InvitacionPage from '@/paginas/invite/invitacion';

export const Route = createFileRoute('/invitacion/$token')({
  component: InvitacionPage,
});