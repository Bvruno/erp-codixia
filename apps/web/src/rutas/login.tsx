import { createFileRoute } from '@tanstack/react-router';
import LoginPage from '@/paginas/auth/login';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});