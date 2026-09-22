import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, X } from 'lucide-react';
import type { Plan, SolicitudOwner } from '@erp/shared/plataforma';
import { ESTADOS_SOLICITUD } from '@erp/shared/plataforma';
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
import { BadgeSolicitud } from '@/components/estado';
import { Paginacion } from '@/components/paginacion';
import { useDatos } from '@/lib/use-datos';
import {
  actualizarSolicitud,
  aprobarSolicitud,
  listarPlanes,
  rechazarSolicitud,
} from '@/lib/api/panel';
import { formatearFechaHora } from '@/lib/formato';

const ETIQUETAS_ESTADO: Record<string, string> = {
  '': 'Todas',
  pendiente: 'Pendientes',
  en_revision: 'En revisión',
  aprobada: 'Aprobadas',
  rechazada: 'Rechazadas',
  invitada: 'Invitadas',
  activada: 'Activadas',
};

export function SolicitudesPage() {
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [seleccionada, setSeleccionada] = useState<SolicitudOwner | null>(null);

  const [planes, setPlanes] = useState<Plan[]>([]);
  const [notas, setNotas] = useState('');
  const [planId, setPlanId] = useState('');
  const [dias, setDias] = useState(14);
  const [motivo, setMotivo] = useState('');
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const consulta = `/plataforma/solicitudes?estado=${estado}&q=${encodeURIComponent(q)}&page=${page}`;
  const { datos, cargando, error, recargar } = useDatos<{
    data: SolicitudOwner[];
    total: number;
    page: number;
    pageSize: number;
  }>(consulta);

  useEffect(() => {
    listarPlanes()
      .then((res) => setPlanes(res.data))
      .catch(() => setPlanes([]));
  }, []);

  function abrir(solicitud: SolicitudOwner) {
    setSeleccionada(solicitud);
    setEnlace(null);
    setMotivo('');
    setCopiado(false);
    setNotas(solicitud.notas_admin ?? '');
  }

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

  async function copiarEnlace() {
    if (!enlace) return;
    await navigator.clipboard.writeText(enlace);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Solicitudes</h1>
          <p className="text-muted-foreground text-sm">
            Revisa y aprueba el ingreso de nuevos owners.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="filtro-estado">Estado</Label>
          <select
            id="filtro-estado"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
            className="border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {['', ...ESTADOS_SOLICITUD].map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETAS_ESTADO[valor] ?? valor}
              </option>
            ))}
          </select>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(busqueda);
            setPage(1);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="filtro-q">Buscar</Label>
            <Input
              id="filtro-q"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Empresa, correo o nombre"
              className="w-64"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
      </div>

      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="info">{aviso}</Alerta>}

      <Card>
        <CardContent>
          {cargando ? (
            <p className="text-muted-foreground py-6 text-sm">Cargando solicitudes…</p>
          ) : (
            <Tabla>
              <TablaEncabezado>
                <TablaFila>
                  <TablaCabecera>Empresa</TablaCabecera>
                  <TablaCabecera>Contacto</TablaCabecera>
                  <TablaCabecera>Recibida</TablaCabecera>
                  <TablaCabecera>Estado</TablaCabecera>
                  <TablaCabecera />
                </TablaFila>
              </TablaEncabezado>
              <TablaCuerpo>
                {(datos?.data ?? []).map((solicitud) => (
                  <TablaFila key={solicitud.id}>
                    <TablaCelda>
                      <p className="font-medium">{solicitud.empresa}</p>
                      <p className="text-muted-foreground text-xs">
                        {solicitud.sector ?? 'Sin sector'} · {solicitud.pais ?? 'Sin país'}
                      </p>
                    </TablaCelda>
                    <TablaCelda>
                      <p>{solicitud.nombre_contacto}</p>
                      <p className="text-muted-foreground text-xs">{solicitud.email}</p>
                    </TablaCelda>
                    <TablaCelda className="text-muted-foreground text-xs">
                      {formatearFechaHora(solicitud.created_at)}
                    </TablaCelda>
                    <TablaCelda>
                      <BadgeSolicitud estado={solicitud.estado} />
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => abrir(solicitud)}
                      >
                        Revisar
                      </Button>
                    </TablaCelda>
                  </TablaFila>
                ))}
                {(datos?.data ?? []).length === 0 && (
                  <TablaFila>
                    <TablaCelda colSpan={5} className="text-muted-foreground py-8 text-center">
                      Sin solicitudes para este filtro.
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

      {seleccionada && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{seleccionada.empresa}</CardTitle>
              <p className="text-muted-foreground text-xs">
                Solicitud {seleccionada.id} · {formatearFechaHora(seleccionada.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <BadgeSolicitud estado={seleccionada.estado} />
              <Button variant="ghost" size="icon" onClick={() => setSeleccionada(null)}>
                <X />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Dato etiqueta="Contacto">
                {seleccionada.nombre_contacto}
                <br />
                <span className="text-muted-foreground text-xs">{seleccionada.email}</span>
              </Dato>
              <Dato etiqueta="Teléfono">{seleccionada.telefono ?? '—'}</Dato>
              <Dato etiqueta="Sitio web">{seleccionada.sitio_web ?? '—'}</Dato>
              <Dato etiqueta="País / sector">
                {seleccionada.pais ?? '—'} · {seleccionada.sector ?? '—'}
              </Dato>
              <Dato etiqueta="Tamaño de equipo">{seleccionada.tamano_equipo ?? '—'}</Dato>
              <Dato etiqueta="Referido por">{seleccionada.referido_por ?? '—'}</Dato>
            </div>

            {seleccionada.motivacion && (
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Motivación
                </p>
                <p className="text-sm whitespace-pre-wrap">{seleccionada.motivacion}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notas">Notas internas</Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                maxLength={2000}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() =>
                    accion(
                      () => actualizarSolicitud(seleccionada.id, { notas_admin: notas }),
                      'Notas guardadas'
                    )
                  }
                >
                  Guardar notas
                </Button>
                {seleccionada.estado === 'pendiente' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={ocupado}
                    onClick={() =>
                      accion(
                        () => actualizarSolicitud(seleccionada.id, { estado: 'en_revision' }),
                        'Solicitud en revisión'
                      )
                    }
                  >
                    Marcar en revisión
                  </Button>
                )}
              </div>
            </div>

            {seleccionada.estado !== 'rechazada' && seleccionada.estado !== 'invitada' && (
              <div className="grid gap-4 border-t pt-4 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
                <div className="space-y-1">
                  <Label>Plan</Label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  >
                    <option value="">Sin plan</option>
                    {planes.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dias">Días de vigencia</Label>
                  <Input
                    id="dias"
                    type="number"
                    min={1}
                    max={90}
                    value={dias}
                    onChange={(e) => setDias(Number(e.target.value))}
                  />
                </div>
                <Button
                  disabled={ocupado}
                  onClick={async () => {
                    await accion(async () => {
                      const res = await aprobarSolicitud(seleccionada.id, {
                        plan_id: planId || null,
                        dias_invitacion: dias,
                      });
                      setEnlace(res.link);
                    }, 'Solicitud aprobada');
                  }}
                >
                  <Check />
                  Aprobar e invitar
                </Button>
              </div>
            )}

            {enlace && (
              <div className="space-y-2 rounded-md border p-3">
                <Label>Link de invitación</Label>
                <div className="flex gap-2">
                  <Input readOnly value={enlace} />
                  <Button variant="outline" onClick={copiarEnlace}>
                    <Copy />
                    {copiado ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Envíalo al owner por correo. Expira según los días configurados.
                </p>
              </div>
            )}

            {seleccionada.estado !== 'rechazada' && seleccionada.estado !== 'invitada' && (
              <div className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="motivo">Rechazar</Label>
                  <Input
                    id="motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo del rechazo"
                  />
                </div>
                <Button
                  variant="destructive"
                  disabled={ocupado || !motivo.trim()}
                  onClick={() =>
                    accion(
                      () => rechazarSolicitud(seleccionada.id, motivo.trim()),
                      'Solicitud rechazada'
                    )
                  }
                >
                  Rechazar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
