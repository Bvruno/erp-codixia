import { createFileRoute } from '@tanstack/react-router';
import { TelegramPage } from '@/paginas/panel/telegram';

export const Route = createFileRoute('/_panel/telegram')({
  component: TelegramPage,
});
