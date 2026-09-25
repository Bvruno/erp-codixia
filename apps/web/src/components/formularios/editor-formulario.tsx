'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  GripVertical,
  Plus,
  Split,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { validarEsquemaLogica } from '@erp/shared';
import type {
  FormularioEsquema,
  PreguntaFormulario,
  SeccionFormulario,
  TipoPregunta,
  ValidacionTexto,
} from '@/types';
import { TIPOS_PREGUNTA_ETIQUETA, crearPregunta, crearSeccion, limpiarReferenciasPreguntas, mover, nuevoId } from './utils';
import { EditorRegla, reglaNueva } from './editor-regla';

// Constructor (capa 1): edita secciones y preguntas del esquema.

const TIPOS_OPCIONES = Object.entries(TIPOS_PREGUNTA_ETIQUETA) as [TipoPregunta, string][];

const OPCIONES_VALIDACION_TEXTO: { valor: ValidacionTexto | null; etiqueta: string }[] = [
  { valor: null, etiqueta: 'Sin validación' },
  { valor: 'texto', etiqueta: 'Solo texto' },
  { valor: 'numero', etiqueta: 'Solo número' },
  { valor: 'email', etiqueta: 'Correo' },
];

function PreguntaCard({
  pregunta,
  indice,
  total,
  deshabilitado,
  preguntasPrevias,
  erroresLogica,
  onCambio,
  onEliminar,
  onDuplicar,
  onMover,
}: {
  pregunta: PreguntaFormulario;
  indice: number;
  total: number;
  deshabilitado: boolean;
  preguntasPrevias: PreguntaFormulario[];
  erroresLogica: string[];
  onCambio: (p: PreguntaFormulario) => void;
  onEliminar: () => void;
  onDuplicar: () => void;
  onMover: (dir: -1 | 1) => void;
}) {
  const [expandida, setExpandida] = useState(true);
  const conOpciones =
    pregunta.tipo === 'opcion_multiple' ||
    pregunta.tipo === 'casillas' ||
    pregunta.tipo === 'desplegable';

  const set = (patch: Partial<PreguntaFormulario>) => onCambio({ ...pregunta, ...patch });

  const setValidacionTexto = (modo: ValidacionTexto | null) => {
    if (modo === null) {
      set({ validacion_texto: null });
      return;
    }
    if (modo === 'numero') {
      set({
        validacion_texto: {
          modo,
          digitos_min: pregunta.validacion_texto?.digitos_min ?? 1,
          digitos_max: pregunta.validacion_texto?.digitos_max,
        },
      });
      return;
    }
    set({ validacion_texto: { modo } });
  };

  return (
    <Card className="gap-0 p-3">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-2 size-4 shrink-0 text-muted-foreground/50" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {TIPOS_PREGUNTA_ETIQUETA[pregunta.tipo]}
            </span>
            <button
              type="button"
              onClick={() => setExpandida((v) => !v)}
              className="ml-auto text-muted-foreground hover:text-foreground"
              title={expandida ? 'Contraer' : 'Expandir'}
              aria-label={expandida ? 'Contraer pregunta' : 'Expandir pregunta'}
            >
              {expandida ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </div>

          <Input
            value={pregunta.titulo}
            disabled={deshabilitado}
            onChange={(e) => set({ titulo: e.target.value })}
            placeholder="Pregunta sin título"
          />

          {expandida && (
            <>
              <Textarea
                value={pregunta.descripcion ?? ''}
                disabled={deshabilitado}
                onChange={(e) => set({ descripcion: e.target.value })}
                placeholder="Descripción (opcional)"
                rows={2}
              />

              {pregunta.tipo === 'texto_corto' && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label className="text-xs">Validación del texto</Label>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {OPCIONES_VALIDACION_TEXTO.map((op) => {
                      const activo = (pregunta.validacion_texto?.modo ?? null) === op.valor;
                      return (
                        <button
                          key={op.etiqueta}
                          type="button"
                          disabled={deshabilitado}
                          aria-pressed={activo}
                          onClick={() => setValidacionTexto(op.valor)}
                          className={cn(
                            'rounded-md border px-2 py-1 transition-colors',
                            activo
                              ? 'border-primary bg-primary/10 font-medium'
                              : 'text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {op.etiqueta}
                        </button>
                      );
                    })}
                  </div>

                  {pregunta.validacion_texto?.modo === 'numero' && (
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Dígitos mínimos"
                        value={pregunta.validacion_texto.digitos_min ?? ''}
                        disabled={deshabilitado}
                        onChange={(e) =>
                          set({
                            validacion_texto: {
                              ...pregunta.validacion_texto!,
                              digitos_min:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            },
                          })
                        }
                        className="h-8"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Dígitos máximos"
                        value={pregunta.validacion_texto.digitos_max ?? ''}
                        disabled={deshabilitado}
                        onChange={(e) =>
                          set({
                            validacion_texto: {
                              ...pregunta.validacion_texto!,
                              digitos_max:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            },
                          })
                        }
                        className="h-8"
                      />
                    </div>
                  )}

                  {pregunta.validacion_texto?.modo === 'numero' &&
                    pregunta.validacion_texto.digitos_min !== undefined &&
                    pregunta.validacion_texto.digitos_max !== undefined &&
                    pregunta.validacion_texto.digitos_min >
                      pregunta.validacion_texto.digitos_max && (
                      <p role="alert" className="text-xs text-destructive">
                        Los dígitos mínimos no pueden superar a los máximos
                      </p>
                    )}
                </div>
              )}

              {conOpciones && (
                <div className="space-y-2">
                  {(pregunta.opciones ?? []).map((opcion, idx) => (
                    <div key={opcion.id} className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {pregunta.tipo === 'casillas' ? (
                          <Square className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Circle className="size-3.5" aria-hidden="true" />
                        )}
                      </span>
                      <Input
                        value={opcion.etiqueta}
                        disabled={deshabilitado}
                        onChange={(e) => {
                          const opciones = [...(pregunta.opciones ?? [])];
                          opciones[idx] = { ...opcion, etiqueta: e.target.value };
                          set({ opciones });
                        }}
                        className="h-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={deshabilitado || (pregunta.opciones?.length ?? 0) <= 1}
                        onClick={() =>
                          set({ opciones: (pregunta.opciones ?? []).filter((o) => o.id !== opcion.id) })
                        }
                        aria-label={`Eliminar opción ${idx + 1}`}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={deshabilitado}
                    onClick={() =>
                      set({
                        opciones: [
                          ...(pregunta.opciones ?? []),
                          { id: nuevoId(), etiqueta: `Opción ${(pregunta.opciones?.length ?? 0) + 1}` },
                        ],
                      })
                    }
                  >
                    <Plus className="size-3.5" />
                    Agregar opción
                  </Button>
                </div>
              )}

              {pregunta.tipo === 'escala' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Mínimo</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={pregunta.escala?.min ?? 1}
                      disabled={deshabilitado}
                      onChange={(e) =>
                        set({ escala: { ...(pregunta.escala ?? { max: 5 }), min: Number(e.target.value) } })
                      }
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Máximo</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={pregunta.escala?.max ?? 5}
                      disabled={deshabilitado}
                      onChange={(e) =>
                        set({ escala: { ...(pregunta.escala ?? { min: 1 }), max: Number(e.target.value) } })
                      }
                      className="h-8"
                    />
                  </div>
                  <Input
                    value={pregunta.escala?.etiqueta_min ?? ''}
                    disabled={deshabilitado}
                    onChange={(e) =>
                      set({ escala: { ...(pregunta.escala ?? { min: 1, max: 5 }), etiqueta_min: e.target.value } })
                    }
                    placeholder="Etiqueta mínima"
                    className="h-8"
                  />
                  <Input
                    value={pregunta.escala?.etiqueta_max ?? ''}
                    disabled={deshabilitado}
                    onChange={(e) =>
                      set({ escala: { ...(pregunta.escala ?? { min: 1, max: 5 }), etiqueta_max: e.target.value } })
                    }
                    placeholder="Etiqueta máxima"
                    className="h-8"
                  />
                </div>
              )}

              {pregunta.tipo === 'numero' && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    value={pregunta.numero?.min ?? ''}
                    disabled={deshabilitado}
                    onChange={(e) =>
                      set({
                        numero: {
                          ...pregunta.numero,
                          min: e.target.value === '' ? undefined : Number(e.target.value),
                        },
                      })
                    }
                    placeholder="Mínimo (opcional)"
                    className="h-8"
                  />
                  <Input
                    type="number"
                    value={pregunta.numero?.max ?? ''}
                    disabled={deshabilitado}
                    onChange={(e) =>
                      set({
                        numero: {
                          ...pregunta.numero,
                          max: e.target.value === '' ? undefined : Number(e.target.value),
                        },
                      })
                    }
                    placeholder="Máximo (opcional)"
                    className="h-8"
                  />
                </div>
              )}

              {(pregunta.tipo === 'texto_corto' || pregunta.tipo === 'texto_largo') && (
                <Input
                  type="number"
                  value={pregunta.max_caracteres ?? ''}
                  disabled={deshabilitado}
                  onChange={(e) =>
                    set({ max_caracteres: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                  placeholder="Máximo de caracteres (opcional)"
                  className="h-8 max-w-64"
                />
              )}

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={pregunta.requerida}
                  disabled={deshabilitado}
                  onCheckedChange={(v) => set({ requerida: v === true })}
                />
                Obligatoria
              </label>

              {preguntasPrevias.length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!pregunta.logica}
                      disabled={deshabilitado}
                      onCheckedChange={(v) => {
                        if (v === true) {
                          const regla = reglaNueva(preguntasPrevias);
                          if (regla) set({ logica: { mostrar_si: regla } });
                        } else {
                          set({ logica: null });
                        }
                      }}
                    />
                    Mostrar solo si se cumple una condición
                  </label>
                  {pregunta.logica && (
                    <EditorRegla
                      regla={pregunta.logica.mostrar_si}
                      preguntasDisponibles={preguntasPrevias}
                      onChange={(r) => set({ logica: { mostrar_si: r } })}
                      deshabilitado={deshabilitado}
                    />
                  )}
                  {erroresLogica.map((mensaje, i) => (
                    <p key={i} role="alert" className="text-xs text-destructive">
                      {mensaje}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={deshabilitado || indice === 0}
            onClick={() => onMover(-1)}
            aria-label="Subir pregunta"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={deshabilitado || indice === total - 1}
            onClick={() => onMover(1)}
            aria-label="Bajar pregunta"
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={deshabilitado}
            onClick={onDuplicar}
            aria-label="Duplicar pregunta"
          >
            <Copy className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-destructive"
            disabled={deshabilitado}
            onClick={onEliminar}
            aria-label="Eliminar pregunta"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function EditorFormulario({
  esquema,
  onCambio,
  deshabilitado = false,
}: {
  esquema: FormularioEsquema;
  onCambio: (e: FormularioEsquema) => void;
  deshabilitado?: boolean;
}) {
  const setSecciones = (secciones: SeccionFormulario[]) => onCambio({ ...esquema, secciones });

  const cambiarSeccion = (seccionId: string, cambio: Partial<SeccionFormulario>) =>
    setSecciones(esquema.secciones.map((s) => (s.id === seccionId ? { ...s, ...cambio } : s)));

  const cambiarPregunta = (
    seccionId: string,
    preguntaId: string,
    pregunta: PreguntaFormulario
  ) =>
    cambiarSeccion(seccionId, {
      preguntas: (esquema.secciones.find((s) => s.id === seccionId)?.preguntas ?? []).map((p) =>
        p.id === preguntaId ? pregunta : p
      ),
    });

  const quitarPregunta = (seccionId: string, preguntaId: string) => {
    const sinPregunta: FormularioEsquema = {
      ...esquema,
      secciones: esquema.secciones.map((s) =>
        s.id === seccionId
          ? { ...s, preguntas: s.preguntas.filter((p) => p.id !== preguntaId) }
          : s
      ),
    };
    onCambio(limpiarReferenciasPreguntas(sinPregunta, new Set([preguntaId])));
  };

  const quitarSeccion = (seccionId: string) => {
    const seccion = esquema.secciones.find((s) => s.id === seccionId);
    if (!seccion) return;
    const ids = new Set(seccion.preguntas.map((p) => p.id));
    const sinSeccion: FormularioEsquema = {
      ...esquema,
      secciones: esquema.secciones.filter((s) => s.id !== seccionId),
    };
    onCambio(limpiarReferenciasPreguntas(sinSeccion, ids));
  };

  const erroresLogica = useMemo(() => validarEsquemaLogica(esquema), [esquema]);  const preguntasPlanas = useMemo(
    () => esquema.secciones.flatMap((s) => s.preguntas),
    [esquema]
  );
  const indiceGlobal = useMemo(() => {
    const mapa = new Map<string, number>();
    preguntasPlanas.forEach((p, i) => mapa.set(p.id, i));
    return mapa;
  }, [preguntasPlanas]);

  return (
    <div className="space-y-4">
      {esquema.secciones.map((seccion, sIdx) => (
        <Card key={seccion.id} className="gap-0 p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={seccion.titulo}
                disabled={deshabilitado}
                onChange={(e) => cambiarSeccion(seccion.id, { titulo: e.target.value })}
                className="h-8 max-w-72 font-medium"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={deshabilitado || sIdx === 0}
                onClick={() => setSecciones(mover(esquema.secciones, sIdx, sIdx - 1))}
                aria-label="Subir sección"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={deshabilitado || sIdx === esquema.secciones.length - 1}
                onClick={() => setSecciones(mover(esquema.secciones, sIdx, sIdx + 1))}
                aria-label="Bajar sección"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-destructive"
                disabled={deshabilitado || esquema.secciones.length <= 1}
                onClick={() => quitarSeccion(seccion.id)}
                aria-label="Eliminar sección"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Input
              value={seccion.descripcion ?? ''}
              disabled={deshabilitado}
              onChange={(e) => cambiarSeccion(seccion.id, { descripcion: e.target.value })}
              placeholder="Descripción de la sección (opcional)"
              className="h-8"
            />

            <div className="space-y-2">
              {seccion.preguntas.map((pregunta, pIdx) => (
                <PreguntaCard
                  key={pregunta.id}
                  pregunta={pregunta}
                  indice={pIdx}
                  total={seccion.preguntas.length}
                  deshabilitado={deshabilitado}
                  preguntasPrevias={preguntasPlanas.slice(0, indiceGlobal.get(pregunta.id) ?? 0)}
                  erroresLogica={erroresLogica
                    .filter((e) => e.pregunta_id === pregunta.id)
                    .map((e) => e.mensaje)}
                  onCambio={(p) => cambiarPregunta(seccion.id, pregunta.id, p)}
                  onEliminar={() => quitarPregunta(seccion.id, pregunta.id)}
                  onDuplicar={() =>
                    cambiarSeccion(seccion.id, {
                      preguntas: [
                        ...seccion.preguntas.slice(0, pIdx + 1),
                        { ...pregunta, id: nuevoId() },
                        ...seccion.preguntas.slice(pIdx + 1),
                      ],
                    })
                  }
                  onMover={(dir) =>
                    cambiarSeccion(seccion.id, {
                      preguntas: mover(seccion.preguntas, pIdx, pIdx + dir),
                    })
                  }
                />
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={deshabilitado}>
                  <Plus className="size-4" />
                  Agregar pregunta
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Tipo de pregunta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {TIPOS_OPCIONES.map(([tipo, etiqueta]) => (
                  <DropdownMenuItem
                    key={tipo}
                    onClick={() =>
                      cambiarSeccion(seccion.id, {
                        preguntas: [...seccion.preguntas, crearPregunta(tipo)],
                      })
                    }
                  >
                    {etiqueta}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {(() => {
              const ultima = seccion.preguntas[seccion.preguntas.length - 1];
              const hastaIdx = ultima ? indiceGlobal.get(ultima.id) ?? -1 : -1;
              const disponibles = hastaIdx >= 0 ? preguntasPlanas.slice(0, hastaIdx + 1) : [];
              const posteriores = esquema.secciones.slice(sIdx + 1);
              const ramas = seccion.ramas ?? [];
              const setRamas = (nuevas: typeof ramas) =>
                cambiarSeccion(seccion.id, { ramas: nuevas });
              return (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Split className="size-3.5" />
                      Ramificar al terminar la sección
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={deshabilitado || disponibles.length === 0}
                      onClick={() => {
                        const regla = reglaNueva(disponibles);
                        if (!regla) return;
                        setRamas([
                          ...ramas,
                          {
                            id: nuevoId(),
                            regla,
                            destino: posteriores[0]?.id ?? 'enviar',
                          },
                        ]);
                      }}
                    >
                      <Plus className="size-3.5" />
                      Rama
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Gana la primera rama que cumpla; sin ramas se pasa a la sección siguiente.
                  </p>
                  {ramas.map((rama) => (
                    <div key={rama.id} className="space-y-2 rounded-md bg-muted/30 p-2">
                      <EditorRegla
                        regla={rama.regla}
                        preguntasDisponibles={disponibles}
                        onChange={(r) =>
                          setRamas(ramas.map((x) => (x.id === rama.id ? { ...x, regla: r } : x)))
                        }
                        deshabilitado={deshabilitado}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Ir a</span>
                        <Select
                          value={rama.destino}
                          onValueChange={(v) =>
                            setRamas(ramas.map((x) => (x.id === rama.id ? { ...x, destino: v } : x)))
                          }
                          disabled={deshabilitado}
                        >
                          <SelectTrigger className="h-8 w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enviar">Enviar formulario</SelectItem>
                            {posteriores.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                Sección: {s.titulo || 'sin título'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          disabled={deshabilitado}
                          onClick={() => setRamas(ramas.filter((x) => x.id !== rama.id))}
                          aria-label="Eliminar rama"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {erroresLogica
                    .filter((e) => e.seccion_id === seccion.id && !e.pregunta_id)
                    .map((e, i) => (
                      <p key={i} role="alert" className="text-xs text-destructive">
                        {e.mensaje}
                      </p>
                    ))}
                </div>
              );
            })()}
          </div>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        disabled={deshabilitado}
        onClick={() => setSecciones([...esquema.secciones, crearSeccion(esquema.secciones.length + 1)])}
      >
        <Plus className="size-4" />
        Agregar sección
      </Button>
    </div>
  );
}
