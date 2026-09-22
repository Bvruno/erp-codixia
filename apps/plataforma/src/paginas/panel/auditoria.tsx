import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { EntradaAuditoriaPlataforma } from '@erp/shared/plataforma';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaEncabezado,
  TablaFila,
} from '@/components/ui/tabla';
import { Alerta } from '@/components/ui/alerta';
import { Paginacion } from '@/components/paginacion';
import { useDatos } from '@/lib/use-datos';
import { formatearFechaHora } from '@/lib/formato';

export function AuditoriaPage() {
  const [entidadTipo, setEntidadTipo] = useState('');
  const [entidadId, setEntidadId] = useState('');
  const [filtros, setFiltros] = useState({ tipo: '', id: '' });
  const [page, setPage] = useState(1);

  const consulta = `/plataforma/auditoria?entidad_tipo=${filtros.tipo}&entidad_id=${encodeURIComponent(
    filtros.id
  )}&page=${page}`;
  const { datos, cargando, error, recargar } = useDatos<{
    data: EntradaAuditoriaPlataforma[];
    total: number;
    page: number;
    pageSize: number;
  }>(consulta);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Auditoría</h1>
          <p className="text-muted-foreground text-sm">
            Historial de acciones realizadas desde la plataforma.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltros({ tipo: entidadTipo, id: entidadId });
          setPage(1);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="tipo">Tipo de entidad</Label>
          <select
            id="tipo"
            value={entidadTipo}
            onChange={(e) => setEntidadTipo(e.target.value)}
            className="border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Todas</option>
            <option value="organization">Empresa</option>
            <option value="owner_application">Solicitud</option>
            <option value="platform_admin">Administrador</option>
            <option value="plan">Plan</option>
            <option value="billing_record">Factura</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="entidad">ID de entidad (opcional)</Label>
          <Input
            id="entidad"
            value={entidadId}
            onChange={(e) => setEntidadId(e.target.value)}
            placeholder="UUID"
            className="w-72"
          />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {error && <Alerta>{error}</Alerta>}

      <Card>
        <CardContent>
          {cargando ? (
            <p className="text-muted-foreground py-6 text-sm">Cargando auditoría…</p>
          ) : (
            <Tabla>
              <TablaEncabezado>
                <TablaFila>
                  <TablaCabecera>Fecha</TablaCabecera>
                  <TablaCabecera>Actor</TablaCabecera>
                  <TablaCabecera>Acción</TablaCabecera>
                  <TablaCabecera>Entidad</TablaCabecera>
                  <TablaCabecera>Detalle</TablaCabecera>
                </TablaFila>
              </TablaEncabezado>
              <TablaCuerpo>
                {(datos?.data ?? []).map((entrada) => (
                  <TablaFila key={entrada.id}>
                    <TablaCelda className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatearFechaHora(entrada.created_at)}
                    </TablaCelda>
                    <TablaCelda className="text-xs">{entrada.actor_email ?? '—'}</TablaCelda>
                    <TablaCelda className="font-medium">{entrada.accion}</TablaCelda>
                    <TablaCelda className="text-muted-foreground text-xs">
                      {entrada.entidad_tipo ?? '—'}
                      {entrada.entidad_id ? ` · ${entrada.entidad_id.slice(0, 8)}…` : ''}
                    </TablaCelda>
                    <TablaCelda className="text-muted-foreground max-w-80 truncate text-xs">
                      {JSON.stringify(entrada.payload)}
                    </TablaCelda>
                  </TablaFila>
                ))}
                {(datos?.data ?? []).length === 0 && (
                  <TablaFila>
                    <TablaCelda colSpan={5} className="text-muted-foreground py-8 text-center">
                      Sin acciones registradas.
                    </TablaCelda>
                  </TablaFila>
                )}
              </TablaCuerpo>
            </Tabla>
          )}
          {datos && (
            <Paginacion
              page={datos.page}
              pageSize={datos.pageSize}
              total={datos.total}
              onCambiar={setPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
