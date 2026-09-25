'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, apiFetch } from '@/lib/api/cliente';
import { entitySlug } from '@/lib/slugs';
import { cn } from '@/lib/utils';
import { isFullUuid, validarEsquemaLogica } from '@erp/shared';
import { nombreDuplicado, resolverFormularioActual } from './utils';
import { useTareas } from '@/components/tareas/tareas-context';
import { ShareButton } from '@/components/tareas/share-entity-dialog';
import { AccionEntidad } from '@/components/entidad/accion-entidad';
import { CabeceraEntidad, TituloEditableEntidad } from '@/components/entidad/cabecera-entidad';
import { ToggleModoEntidad } from '@/components/entidad/toggle-modo-entidad';
import { IndicadorGuardado } from '@/components/entidad/indicador-guardado';
import { AvisoSoloLectura } from '@/components/entidad/aviso-solo-lectura';
import { EntidadPagina } from '@/components/entidad/entidad-pagina';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorFormulario } from './editor-formulario';
import { PanelPreview } from './panel-preview';
import { ConfigCompartirDialog } from './config-compartir';
import type {
  AjustesFormulario,
  EstadoFormulario,
  Formulario,
  FormularioEsquema,
} from '@/types';

// Vista del formulario: capa 1 (constructor) + capa 2 (preview en vivo).
// La capa 3 (respuestas) vive en su propia ruta dashboard.

