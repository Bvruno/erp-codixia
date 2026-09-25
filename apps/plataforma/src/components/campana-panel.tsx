import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificacionPlataforma } from '@erp/shared/telegram-plataforma';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDatos } from '@/lib/use-datos';
import {
  marcarNotificacionesLeidas,
} from '@/lib/api/panel';
import { hace } from '@/lib/formato';
import { cn } from '@/lib/utils';

const DESTINOS: Record<string, string> = {
  solicitud_nueva: '/solicitudes',
  solicitud_en_revision: '/solicitudes',
  solicitud_aprobada: '/solicitudes',
  solicitud_rechazada: '/solicitudes',
  empresa_creada: '/empresas',
  empresa_activada: '/empresas',
  empresa_suspendida: '/empresas',
  empresa_reactivada: '/empresas',
  empresa_eliminada: '/empresas',
  owner_inactivo: '/empresas',
  empresa_sin_owner: '/empresas',
  uso_limite_plan: '/empresas',
  factura_creada: '/facturas',
  factura_pagada: '/facturas',
  factura_vencida: '/facturas',
  suscripcion_actualizada: '/facturas',
  admin_agregado: '/admins',
  admin_quitado: '/admins',
  error_nuevo: '/auditoria',
  resumen_diario: '/',
};

export function CampanaPanel() {
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const { datos, recargar } = useDatos<{
    data: NotificacionPlataforma[];
    no_leidas: number;
  }>('/plataforma/telegram/notificaciones');

  const notificaciones = datos?.data ?? [];
  const noLeidas = datos?.no_leidas ?? 0;

  async function abrirNotificacion(notificacion: NotificacionPlataforma) {
    setAbierto(false);
    if (!notificacion.leida) {
      await marcarNotificacionesLeidas([notificacion.id]).catch(() => undefined);
      recargar();
    }
    const destino = DESTINOS[notificacion.evento];
    if (destino) await navegar({ to: destino });
  }

  async function marcarTodas() {
    await marcarNotificacionesLeidas().catch(() => undefined);
    recargar();
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="relative"
        aria-label="Notificaciones"
        aria-haspopup="true"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <Bell />
        {noLeidas > 0 && (
          <span className="bg-destructive absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </Button>

      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar notificaciones"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <div className="bg-popover text-popover-foreground absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border p-2 shadow-popover md:top-auto md:right-auto md:bottom-0 md:left-full md:ml-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-sm font-semibold">Notificaciones</span>
              {noLeidas > 0 && (
                <Button variant="ghost" size="sm" onClick={marcarTodas}>
                  <CheckCheck />
                  Marcar leídas
                </Button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notificaciones.length === 0 && (
                <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                  Sin notificaciones.
                </p>
              )}
              {notificaciones.map((notificacion) => (
                <button
                  key={notificacion.id}
                  type="button"
                  onClick={() => void abrirNotificacion(notificacion)}
                  className={cn(
                    'hover:bg-accent flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left',
                    !notificacion.leida && 'bg-primary/5'
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium">{notificacion.titulo}</span>
                    {!notificacion.leida && <Badge variant="default">Nueva</Badge>}
                  </span>
                  {notificacion.cuerpo && (
                    <span className="text-muted-foreground line-clamp-2 text-xs whitespace-pre-line">
                      {notificacion.cuerpo}
                    </span>
                  )}
                  <span className="text-muted-foreground text-[11px]">
                    {hace(notificacion.created_at)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
