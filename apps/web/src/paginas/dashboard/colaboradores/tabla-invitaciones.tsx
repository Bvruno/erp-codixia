'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { XCircle, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { useFormatoHora } from '@/lib/use-formato-hora';
import type { Invitation } from '@/types';
import {
  ROLE_LABELS,
  PERMISSION_LABELS,
  effectiveStatus,
  scopeOf,
  statusBadgeClass,
  statusLabel,
  type ArbolColaboradores,
} from './presentacion';

// Tabla de invitaciones con cancelación de las pendientes.

export function TablaInvitaciones({
  invitaciones,
  tree,
  onPedirCancelar,
}: {
  invitaciones: Invitation[];
  tree: ArbolColaboradores;
  onPedirCancelar: (inv: Invitation) => void;
}) {
  const { formatHoraDeFecha } = useFormatoHora();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invitaciones ({invitaciones.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {invitaciones.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No hay invitaciones
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Link</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitaciones.map((inv) => {
                const status = effectiveStatus(inv);
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <span
                        className="text-muted-foreground text-xs inline-flex items-center gap-1.5"
                        title="El link solo se muestra al generar la invitación (no se almacena)"
                      >
                        <Lock className="size-3.5" />
                        Solo al crear
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {ROLE_LABELS[inv.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inv.entity_type && inv.permission ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge variant="outline" className="text-[10px]">
                            {scopeOf(tree, inv)}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {PERMISSION_LABELS[inv.permission]}
                            {inv.inherit ? ' · hereda' : ''}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Toda la organización
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(status)}>{statusLabel(status)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(inv.created_at), 'dd/MM/yy')},{' '}
                      {formatHoraDeFecha(new Date(inv.created_at))}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(inv.expires_at), 'dd/MM/yy')},{' '}
                      {formatHoraDeFecha(new Date(inv.expires_at))}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => onPedirCancelar(inv)}
                            title="Cancelar invitación"
                          >
                            <XCircle className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
