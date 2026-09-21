import { createFileRoute } from '@tanstack/react-router';
import CallbackPage from '@/paginas/auth/callback';

export const Route = createFileRoute('/auth/callback')({
  component: CallbackPage,
});
