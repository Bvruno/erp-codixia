import { Building2, CircleDollarSign, Inbox, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaEncabezado,
  TablaFila,
} from '@/components/ui/tabla';
import { Alerta, Etiqueta } from '@/components/ui/alerta';
import { BadgeSolicitud } from '@/components/estado';
import { useDatos } from '@/lib/use-datos';
import { formatearDinero } from '@/lib/formato';
import { ESTADOS_SOLICITUD, type EstadisticasPlataforma } from '@erp/shared/plataforma';

function Tarjeta({
  titulo,
  valor,
  detalle,
  icono: Icono,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  icono: typeof Building2;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Etiqueta>{titulo}</Etiqueta>
          <p className="text-2xl font-semibold">{valor}</p>
          {detalle && <p className="text-muted-foreground text-xs">{detalle}</p>}
        </div>
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
          <Icono className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

export function EstadisticasPage() {
  const { datos, cargando, error } = useDatos<{ data: EstadisticasPlataforma }>(
    '/plataforma/estadisticas'
  );

  if (cargando) return <p className="text-muted-foreground text-sm">Cargando métricas…</p>;
  if (error) return <Alerta>{error}</Alerta>;
  if (!datos) return null;

  const e = datos.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Resumen</h1>
        <p className="text-muted-foreground text-sm">
          Estado general del SaaS: empresas, solicitudes, planes y uso.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta
          titulo="Empresas"
          valor={String(e.empresas.total)}
          detalle={`${e.empresas.activas} activas · ${e.empresas.suspendidas} suspendidas`}
          icono={Building2}
        />
        <Tarjeta
          titulo="Nuevas (30 días)"
          valor={String(e.empresas.nuevas_30d)}
          detalle="Empresas creadas en el periodo"
          icono={Building2}
        />
        <Tarjeta
          titulo="Solicitudes pendientes"
          valor={String(e.solicitudes.pendiente + e.solicitudes.en_revision)}
          detalle={`${e.solicitudes.invitada} invitadas · ${e.solicitudes.rechazada} rechazadas`}
          icono={Inbox}
        />
        <Tarjeta
          titulo="MRR estimado"
          valor={formatearDinero(e.mrr_estimado)}
          detalle={`Cobrado 30d: ${formatearDinero(e.uso.cobrado_30d)}`}
          icono={CircleDollarSign}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso de la plataforma</CardTitle>
            <CardDescription>Actividad agregada de todas las empresas.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Etiqueta>Miembros totales</Etiqueta>
              <p className="text-lg font-semibold">{e.uso.miembros_totales}</p>
            </div>
            <div>
              <Etiqueta>Activos 30 días</Etiqueta>
              <p className="text-lg font-semibold">{e.uso.miembros_activos_30d}</p>
            </div>
            <div>
              <Etiqueta>Tareas abiertas</Etiqueta>
              <p className="text-lg font-semibold">{e.uso.tareas_abiertas}</p>
            </div>
            <div>
              <Etiqueta>Documentos</Etiqueta>
              <p className="text-lg font-semibold">{e.uso.documentos}</p>
            </div>
            <div className="col-span-2 flex items-center gap-2 text-sm">
              <Users className="text-muted-foreground size-4" />
              <span className="text-muted-foreground">
                Facturado 30d: {formatearDinero(e.uso.facturado_30d)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Solicitudes por estado</CardTitle>
            <CardDescription>Embudo de admisión de owners.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ESTADOS_SOLICITUD.map((estado) => (
              <div key={estado} className="flex items-center justify-between gap-3">
                <BadgeSolicitud estado={estado} />
                <span className="text-sm font-medium">{e.solicitudes[estado]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresas por plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabla>
            <TablaEncabezado>
              <TablaFila>
                <TablaCabecera>Plan</TablaCabecera>
                <TablaCabecera>Empresas</TablaCabecera>
                <TablaCabecera>MRR</TablaCabecera>
              </TablaFila>
            </TablaEncabezado>
            <TablaCuerpo>
              {e.planes.map((plan) => (
                <TablaFila key={plan.plan_id}>
                  <TablaCelda className="font-medium">{plan.plan_nombre}</TablaCelda>
                  <TablaCelda>{plan.empresas}</TablaCelda>
                  <TablaCelda>{formatearDinero(plan.mrr)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </CardContent>
      </Card>
    </div>
  );
}
