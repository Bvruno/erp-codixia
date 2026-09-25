'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, CheckCheck } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/cliente';
import { cn } from '@/lib/utils';
import { shortUid } from '@/lib/slugs';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { useFormatoHora } from '@/lib/use-formato-hora';

export type Notificacion = {
  id: string;
  type:
    | 'task_assigned'
    | 'task_status'
    | 'note_added'
    | 'invitation'
    | 'permission'
    | 'reminder';
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  read: boolean;
  created_at: string;
};

export function NotificationsBell({ className }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { formatHoraDeFecha } = useFormatoHora();

  const notifQuery = useQuery({
    queryKey: ['notificaciones', 'lista'],
    queryFn: () =>
      api.get<{ notificaciones: Notificacion[]; noLeidas: number }>(
        '/notificaciones?limit=30',
      ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const canal = canalRealtime('notificaciones-cambios')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
        },
      )
      .subscribe();
    return () => removerCanal(canal);
  }, [queryClient]);

  const notificaciones = notifQuery.data?.notificaciones ?? [];
  const noLeidas = notifQuery.data?.noLeidas ?? 0;

  const cuando = (iso: string) => {
    const fecha = new Date(iso);
    if (isToday(fecha)) return formatHoraDeFecha(fecha);
    return `${format(fecha, 'd MMM', { locale: es })} · ${formatHoraDeFecha(fecha)}`;
  };

  const abrirNotificacion = async (n: Notificacion) => {
    if (!n.read) {
      void api
        .patch(`/notificaciones/${n.id}/leida`, { leida: true })
        .catch(() => undefined);
      queryClient.setQueryData<{
        notificaciones: Notificacion[];
        noLeidas: number;
      }>(['notificaciones', 'lista'], (old) =>
        old
          ? {
              notificaciones: old.notificaciones.map((x) =>
                x.id === n.id ? { ...x, read: true } : x,
              ),
              noLeidas: Math.max(0, old.noLeidas - 1),
            }
          : old,
      );
    }
    if (n.reference_type === 'task' && n.reference_id) {
      setAbierto(false);
      router.push(`/proyectos/${shortUid(n.reference_id)}`);
    }
  };

  const marcarTodas = async () => {
    await api.post('/notificaciones/leer-todas').catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          aria-label={
            noLeidas > 0
              ? `Notificaciones (${noLeidas} sin leer)`
              : 'Notificaciones'
          }
          className={cn(
            'text-muted-foreground hover:text-primary relative flex size-9 items-center justify-center rounded-md',
            className,
          )}
        >
          <Bell className="size-5" />
          {noLeidas > 0 && (
            <span className="bg-primary text-primary-foreground absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold leading-none">
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notificaciones</p>
          {noLeidas > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={marcarTodas}
            >
              <CheckCheck className="size-3.5" />
              Marcar leídas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifQuery.isPending ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              Cargando…
            </p>
          ) : notificaciones.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              Sin notificaciones
            </p>
          ) : (
            notificaciones.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void abrirNotificacion(n)}
                className={cn(
                  'hover:bg-accent flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors last:border-b-0',
                  !n.read && 'bg-primary-soft',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    n.read ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.body && (
                    <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs">
                      {n.body}
                    </span>
                  )}
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {cuando(n.created_at)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
