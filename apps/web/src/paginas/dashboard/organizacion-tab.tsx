"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetch } from "@/lib/api/cliente";
import { TTL_CACHE } from "@/lib/cache-claves";
import { useAutoguardado } from "@/lib/use-autoguardado";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { BarraEstadoGuardado } from "@/components/layout/estado-guardado";
import { toast } from "sonner";
import { TimezonePicker } from "./timezone-picker";
import type { OrgSettings } from "@/types";

interface Props {
  orgId: string;
}

type LimitesOrg = Pick<OrgSettings, "daily_hours" | "weekly_hours" | "timezone">;

const limitesDe = (settings: OrgSettings | null): LimitesOrg | null =>
  settings
    ? {
        daily_hours: settings.daily_hours,
        weekly_hours: settings.weekly_hours,
        timezone: settings.timezone,
      }
    : null;

export function OrganizacionTab({ orgId }: Props) {
  const [orgName, setOrgName] = useState("");
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [nombreTocado, setNombreTocado] = useState(false);

  const queryClient = useQueryClient();
  const datosQuery = useQuery({
    queryKey: ['organizacion', 'datos', orgId],
    queryFn: () =>
      apiFetch<{ name: string; settings: OrgSettings | null }>(
        `/perfil/organizacion/datos?organization_id=${encodeURIComponent(orgId)}`
      ),
    staleTime: TTL_CACHE.catalogo,
    refetchOnWindowFocus: false,
  });
  const loading = datosQuery.isPending;
  useEffect(() => {
    if (datosQuery.isError) toast.error("No se pudieron cargar los datos de la organización");
  }, [datosQuery.isError]);

  // Última versión persistida, para guardar solo lo que cambió de verdad.
  const guardadoRef = useRef<{ name: string; limites: LimitesOrg | null }>({
    name: "",
    limites: null,
  });

  const guardarCambios = useCallback(async () => {
    const nombre = orgName.trim();
    const previo = guardadoRef.current;

    if (nombre && nombre !== previo.name) {
      await api.patch("/perfil/organizacion", { organization_id: orgId, name: nombre });
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "rename",
        entity: "organization",
        after: { name: nombre },
      }).catch(() => undefined);
      previo.name = nombre;
    }

    const limites = limitesDe(settings);
    if (
      limites &&
      JSON.stringify(limites) !== JSON.stringify(previo.limites)
    ) {
      await api.put("/perfil/organizacion/settings", {
        organization_id: orgId,
        ...limites,
      });
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "update_limits",
        entity: "org_settings",
        before: previo.limites,
        after: limites,
      }).catch(() => undefined);
      previo.limites = limites;
    }

    void queryClient.invalidateQueries({
      queryKey: ['organizacion', 'datos', orgId],
    });
  }, [orgName, settings, orgId, queryClient]);

  const autoguardado = useAutoguardado(guardarCambios, {
    onError: () => toast.error("No se pudieron guardar los cambios"),
  });

  // Con cambios sin guardar no se sincroniza la query al formulario: un
  // refetch externo pisaría lo que el usuario está editando.
  const editando = autoguardado.estado !== "guardado";

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado de formulario */
  useEffect(() => {
    const res = datosQuery.data;
    if (!res || editando) return;
    setOrgName(res.name);
    setSettings(res.settings);
    guardadoRef.current = { name: res.name, limites: limitesDe(res.settings) };
  }, [datosQuery.data, editando]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const nombreInvalido = !orgName.trim();

  const actualizarNombre = (valor: string) => {
    setOrgName(valor);
    if (!valor.trim()) {
      setNombreTocado(true);
      return;
    }
    autoguardado.marcarSucio();
  };

  const actualizarSettings = (cambios: Partial<OrgSettings>) => {
    if (!settings) return;
    const siguiente = { ...settings, ...cambios };
    setSettings(siguiente);
    const invalido =
      siguiente.daily_hours < 1 ||
      siguiente.daily_hours > 24 ||
      siguiente.weekly_hours < 1 ||
      siguiente.weekly_hours > 168;
    if (!invalido) autoguardado.marcarSucio();
  };

  const limitesInvalidos =
    !!settings &&
    (settings.daily_hours < 1 ||
      settings.daily_hours > 24 ||
      settings.weekly_hours < 1 ||
      settings.weekly_hours > 168);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div>
      <div className="columns-1 gap-6 xl:columns-2">
        <Card className="mb-6 break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">Organización</CardTitle>
            <CardDescription>
              Nombre visible para todos los miembros
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={orgName}
                onChange={(e) => actualizarNombre(e.target.value)}
                onBlur={() => {
                  setNombreTocado(true);
                  autoguardado.guardarYa();
                }}
                aria-invalid={nombreTocado && nombreInvalido}
                placeholder="Mi organización"
              />
              {nombreTocado && nombreInvalido && (
                <p className="text-destructive text-xs">
                  El nombre es obligatorio
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">Límites globales</CardTitle>
            <CardDescription>
              Topes de horas que aplican a toda la organización. Cada miembro
              puede definir variables personales por debajo de estos límites.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Horas diarias</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={settings?.daily_hours ?? 8}
                  onChange={(e) =>
                    actualizarSettings({
                      daily_hours: Number(e.target.value),
                    })
                  }
                  onBlur={() => autoguardado.guardarYa()}
                />
              </div>
              <div className="space-y-2">
                <Label>Horas semanales</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={settings?.weekly_hours ?? 40}
                  onChange={(e) =>
                    actualizarSettings({
                      weekly_hours: Number(e.target.value),
                    })
                  }
                  onBlur={() => autoguardado.guardarYa()}
                />
              </div>
              <div className="space-y-2">
                <Label>Zona horaria</Label>
                <TimezonePicker
                  value={settings?.timezone ?? "America/Mexico_City"}
                  onChange={(timezone) => actualizarSettings({ timezone })}
                />
              </div>
            </div>
            {limitesInvalidos && (
              <p className="text-destructive text-xs">
                Las horas deben estar entre 1 y 24 (día) y 1 y 168 (semana).
                No se guardará hasta corregirlo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <BarraEstadoGuardado
        estado={autoguardado.estado}
        onReintentar={autoguardado.reintentar}
        mensajeError="No se pudieron guardar los cambios"
      />
    </div>
  );
}