export function FormularioView({ formularioId: paramId }: { formularioId: string }) {
  const ctx = useTareas();
  const router = useRouter();

  const [form, setForm] = useState<Formulario | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [esquema, setEsquema] = useState<FormularioEsquema>({ version: 1, secciones: [] });
  const [ajustes, setAjustes] = useState<AjustesFormulario | null>(null);
  const [estado, setEstado] = useState<EstadoFormulario>('borrador');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [configOpen, setConfigOpen] = useState(false);
  const [vistaMovil, setVistaMovil] = useState<'editar' | 'previa'>('editar');
  const cargadoRef = useRef(false);

  // Resolución tolerante al renombrado: si el slug de la URL quedó viejo,
  // se usa el formulario ya cargado (mismo id) hasta sanar la URL.
  const entidad = ctx.loading
    ? undefined
    : resolverFormularioActual(paramId, ctx.formularios, form?.id);
  const id = entidad?.id ?? (ctx.loading ? null : isFullUuid(paramId) ? paramId : null);
  const canWrite = id ? ctx.canWrite('formulario', id) : false;

  useEffect(() => {
    if (!id) return;
    let activo = true;
    cargadoRef.current = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{ formulario: Formulario }>(`/formularios/${id}`);
        if (!activo) return;
        const f = res.formulario;
        setForm(f);
        setNombre(f.name);
        setDescripcion(f.description ?? '');
        setEsquema(f.esquema ?? { version: 1, secciones: [] });
        setAjustes(
          f.ajustes ?? {
            modo_acceso: 'publico',
            lista_modo: 'blanca',
            identificadores: ['dni', 'email'],
            una_respuesta_por_persona: false,
            requiere_consentimiento: false,
            texto_privacidad: '',
            mensaje_confirmacion: 'Gracias por tu respuesta.',
          }
        );
        setEstado(f.estado);
        cargadoRef.current = true;
        setSaveState('saved');
      } catch {
        if (activo) {
          // No destruir la edición por un fallo transitorio del mismo form.
          setForm((prev) => (prev && prev.id === id ? prev : null));
        }
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [id]);

  // Autosave con debounce (nombre, esquema y ajustes).
  const nombreGuardado = nombre || 'Formulario sin título';
  const duplicado =
    !!form &&
    !!entidad &&
    nombreDuplicado(
      ctx.formularios,
      entidad.workspace_id,
      entidad.folder_id,
      nombreGuardado,
      entidad.id
    );

  const refetchCtx = ctx.refetch;

  useEffect(() => {
    if (!id || !cargadoRef.current || !canWrite || !ajustes) return;
    if (
      form &&
      form.name === nombre &&
      form.esquema === esquema &&
      form.ajustes === ajustes &&
      (form.description ?? '') === descripcion
    ) {
      return;
    }
    const timer = setTimeout(() => {
      setSaveState('saving');
      void (async () => {
        try {
          // Con lógica inválida o nombre duplicado no se persiste: el
          // editor muestra el error inline y queda "Sin guardar".
          if (validarEsquemaLogica(esquema).length > 0 || duplicado) {
            setSaveState('unsaved');
            return;
          }
          const nombreCambiado = form?.name !== nombreGuardado;
          await api.put(`/formularios/${id}`, {
            name: nombreGuardado,
            description: descripcion || null,
            esquema,
            ajustes,
          });
          setForm((prev) =>
            prev
              ? {
                  ...prev,
                  name: nombreGuardado,
                  description: descripcion || null,
                  esquema,
                  ajustes,
                }
              : prev
          );
          setSaveState('saved');
          // Acelera el refresco del árbol (y el sanado de URL); el
          // realtime lo haría igual unos cientos de ms después.
          if (nombreCambiado) void refetchCtx();
        } catch {
          setSaveState('unsaved');
          toast.error('No se pudo guardar el formulario');
        }
      })();
    }, 900);
    return () => clearTimeout(timer);
  }, [id, canWrite, nombre, nombreGuardado, descripcion, esquema, ajustes, form, duplicado, refetchCtx]);

  const rutaDe = (ent: Formulario): string | null => {
    const ws = ctx.workspaces.find((w) => w.id === ent.workspace_id);
    if (!ws) return null;
    const folder = ent.folder_id
      ? ctx.folders.find((f) => f.id === ent.folder_id)
      : undefined;
    return `/proyectos/${entitySlug(ws, ctx.workspaces)}/${folder ? entitySlug(folder, ctx.folders) : 'raiz'}/formulario/${entitySlug(ent, ctx.formularios)}`;
  };

  // El shim useRouter devuelve un objeto nuevo en cada render: guardamos
  // la función de navegación en un ref para no usarla como dependencia.
  const navegarRef = useRef(router.replace);
  useEffect(() => {
    navegarRef.current = router.replace;
  });

  // Sanado de URL con candado estricto: cada combinación (formulario,
  // slug canónico) navega UNA sola vez. Sin esto, un replace en un efecto
  // con dependencias inestables podía re-dispararse en cada render de la
  // navegación y colgar el navegador.
  const sanadosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!entidad) return;
    const slug = entitySlug(entidad, ctx.formularios);
    if (paramId === slug || paramId === entidad.id) return;
    const clave = `${entidad.id}:${slug}`;
    if (sanadosRef.current.has(clave)) return;
    const base = rutaDe(entidad);
    if (!base) return;
    sanadosRef.current.add(clave);
    navegarRef.current(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rutaDe depende del ctx completo
  }, [entidad, paramId, ctx.workspaces, ctx.folders, ctx.formularios]);

  const irARespuestas = () => {
    if (!entidad) return;
    const base = rutaDe(entidad);
    if (base) router.push(`${base}/respuestas`);
  };

  if (ctx.loading || (loading && id !== null)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!id || !form || !ajustes) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
        <ClipboardList className="size-6 text-muted-foreground" />
        <p className="font-medium">Formulario no encontrado</p>
        <p className="text-sm text-muted-foreground">
          Puede que se haya eliminado o no tengas acceso.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push('/proyectos')}>
          <ArrowLeft className="size-4" />
          Volver a espacios
        </Button>
      </div>
    );
  }

  const estadoBadge =
    estado === 'publicado'
      ? { texto: 'Publicado', clase: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
      : estado === 'cerrado'
        ? { texto: 'Cerrado', clase: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' }
        : { texto: 'Borrador', clase: 'bg-muted text-muted-foreground' };

  return (
    <EntidadPagina>
      <CabeceraEntidad
        tipo="formulario"
        titulo={
          <TituloEditableEntidad
            valor={nombre}
            onCambio={setNombre}
            disabled={!canWrite}
            placeholder="Formulario sin título"
          />
        }
        badges={
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', estadoBadge.clase)}>
            {estadoBadge.texto}
          </span>
        }
        estado={<IndicadorGuardado estado={saveState} />}
        acciones={
          <>
            <ShareButton
              onClick={() =>
                entidad && ctx.openShare('formulario', entidad as unknown as Parameters<typeof ctx.openShare>[1])
              }
            />
            <AccionEntidad
              icono={Link2}
              onClick={() => setConfigOpen(true)}
              disabled={!canWrite}
            >
              Enlace y acceso
            </AccionEntidad>
            <AccionEntidad icono={BarChart3} onClick={irARespuestas}>
              Respuestas
            </AccionEntidad>
            <span className="lg:hidden">
              <ToggleModoEntidad
                modo={vistaMovil === 'editar' ? 'editar' : 'ver'}
                onCambio={(m) => setVistaMovil(m === 'editar' ? 'editar' : 'previa')}
              />
            </span>
          </>
        }
      />

      {duplicado && canWrite && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          Ya existe un formulario con ese nombre en este lugar. Elige otro nombre para guardar.
        </p>
      )}

      {!canWrite && <AvisoSoloLectura />}

      <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[1fr_minmax(380px,44%)]">
        <div className={cn(vistaMovil === 'previa' && 'hidden lg:block')}>
          <EditorFormulario esquema={esquema} onCambio={setEsquema} deshabilitado={!canWrite} />
        </div>
        <div className={cn(vistaMovil === 'editar' && 'hidden lg:block')}>
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1">
            <PanelPreview
              nombre={nombre}
              descripcion={descripcion || null}
              esquema={esquema}
              ajustes={ajustes}
            />
          </div>
        </div>
      </div>

      <ConfigCompartirDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        formulario={{ id: form.id, nombre: nombreGuardado, estado, ajustes }}
        onAjustes={setAjustes}
        onEstadoCambio={(e) => setEstado(e)}
      />
    </EntidadPagina>
  );
}
