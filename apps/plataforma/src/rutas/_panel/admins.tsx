import { createFileRoute } from '@tanstack/react-router';
import { AdminsPage } from '@/paginas/panel/admins';

export const Route = createFileRoute('/_panel/admins')({
  component: AdminsPage,
});
