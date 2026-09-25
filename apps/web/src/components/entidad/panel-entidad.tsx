'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TITULO_PANEL } from './tipografia';

// Panel estándar de entidad: Card con cabecera opcional (título + acciones)
// para info de tarea, progreso del TO-DO, preview de formulario, etc.

export function PanelEntidad({
  titulo,
  acciones,
  children,
  className,
  cabeceraClassName,
  tituloClassName,
  contenidoClassName,
  style,
  ref,
}: {
  titulo?: React.ReactNode;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  cabeceraClassName?: string;
  tituloClassName?: string;
  contenidoClassName?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <Card ref={ref} className={className} style={style}>
      {(titulo || acciones) && (
        <CardHeader
          className={cn(
            'flex flex-row items-center justify-between gap-2 pb-2',
            cabeceraClassName
          )}
        >
          {typeof titulo === 'string' ? (
            <CardTitle className={cn(TITULO_PANEL, tituloClassName)}>{titulo}</CardTitle>
          ) : (
            titulo
          )}
          {acciones}
        </CardHeader>
      )}
      <CardContent className={cn(titulo || acciones ? 'pt-0' : undefined, contenidoClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
