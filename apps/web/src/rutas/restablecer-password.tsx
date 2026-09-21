import { createFileRoute } from '@tanstack/react-router';
import ResetPasswordPage from '@/paginas/auth/reset-password';

export const Route = createFileRoute('/restablecer-password')({
  component: ResetPasswordPage,
});