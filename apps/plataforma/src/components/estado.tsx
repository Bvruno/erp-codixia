import { Badge } from '@/components/ui/badge';
import type {
  EstadoFactura,
  EstadoOrg,
  EstadoSolicitud,
  EstadoSuscripcion,
} from '@erp/shared/plataforma';

const ETIQUETAS_SOLICITUD: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  invitada: 'Invitada',
  activada: 'Activada',
};

const VARIANTES_SOLICITUD: Record<
  EstadoSolicitud,
  'secondary' | 'aviso' | 'exito' | 'destructive' | 'default'
> = {
  pendiente: 'aviso',
  en_revision: 'secondary',
  aprobada: 'exito',
  rechazada: 'destructive',
  invitada: 'default',
  activada: 'exito',
};

export function BadgeSolicitud({ estado }: { estado: EstadoSolicitud }) {
  return <Badge variant={VARIANTES_SOLICITUD[estado]}>{ETIQUETAS_SOLICITUD[estado]}</Badge>;
}

export function BadgeEmpresa({ estado }: { estado: EstadoOrg }) {
  return (
    <Badge variant={estado === 'activa' ? 'exito' : 'destructive'}>
      {estado === 'activa' ? 'Activa' : 'Suspendida'}
    </Badge>
  );
}

const ETIQUETAS_SUSCRIPCION: Record<EstadoSuscripcion, string> = {
  prueba: 'Prueba',
  activa: 'Activa',
  mora: 'En mora',
  cancelada: 'Cancelada',
};

export function BadgeSuscripcion({ estado }: { estado: EstadoSuscripcion }) {
  const variante =
    estado === 'activa' ? 'exito' : estado === 'mora' ? 'destructive' : 'secondary';
  return <Badge variant={variante}>{ETIQUETAS_SUSCRIPCION[estado]}</Badge>;
}

const ETIQUETAS_FACTURA: Record<EstadoFactura, string> = {
  pendiente: 'Pendiente',
  pagada: 'Pagada',
  anulada: 'Anulada',
};

export function BadgeFactura({ estado }: { estado: EstadoFactura }) {
  const variante =
    estado === 'pagada' ? 'exito' : estado === 'anulada' ? 'secondary' : 'aviso';
  return <Badge variant={variante}>{ETIQUETAS_FACTURA[estado]}</Badge>;
}
