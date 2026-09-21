"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePerfil } from "@/lib/use-perfil";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, Clock, Send, Database } from "lucide-react";
import { OrganizacionTab } from "./organizacion-tab";
import { TurnosTab } from "./turnos-tab";
import { TelegramTab } from "./telegram-tab";
import { DatosTab } from "./datos-tab";
import { PageHeader } from "@/components/layout/page-header";

export default function ConfiguracionPage() {
  const router = useRouter();
  const perfilQuery = usePerfil();
  const profile = perfilQuery.data?.profile ?? null;

  useEffect(() => {
    if (profile?.role && profile.role !== "admin") {
      router.replace('/calendario');
    }
  }, [profile, router]);

  if (perfilQuery.isPending) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  const denied = !profile || profile.blocked;

  if (denied || !profile.organization_id) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Acceso denegado</p>
        <p className="text-sm">
          Solo administradores pueden ver la configuración de la organización.
        </p>
      </div>
    );
  }

  const orgId = profile.organization_id;

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" />

      <Tabs defaultValue="organizacion">
        <TabsList>
          <TabsTrigger value="organizacion">
            <Building2 />
            Organización
          </TabsTrigger>
          <TabsTrigger value="turnos">
            <Clock />
            Turnos
          </TabsTrigger>
          <TabsTrigger value="telegram">
            <Send />
            Telegram
          </TabsTrigger>
          <TabsTrigger value="datos">
            <Database />
            Datos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizacion" className="mt-4">
          <OrganizacionTab orgId={orgId} />
        </TabsContent>
        <TabsContent value="turnos" className="mt-4">
          <TurnosTab orgId={orgId} />
        </TabsContent>
        <TabsContent value="telegram" className="mt-4">
          <TelegramTab orgId={orgId} />
        </TabsContent>
        <TabsContent value="datos" className="mt-4">
          <DatosTab orgId={orgId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
