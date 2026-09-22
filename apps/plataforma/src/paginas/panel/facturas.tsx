import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { EmpresaPlataforma, Factura } from '@erp/shared/plataforma';
import { ESTADOS_FACTURA } from '@erp/shared/plataforma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { BadgeFactura } from '@/components/estado';
import { Paginacion } from '@/components/paginacion';
import { useDatos } from '@/lib/use-datos';
import {
  actualizarFactura,
  crearFactura,
  listarEmpresas,
} from '@/lib/api/panel';
import { formatearDinero, formatearFecha, periodoActual } from '@/lib/formato';

export function FacturasPage() {
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);
  const [empresas, setEmpresas] = useState<EmpresaPlataforma[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [periodo, setPeriodo] = useState(periodoActual());
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState('USD');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const { datos, cargando, error, recargar } = useDatos<{
    data: Factura[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/plataforma/facturas?estado=${estado}&page=${page}`);

  useEffect(() => {
    listarEmpresas({ page: 1 })
      .then((res) => setEmpresas(res.data))
      .catch(() => setEmpresas([]));
  }, []);

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setAviso(null);
    try {
      await crearFactura({
        organization_id: organizationId,
        periodo,
        monto: Number(monto),
        moneda,
      });
      setMonto('');
      setAviso('Factura registrada');
      recargar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo registrar la factura');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Facturación</h1>
          <p className="text-muted-foreground text-sm">
            Registro manual de cobros por empresa (sin pasarela de pago).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar factura</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={crear}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          >
            <div className="space-y-1 lg:col-span-2">
              <Label>Empresa</Label>
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                required
                className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">Selecciona…</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="factura-periodo">Periodo</Label>
              <Input
                id="factura-periodo"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                pattern="\d{4}-\d{2}"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="factura-monto">Monto</Label>
              <Input
                id="factura-monto"
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="factura-moneda">Moneda</Label>
              <Input
                id="factura-moneda"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                maxLength={8}
              />
            </div>
            <Button type="submit" disabled={ocupado} className="lg:col-span-5 lg:justify-self-start">
              Registrar
            </Button>
          </form>
          {aviso && (
            <div className="mt-3">
              <Alerta tipo="info">{aviso}</Alerta>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="factura-estado">Estado</Label>
          <select
            id="factura-estado"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
            className="border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Todas</option>
            {ESTADOS_FACTURA.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <Alerta>{error}</Alerta>}

      <Card>
        <CardContent>
          {cargando ? (
            <p className="text-muted-foreground py-6 text-sm">Cargando facturas…</p>
          ) : (
            <Tabla>
              <TablaEncabezado>
                <TablaFila>
                  <TablaCabecera>Empresa</TablaCabecera>
                  <TablaCabecera>Periodo</TablaCabecera>
                  <TablaCabecera>Monto</TablaCabecera>
                  <TablaCabecera>Estado</TablaCabecera>
                  <TablaCabecera>Creada</TablaCabecera>
                  <TablaCabecera />
                </TablaFila>
              </TablaEncabezado>
              <TablaCuerpo>
                {(datos?.data ?? []).map((factura) => (
                  <TablaFila key={factura.id}>
                    <TablaCelda>{factura.empresa_nombre ?? factura.organization_id}</TablaCelda>
                    <TablaCelda>{factura.periodo}</TablaCelda>
                    <TablaCelda>{formatearDinero(factura.monto, factura.moneda)}</TablaCelda>
                    <TablaCelda>
                      <BadgeFactura estado={factura.estado} />
                    </TablaCelda>
                    <TablaCelda className="text-muted-foreground text-xs">
                      {formatearFecha(factura.created_at)}
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      {factura.estado !== 'pagada' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await actualizarFactura(factura.id, { estado: 'pagada' });
                            recargar();
                          }}
                        >
                          Marcar pagada
                        </Button>
                      )}
                    </TablaCelda>
                  </TablaFila>
                ))}
                {(datos?.data ?? []).length === 0 && (
                  <TablaFila>
                    <TablaCelda colSpan={6} className="text-muted-foreground py-8 text-center">
                      Sin facturas registradas.
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
