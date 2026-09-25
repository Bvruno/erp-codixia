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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Ban, CheckCircle, Trash2, Settings2, Crown, UserCheck, Lock } from 'lucide-react';
import { format } from 'date-fns';
import type { Profile } from '@/types';

// Tabla de miembros con acciones por fila (rol, accesos, bloquear, eliminar).

export function TablaMiembros({
  miembros,
  totalMiembros,
  seleccionadoId,
  ownerId,
  meId,
  grantCounts,
  busy,
  esOwnerSession,
  canManage,
  onSeleccionar,
  onCambiarRol,
  onAbrirAccesos,
  onPedirBloqueo,
  onPedirEliminar,
}: {
  miembros: Profile[];
  totalMiembros: number;
  seleccionadoId: string | null;
  ownerId: string | null;
  meId: string | null;
  grantCounts: Record<string, number>;
  busy: string | null;
  esOwnerSession: boolean;
  canManage: (c: Profile) => boolean;
  onSeleccionar: (id: string) => void;
  onCambiarRol: (id: string, rol: string) => void;
  onAbrirAccesos: (c: Profile) => void;
  onPedirBloqueo: (c: Profile) => void;
  onPedirEliminar: (c: Profile) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Miembros ({totalMiembros})</CardTitle>
      </CardHeader>
    <CardContent className="overflow-x-auto">
      {miembros.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-4">
          {totalMiembros === 0 ? 'No hay miembros' : 'Sin resultados para la búsqueda'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Miembro desde</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {miembros.map((c) => {
              const initials =
                c.full_name
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || '--';
              const manageable = canManage(c);
              const isOwner = c.id === ownerId;
              const isSelf = !!meId && c.id === meId;

              return (
                <TableRow
                  key={c.id}
                  data-state={c.id === seleccionadoId ? 'selected' : undefined}
                  className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSeleccionar(c.id);
                    }
                  }}
                  onClick={() => onSeleccionar(c.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar >
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-medium text-sm">{c.full_name}</p>
                        {isOwner && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Crown className="size-3 text-yellow-500" />
                            Dueño
                          </Badge>
                        )}
                        {isSelf && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <UserCheck className="size-3" />
                            Tú
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={c.role}
                      onValueChange={(v) => onCambiarRol(c.id, v)}
                      disabled={!manageable}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {esOwnerSession && <SelectItem value="admin">Admin</SelectItem>}
                        <SelectItem value="collaborator">Colaborador</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {c.daily_hours}h / {c.weekly_hours}h
                  </TableCell>
                  <TableCell>
                    {grantCounts[c.id] > 0 ? (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Settings2 className="size-3" />
                        {grantCounts[c.id]} acceso(s)
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">General</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.blocked ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : (
                      <>
                        <Badge variant="secondary" className="bg-success/20 text-success">
                          Activo
                        </Badge>
                        {c.access_mode === 'grants_only' && (
                          <Badge
                            variant="outline"
                            className="text-xs gap-1 text-warning"
                            title="Invitado por link con acceso aislado: solo ve los archivos con permiso asignado"
                          >
                            <Lock className="size-3" />
                            Acceso restringido
                          </Badge>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {format(new Date(c.created_at), 'dd/MM/yy')}
                  </TableCell>
                  <TableCell>
                    {manageable && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"

                          onClick={() => onAbrirAccesos(c)}
                          title="Administrar accesos"
                        >
                          <Settings2 className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"

                          disabled={busy === `block-${c.id}`}
                          onClick={() => onPedirBloqueo(c)}
                          title={c.blocked ? 'Desbloquear' : 'Bloquear'}
                        >
                          {c.blocked ? (
                            <CheckCircle className="size-4 text-success" />
                          ) : (
                            <Ban className="size-4 text-destructive" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          disabled={busy === 'delete'}
                          onClick={() => onPedirEliminar(c)}
                          title="Eliminar miembro"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
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
