import { createFileRoute } from '@tanstack/react-router';
import { RestablecerPasswordPage } from '@/paginas/auth/restablecer-password';

export const Route = createFileRoute('/restablecer-password')({
  component: RestablecerPasswordPage,
});
