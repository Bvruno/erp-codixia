import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import type {
  EntradaAuditoriaPlataforma,
  EstadoSuscripcion,
  Factura,
  Plan,
} from '@erp/shared/plataforma';
import { ESTADOS_SUSCRIPCION } from '@erp/shared/plataforma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaEncabezado,
  TablaFila,
} from '@/components/ui/tabla';
import { Alerta, Dato } from '@/components/ui/alerta';
import { BadgeEmpresa, BadgeFactura, BadgeSuscripcion } from '@/components/estado';
import { useDatos } from '@/lib/use-datos';
import {
  actualizarFactura,
  crearFactura,
  eliminarEmpresa,
  guardarSuscripcion,
  listarAuditoria,
  listarPlanes,
  reactivarEmpresa,
  suspenderEmpresa,
  type EmpresaDetalle,
} from '@/lib/api/panel';
import { formatearDinero, formatearFechaHora, periodoActual } from '@/lib/formato';

export function EmpresaDetallePage() {
  const { id } = useParams({ from: '/_panel/empresas/$id' });
  const { datos, cargando, error, recargar } = useDatos<{ data: EmpresaDetalle }>(
    `/plataforma/empresas/${id}`
  );

  const [planes, setPlanes] = useState<Plan[]>([]);
  const [motivo, setMotivo] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [auditoria, setAuditoria] = useState<EntradaAuditoriaPlataforma[]>([]);

  useEffect(() => {
    listarPlanes()
      .then((res) => setPlanes(res.data))
      .catch(() => setPlanes([]));
  }, []);

  useEffect(() => {
    listarAuditoria({ entidad_tipo: 'organization', entidad_id: id })
      .then((res) => setAuditoria(res.data))
      .catch(() => setAuditoria([]));
  }, [id, datos]);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
      setAviso(mensaje);
      recargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo completar la acción');
    } finally {
      setOcupado(false);
    }
  }

  if (cargando) return <p className="text-muted-foreground text-sm">Cargando empresa…</p>;
  if (error) return <Alerta>{error}</Alerta>;
  if (!datos) return null;

  const empresa = datos.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/empresas"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeft className="size-3" />
            Empresas
          </Link>
          <h1 className="text-xl font-semibold">{empresa.nombre}</h1>
          <div className="flex items-center gap-2">
            <BadgeEmpresa estado={empresa.estado} />
            {empresa.suscripcion && <BadgeSuscripcion estado={empresa.suscripcion.estado} />}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={recargar}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      {aviso && <Alerta tipo="info">{aviso}</Alerta>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información general</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="Owner">{empresa.owner_nombre ?? 'Sin dueño'}</Dato>
          <Dato etiqueta="Correo del owner">{empresa.owner_email ?? '—'}</Dato>
          <Dato etiqueta="Creada">{formatearFechaHora(empresa.creada_at)}</Dato>
          <Dato etiqueta="Última actividad">{formatearFechaHora(empresa.ultima_actividad)}</Dato>
          <Dato etiqueta="Miembros">
            {empresa.miembros} ({empresa.miembros_activos_30d} activos 30d)
          </Dato>
          <Dato etiqueta="Tareas abiertas">{empresa.uso.tareas_abiertas}</Dato>
          <Dato etiqueta="Tareas totales">{empresa.uso.tareas_total}</Dato>
          <Dato etiqueta="Documentos / formularios">
            {empresa.uso.documentos} / {empresa.uso.formularios}
          </Dato>
          {empresa.estado === 'suspendida' && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Alerta tipo="error">
                Suspendida el {formatearFechaHora(empresa.suspendida_at)} —{' '}
                {empresa.suspension_motivo ?? 'sin motivo registrado'}
              </Alerta>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suscripción</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioSuscripcion
              key={`${empresa.id}-${empresa.suscripcion?.updated_at ?? 'sin-suscripcion'}`}
              empresa={empresa}
              planes={planes}
              onGuardado={(mensaje) => {
                setAviso(mensaje);
                if (!mensaje.startsWith('No')) recargar();
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acciones de la empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {empresa.estado === 'activa' ? (
              <div className="space-y-2">
                <Label htmlFor="motivo-suspension">Suspender empresa</Label>
                <div className="flex gap-2">
                  <Input
                    id="motivo-suspension"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo (obligatorio)"
                  />
                  <Button
                    variant="destructive"
                    disabled={ocupado || !motivo.trim()}
                    onClick={() =>
                      accion(() => suspenderEmpresa(id, motivo.trim()), 'Empresa suspendida')
                    }
                  >
                    Suspender
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Bloquea el acceso de todos los miembros; los datos quedan intactos.
                </p>
              </div>
            ) : (
              <Button
                variant="secondary"
                disabled={ocupado}
                onClick={() => accion(() => reactivarEmpresa(id), 'Empresa reactivada')}
              >
                Reactivar empresa
              </Button>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="confirmacion-eliminar" className="text-destructive">
                Eliminar definitivamente
              </Label>
              <div className="flex gap-2">
                <Input
                  id="confirmacion-eliminar"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder={`Escribe "${empresa.nombre}"`}
                />
                <Button
                  variant="destructive"
                  disabled={ocupado || confirmacion !== empresa.nombre}
                  onClick={() =>
                    accion(() => eliminarEmpresa(id, confirmacion), 'Empresa eliminada')
                  }
                >
                  <AlertTriangle />
                  Eliminar
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Borra la empresa y todos sus datos en cascada. Exporta antes si necesitas
                respaldo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facturación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <NuevaFactura organizationId={id} onCreada={recargar} />
          <Tabla>
            <TablaEncabezado>
              <TablaFila>
                <TablaCabecera>Periodo</TablaCabecera>
                <TablaCabecera>Monto</TablaCabecera>
                <TablaCabecera>Estado</TablaCabecera>
                <TablaCabecera>Pagada</TablaCabecera>
                <TablaCabecera />
              </TablaFila>
            </TablaEncabezado>
            <TablaCuerpo>
              {empresa.facturas.map((factura: Factura) => (
                <TablaFila key={factura.id}>
                  <TablaCelda>{factura.periodo}</TablaCelda>
                  <TablaCelda>{formatearDinero(factura.monto, factura.moneda)}</TablaCelda>
                  <TablaCelda>
                    <BadgeFactura estado={factura.estado} />
                  </TablaCelda>
                  <TablaCelda className="text-muted-foreground text-xs">
                    {factura.pagado_at ? formatearFechaHora(factura.pagado_at) : '—'}
                  </TablaCelda>
                  <TablaCelda className="text-right">
                    {factura.estado !== 'pagada' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          accion(
                            () => actualizarFactura(factura.id, { estado: 'pagada' }),
                            'Factura marcada como pagada'
                          )
                        }
                      >
                        Marcar pagada
                      </Button>
                    )}
                  </TablaCelda>
                </TablaFila>
              ))}
              {empresa.facturas.length === 0 && (
                <TablaFila>
                  <TablaCelda colSpan={5} className="text-muted-foreground py-6 text-center">
                    Sin facturas registradas.
                  </TablaCelda>
                </TablaFila>
              )}
            </TablaCuerpo>
          </Tabla>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditoría de la empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabla>
            <TablaEncabezado>
              <TablaFila>
                <TablaCabecera>Fecha</TablaCabecera>
                <TablaCabecera>Actor</TablaCabecera>
                <TablaCabecera>Acción</TablaCabecera>
              </TablaFila>
            </TablaEncabezado>
            <TablaCuerpo>
              {auditoria.map((entrada) => (
                <TablaFila key={entrada.id}>
                  <TablaCelda className="text-muted-foreground text-xs">
                    {formatearFechaHora(entrada.created_at)}
                  </TablaCelda>
                  <TablaCelda className="text-xs">{entrada.actor_email ?? '—'}</TablaCelda>
                  <TablaCelda className="text-xs">{entrada.accion}</TablaCelda>
                </TablaFila>
              ))}
              {auditoria.length === 0 && (
                <TablaFila>
                  <TablaCelda colSpan={3} className="text-muted-foreground py-6 text-center">
                    Sin acciones registradas.
                  </TablaCelda>
                </TablaFila>
              )}
            </TablaCuerpo>
          </Tabla>
        </CardContent>
      </Card>
    </div>
  );
}

function FormularioSuscripcion({
  empresa,
  planes,
  onGuardado,
}: {
  empresa: EmpresaDetalle;
  planes: Plan[];
  onGuardado: (mensaje: string) => void;
}) {
  const sub = empresa.suscripcion;
  const [planId, setPlanId] = useState(sub?.plan_id ?? empresa.plan_id ?? '');
  const [estadoSub, setEstadoSub] = useState<EstadoSuscripcion>(
    (sub?.estado as EstadoSuscripcion) ?? 'activa'
  );
  const [precio, setPrecio] = useState(
    sub?.precio_acordado != null ? String(sub.precio_acordado) : ''
  );
  const [notasSub, setNotasSub] = useState(sub?.notas ?? '');
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setOcupado(true);
    try {
      await guardarSuscripcion(empresa.id, {
        plan_id: planId,
        estado: estadoSub,
        precio_acordado: precio === '' ? null : Number(precio),
        notas: notasSub || null,
      });
      onGuardado('Suscripción actualizada');
    } catch (e) {
      onGuardado(e instanceof Error ? e.message : 'No se pudo guardar la suscripción');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Plan</Label>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Sin plan</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {formatearDinero(p.precio_mensual, p.moneda)}/mes
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Estado</Label>
          <select
            value={estadoSub}
            onChange={(e) => setEstadoSub(e.target.value as EstadoSuscripcion)}
            className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            {ESTADOS_SUSCRIPCION.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="precio">Precio acordado (opcional)</Label>
          <Input
            id="precio"
            type="number"
            min={0}
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="notas-sub">Notas</Label>
        <Textarea
          id="notas-sub"
          rows={2}
          value={notasSub}
          onChange={(e) => setNotasSub(e.target.value)}
        />
      </div>
      <Button disabled={ocupado || !planId} onClick={guardar}>
        Guardar suscripción
      </Button>
    </div>
  );
}

function NuevaFactura({
  organizationId,
  onCreada,
}: {
  organizationId: string;
  onCreada: () => void;
}) {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [monto, setMonto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      await crearFactura({
        organization_id: organizationId,
        periodo,
        monto: Number(monto),
      });
      setMonto('');
      onCreada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la factura');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={crear} className="grid gap-3 sm:grid-cols-[10rem_10rem_auto] sm:items-end">
      <div className="space-y-1">
        <Label htmlFor="periodo">Periodo (AAAA-MM)</Label>
        <Input
          id="periodo"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          pattern="\d{4}-\d{2}"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="monto">Monto</Label>
        <Input
          id="monto"
          type="number"
          min={0}
          step="0.01"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
        />
      </div>
      <Button type="submit" variant="outline" disabled={ocupado}>
        Registrar factura
      </Button>
      {error && (
        <div className="sm:col-span-3">
          <Alerta>{error}</Alerta>
        </div>
      )}
    </form>
  );
}
