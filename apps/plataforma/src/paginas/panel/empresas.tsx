import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Copy, Plus, RefreshCw } from 'lucide-react';
import type { EmpresaPlataforma, Plan } from '@erp/shared/plataforma';
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
import { BadgeEmpresa } from '@/components/estado';
import { Paginacion } from '@/components/paginacion';
import { useDatos } from '@/lib/use-datos';
import { crearEmpresa, listarPlanes } from '@/lib/api/panel';
import { formatearFecha, hace } from '@/lib/formato';

export function EmpresasPage() {
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);

  const [planes, setPlanes] = useState<Plan[]>([]);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nombre, setNombre] = useState('');
  const [emailOwner, setEmailOwner] = useState('');
  const [planNuevo, setPlanNuevo] = useState('');
  const [dias, setDias] = useState(14);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const consulta = `/plataforma/empresas?estado=${estado}&plan=${plan}&q=${encodeURIComponent(q)}&page=${page}`;
  const { datos, cargando, error, recargar } = useDatos<{
    data: EmpresaPlataforma[];
    total: number;
    page: number;
    pageSize: number;
  }>(consulta);

  useEffect(() => {
    listarPlanes()
      .then((res) => setPlanes(res.data))
      .catch(() => setPlanes([]));
  }, []);

  async function alta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setAviso(null);
    try {
      const res = await crearEmpresa({
        nombre,
        email_owner: emailOwner || null,
        plan_id: planNuevo || null,
        dias_invitacion: dias,
      });
      setEnlace(res.link);
      setNombre('');
      setEmailOwner('');
      recargar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo crear la empresa');
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (!enlace) return;
    await navigator.clipboard.writeText(enlace);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Empresas</h1>
          <p className="text-muted-foreground text-sm">
            Owners activos, plan asignado y estado de la empresa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={recargar}>
            <RefreshCw />
            Actualizar
          </Button>
          <Button size="sm" onClick={() => setMostrarAlta((v) => !v)}>
            <Plus />
            Nueva empresa
          </Button>
        </div>
      </div>

      {mostrarAlta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitar owner directo</CardTitle>
            <p className="text-muted-foreground text-sm">
              Crea la empresa y genera el link de invitación sin pasar por solicitudes.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={alta} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
              <div className="space-y-1 lg:col-span-2">
                <Label htmlFor="nombre-empresa">Nombre de la empresa</Label>
                <Input
                  id="nombre-empresa"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-owner">Correo del owner (opcional)</Label>
                <Input
                  id="email-owner"
                  type="email"
                  value={emailOwner}
                  onChange={(e) => setEmailOwner(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Plan</Label>
                <select
                  value={planNuevo}
                  onChange={(e) => setPlanNuevo(e.target.value)}
                  className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">Sin plan</option>
                  {planes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dias-nuevo">Días</Label>
                <Input
                  id="dias-nuevo"
                  type="number"
                  min={1}
                  max={90}
                  value={dias}
                  onChange={(e) => setDias(Number(e.target.value))}
                />
              </div>
              <Button type="submit" disabled={ocupado} className="lg:col-span-5 lg:justify-self-start">
                Crear empresa e invitación
              </Button>
            </form>
            {enlace && (
              <div className="space-y-2 rounded-md border p-3">
                <Label>Link de invitación</Label>
                <div className="flex gap-2">
                  <Input readOnly value={enlace} />
                  <Button variant="outline" onClick={copiar}>
                    <Copy />
                    {copiado ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="estado-empresa">Estado</Label>
          <select
            id="estado-empresa"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
            className="border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Todas</option>
            <option value="activa">Activas</option>
            <option value="suspendida">Suspendidas</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-empresa">Plan</Label>
          <select
            id="plan-empresa"
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
            className="border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">Todos</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
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
            <Label htmlFor="q-empresa">Buscar</Label>
            <Input
              id="q-empresa"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre de la empresa"
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
            <p className="text-muted-foreground py-6 text-sm">Cargando empresas…</p>
          ) : (
            <Tabla>
              <TablaEncabezado>
                <TablaFila>
                  <TablaCabecera>Empresa</TablaCabecera>
                  <TablaCabecera>Owner</TablaCabecera>
                  <TablaCabecera>Plan</TablaCabecera>
                  <TablaCabecera>Miembros</TablaCabecera>
                  <TablaCabecera>Creada</TablaCabecera>
                  <TablaCabecera>Última actividad</TablaCabecera>
                  <TablaCabecera>Estado</TablaCabecera>
                </TablaFila>
              </TablaEncabezado>
              <TablaCuerpo>
                {(datos?.data ?? []).map((empresa) => (
                  <TablaFila key={empresa.id}>
                    <TablaCelda>
                      <Link
                        to="/empresas/$id"
                        params={{ id: empresa.id }}
                        className="font-medium hover:underline"
                      >
                        {empresa.nombre}
                      </Link>
                    </TablaCelda>
                    <TablaCelda>
                      <p>{empresa.owner_nombre ?? 'Sin dueño'}</p>
                      <p className="text-muted-foreground text-xs">{empresa.owner_email ?? '—'}</p>
                    </TablaCelda>
                    <TablaCelda>{empresa.plan_nombre ?? '—'}</TablaCelda>
                    <TablaCelda>
                      {empresa.miembros}
                      <span className="text-muted-foreground text-xs">
                        {' '}
                        ({empresa.miembros_activos_30d} activos)
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-muted-foreground text-xs">
                      {formatearFecha(empresa.creada_at)}
                    </TablaCelda>
                    <TablaCelda className="text-muted-foreground text-xs">
                      {hace(empresa.ultima_actividad)}
                    </TablaCelda>
                    <TablaCelda>
                      <BadgeEmpresa estado={empresa.estado} />
                    </TablaCelda>
                  </TablaFila>
                ))}
                {(datos?.data ?? []).length === 0 && (
                  <TablaFila>
                    <TablaCelda colSpan={7} className="text-muted-foreground py-8 text-center">
                      Sin empresas para este filtro.
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
