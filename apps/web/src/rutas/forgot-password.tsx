import { createFileRoute } from '@tanstack/react-router';
import ForgotPasswordPage from '@/paginas/auth/forgot-password';

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
});