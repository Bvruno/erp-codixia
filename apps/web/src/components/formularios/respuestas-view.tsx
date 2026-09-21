'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  Download,
  Loader2,
  RefreshCw,
  Table2,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { api, apiFetch } from '@/lib/api/cliente';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { entitySlug } from '@/lib/slugs';
import { useTareas } from '@/components/tareas/tareas-context';
import { resumenRespuestas, isFullUuid, valorLegible } from '@erp/shared';
import { resolverFormularioActual } from './utils';
import { MigrarRespuestasDialog } from './migrar-respuestas-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  Formulario,
  FormularioEsquema,
  FormularioRespuesta,
  PreguntaFormulario,
  ResumenPregunta,
} from '@/types';

// Capa 3: dashboard de respuestas (resumen con gráficas + individuales).

const COLOR_BARRA = '#6366f1';

function preguntasDe(esquema: FormularioEsquema): PreguntaFormulario[] {
  return esquema.secciones.flatMap((s) => s.preguntas);
}

function GraficaConteos({ resumen }: { resumen: ResumenPregunta }) {
  const datos = resumen.conteos ?? [];
  if (datos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin respuestas todavía.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="etiqueta"
            width={130}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(valor) => [`${String(valor)}`, 'Respuestas']}
            labelFormatter={(etiqueta) => String(etiqueta)}
          />
          <Bar dataKey="conteo" radius={[0, 4, 4, 0]}>
            {datos.map((d) => (
              <Cell key={d.valor} fill={COLOR_BARRA} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TarjetaResumenPregunta({ resumen }: { resumen: ResumenPregunta }) {
  return (
    <Card className="gap-0 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{resumen.titulo || 'Pregunta sin título'}</p>
        <span className="shrink-0 text-xs text-muted-foreground">
          {resumen.total} respuesta{resumen.total === 1 ? '' : 's'}
        </span>
      </div>

      {resumen.conteos && <GraficaConteos resumen={resumen} />}

      {resumen.tipo === 'numero' && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold">{resumen.promedio ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Promedio</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{resumen.minimo ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Mínimo</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{resumen.maximo ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Máximo</p>
          </div>
        </div>
      )}

      {resumen.tipo === 'escala' && resumen.promedio != null && (
        <p className="mt-3 text-sm text-muted-foreground">
          Promedio: <span className="font-semibold text-foreground">{resumen.promedio}</span>
        </p>
      )}

      {resumen.textos && (
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {resumen.textos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin respuestas todavía.</p>
          ) : (
            resumen.textos.map((t, i) => (
              <p key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
                {t}
              </p>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

export function RespuestasView({ formularioId: paramId }: { formularioId: string }) {
  const ctx = useTareas();
  const router = useRouter();

  const [form, setForm] = useState<Formulario | null>(null);
  const [respuestas, setRespuestas] = useState<FormularioRespuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [nuevas, setNuevas] = useState(0);
  const [migrarAbierto, setMigrarAbierto] = useState(false);
  const primerasRef = useRef(true);

  // Igual que la vista del editor: tolera slug viejo tras renombrar.
  const entidad = ctx.loading
    ? undefined
    : resolverFormularioActual(paramId, ctx.formularios, form?.id);
  const id = entidad?.id ?? (ctx.loading ? null : isFullUuid(paramId) ? paramId : null);
  const canManage = id ? ctx.canManageEntity('formulario', id) : false;

  const cargar = useCallback(async () => {
    if (!id) return;
    const [resForm, resResp] = await Promise.all([
      apiFetch<{ formulario: Formulario }>(`/formularios/${id}`),
      apiFetch<{ respuestas: FormularioRespuesta[] }>(`/formularios/${id}/respuestas`),
    ]);
    setForm(resForm.formulario);
    setRespuestas(resResp.respuestas ?? []);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    primerasRef.current = true;
    void (async () => {
      setLoading(true);
      try {
        await cargar();
      } catch {
        if (activo) toast.error('No se pudieron cargar las respuestas');
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [id, cargar]);

  // Realtime: aviso y refresco automático cuando llega una respuesta.
  useEffect(() => {
    if (!id || !ctx.organizationId) return;
    const canal = canalRealtime(`formulario-respuestas-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'formulario_respuestas',
          filter: `formulario_id=eq.${id}`,
        },
        () => {
          if (primerasRef.current) {
            primerasRef.current = false;
            return;
          }
          setNuevas((n) => n + 1);
          toast.info('Nueva respuesta recibida');
          void cargar();
        }
      )
      .subscribe();
    primerasRef.current = false;
    return () => removerCanal(canal);
  }, [id, ctx.organizationId, cargar]);

  const esquema = useMemo<FormularioEsquema>(
    () => form?.esquema ?? { version: 1, secciones: [] },
    [form]
  );
  const preguntas = useMemo(() => preguntasDe(esquema), [esquema]);
  const resumen = useMemo(
    () => resumenRespuestas(esquema, respuestas.map((r) => r.respuestas)),
    [esquema, respuestas]
  );

  const refrescar = async () => {
    setRefrescando(true);
    try {
      await cargar();
      setNuevas(0);
    } finally {
      setRefrescando(false);
    }
  };

  const exportarCsv = () => {
    const cabecera = ['Fecha', 'Persona', 'Consentimiento', ...preguntas.map((p) => p.titulo)];
    const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const filas = respuestas.map((r) => [
      new Date(r.created_at).toLocaleString(),
      r.invitado_nombre ?? (r.profile_id ? 'Miembro' : r.identificador_hash ? 'Identificado' : 'Anónimo'),
      r.consentimiento ? 'Sí' : 'No',
      ...preguntas.map((p) => valorLegible(p, r.respuestas[p.id])),
    ]);
    const csv = [cabecera, ...filas].map((f) => f.map(escapar).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form?.name ?? 'formulario'}-respuestas.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eliminar = async (respuestaId: string) => {
    try {
      await api.delete(`/formularios/${id}/respuestas/${respuestaId}`);
      setRespuestas((prev) => prev.filter((r) => r.id !== respuestaId));
      toast.success('Respuesta eliminada');
    } catch {
      toast.error('No se pudo eliminar la respuesta');
    }
  };

  if (ctx.loading || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
        <BarChart3 className="size-6 text-muted-foreground" />
        <p className="font-medium">Formulario no encontrado</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/proyectos')}>
          <ArrowLeft className="size-4" />
          Volver a espacios
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <BarChart3 className="size-5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{form.name}</p>
          <p className="text-xs text-muted-foreground">
            {respuestas.length} respuesta{respuestas.length === 1 ? '' : 's'}
            {nuevas > 0 && (
              <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                {nuevas} nueva{nuevas === 1 ? '' : 's'}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refrescar} disabled={refrescando}>
          {refrescando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Actualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportarCsv} disabled={respuestas.length === 0}>
          <Download className="size-4" />
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMigrarAbierto(true)}
          disabled={respuestas.length === 0}
        >
          <Table2 className="size-4" />
          Migrar a documento
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!entidad) {
              router.push('/proyectos');
              return;
            }
            const ws = ctx.workspaces.find((w) => w.id === entidad.workspace_id);
            if (!ws) {
              router.push('/proyectos');
              return;
            }
            const folder = entidad.folder_id
              ? ctx.folders.find((f) => f.id === entidad.folder_id)
              : undefined;
            router.push(
              `/proyectos/${entitySlug(ws, ctx.workspaces)}/${folder ? entitySlug(folder, ctx.folders) : 'raiz'}/formulario/${entitySlug(entidad, ctx.formularios)}`
            );
          }}
          className="text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver
        </Button>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="individuales">Individuales</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="pt-3">
          {preguntas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              El formulario aún no tiene preguntas.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {resumen.map((r) => (
                <TarjetaResumenPregunta key={r.pregunta_id} resumen={r} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="individuales" className="pt-3">
          {respuestas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay respuestas.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Persona</TableHead>
                    {preguntas.map((p) => (
                      <TableHead key={p.id} className="min-w-32">
                        {p.titulo}
                      </TableHead>
                    ))}
                    {canManage && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {respuestas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.invitado_nombre ??
                          (r.profile_id
                            ? 'Miembro'
                            : r.identificador_hash
                              ? 'Identificado'
                              : 'Anónimo')}
                      </TableCell>
                      {preguntas.map((p) => (
                        <TableCell key={p.id} className="max-w-64 truncate text-sm" title={valorLegible(p, r.respuestas[p.id])}>
                          {valorLegible(p, r.respuestas[p.id])}
                        </TableCell>
                      ))}
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={() => eliminar(r.id)}
                            aria-label="Eliminar respuesta"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MigrarRespuestasDialog
        abierto={migrarAbierto}
        onOpenChange={setMigrarAbierto}
        formulario={form}
        respuestas={respuestas}
      />
    </div>
  );
}
