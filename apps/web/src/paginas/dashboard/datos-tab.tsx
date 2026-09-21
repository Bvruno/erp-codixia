"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, apiFetch, descargarApi } from "@/lib/api/cliente";
import { TTL_CACHE } from "@/lib/cache-claves";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Download,
  FileSpreadsheet,
  LogOut,
  Trash2,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { AuditLog } from "@/types";

interface Props {
  orgId: string;
}

interface AuditRow extends AuditLog {
  user?: { full_name: string } | null;
}

export function DatosTab({ orgId }: Props) {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Comparte caché con OrganizacionTab (misma key) para no repetir el GET.
  const orgQuery = useQuery({
    queryKey: ['organizacion', 'datos', orgId],
    queryFn: () =>
      apiFetch<{ name: string }>(
        `/perfil/organizacion/datos?organization_id=${encodeURIComponent(orgId)}`
      ),
    staleTime: TTL_CACHE.catalogo,
    refetchOnWindowFocus: false,
  });
  const auditQuery = useQuery({
    queryKey: ['auditoria', orgId],
    queryFn: () =>
      apiFetch<{ logs: AuditRow[] }>(
        `/auditoria?organization_id=${encodeURIComponent(orgId)}&limit=20`
      ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const auditLoading = auditQuery.isPending;

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    if (orgQuery.data) setOrgName(orgQuery.data.name);
  }, [orgQuery.data]);
  useEffect(() => {
    if (auditQuery.data) setAudit(auditQuery.data.logs);
  }, [auditQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (orgQuery.isError || auditQuery.isError) {
      toast.error("No se pudieron cargar los datos");
    }
  }, [orgQuery.isError, auditQuery.isError]);

  const descargar = async (ruta: string, nombre: string) => {
    try {
      const blob = await descargarApi(ruta);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudieron exportar los datos");
    }
  };

  const revokeSessions = async () => {
    setSessionsLoading(true);
    try {
      await api.delete("/organizacion/sesiones");
      toast.success("Sesiones cerradas");
      router.push("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cerrar las sesiones");
    } finally {
      setSessionsLoading(false);
    }
  };

  const deleteOrg = async () => {
    if (deleteConfirm.trim() !== orgName) return;
    setDeleteLoading(true);
    try {
      await api.post("/organizacion/eliminar");
      toast.success("Organización eliminada");
      router.push("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar la organización");
    } finally {
      setDeleteLoading(false);
    }
  };

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      rename: "Renombrar organización",
      update_limits: "Actualizar límites",
      update_telegram: "Configurar Telegram",
      create: "Crear",
      update: "Actualizar",
      delete: "Eliminar",
    };
    return map[action] ?? action;
  };

  return (
    <div className="space-y-6">
      <div className="columns-1 gap-6 xl:columns-2">
        <Card className="mb-6 break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">Datos</CardTitle>
          <CardDescription>
            Exporta los datos de la organización o cierra tus sesiones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void descargar("/organizacion/exportar", "organizacion.json")}
            >
              <Download className="size-4" />
              Exportar Datos (JSON)
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void descargar("/organizacion/exportar.xlsx", "organizacion.xlsx")
              }
            >
              <FileSpreadsheet className="size-4" />
              Exportar Excel (.xlsx)
            </Button>
            <Button variant="outline" onClick={() => setSessionsOpen(true)}>
              <LogOut className="size-4" />
              Cerrar Sesiones
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 break-inside-avoid">
        <CardHeader>
          <CardTitle className="text-base">
            Registro de cambios recientes
          </CardTitle>
          <CardDescription>
            Últimas modificaciones a la configuración
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              Cargando...
            </div>
          ) : audit.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Sin actividad"
              description="Los cambios de configuración aparecerán aquí"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acción</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{actionLabel(entry.action)}</TableCell>
                    <TableCell>{entry.user?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(entry.created_at).toLocaleString("es")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 break-inside-avoid border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" />
            <CardTitle className="text-base text-destructive">
              Zona de riesgo
            </CardTitle>
          </div>
          <CardDescription>
            Acciones irreversibles. Solo el dueño puede eliminar la
            organización.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4" />
            Eliminar Organización
          </Button>
        </CardContent>
      </Card>
      </div>

      <ConfirmDialog
        open={sessionsOpen}
        onOpenChange={setSessionsOpen}
        title="¿Cerrar todas tus sesiones?"
        description="Se cerrará la sesión en todos tus dispositivos. Deberás iniciar sesión de nuevo."
        confirmLabel="Cerrar Sesiones"
        variant="destructive"
        loading={sessionsLoading}
        onConfirm={revokeSessions}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar la organización?</DialogTitle>
            <DialogDescription>
              Se eliminarán todos los datos y cuentas de la organización. Esta
              acción no se puede deshacer. Escribe{" "}
              <span className="font-medium">{orgName}</span> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Confirmar</Label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={orgName}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm.trim() !== orgName || deleteLoading}
              onClick={deleteOrg}
            >
              {deleteLoading ? "Eliminando..." : "Eliminar Organización"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
