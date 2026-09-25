'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CampoPregunta } from './campo-pregunta';
import {
  recorridoFormulario,
  sanearRespuestas,
  tieneLogica,
  validarPregunta,
  validarRespuestas,
} from '@erp/shared';
import type {
  ErrorRespuestaFormulario,
  FormularioPublico,
  RespuestasFormulario,
} from '@/types';

// Renderizador único: preview del editor (modo preview) y página pública
// (modo real). Con lógica IF el formulario se navega sección a sección
// (una pantalla por paso, ramas incluidas); sin lógica mantiene el scroll.

export function RenderizadorFormulario({
  formulario,
  modo,
  enviando,
  onEnviar,
  mensajeExito,
  nombreInvitado,
}: {
  formulario: FormularioPublico;
  modo: 'preview' | 'real';
  enviando?: boolean;
  onEnviar?: (respuestas: RespuestasFormulario, consentimiento: boolean, website: string) => void;
  mensajeExito?: string | null;
  nombreInvitado?: string | null;
}) {
  const [valores, setValores] = useState<RespuestasFormulario>({});
  const [consentimiento, setConsentimiento] = useState(false);
  const [website, setWebsite] = useState('');
  const [errores, setErrores] = useState<ErrorRespuestaFormulario[]>([]);

  const esquema = formulario.esquema;
  const conLogica = useMemo(() => tieneLogica(esquema), [esquema]);

  // Camino del asistente: secciones ya visitadas, en orden.
  const [camino, setCamino] = useState<string[]>(() =>
    esquema.secciones[0] ? [esquema.secciones[0].id] : []
  );
  const seccionActual = conLogica
    ? esquema.secciones.find((s) => s.id === camino[camino.length - 1]) ?? null
    : null;

  // Recorrido efectivo: visibilidad y ramas con las respuestas de las
  // preguntas visibles (una respuesta oculta no cuenta como respondida).
  const recorrido = useMemo(
    () => recorridoFormulario(esquema, valores),
    [esquema, valores]
  );
  const visiblesSeccion = useMemo(() => {
    const set = new Set<string>();
    if (seccionActual) {
      for (const p of seccionActual.preguntas) {
        if (recorrido.visibles.has(p.id)) set.add(p.id);
      }
    }
    return set;
  }, [recorrido, seccionActual]);

  const legendRef = useRef<HTMLLegendElement | null>(null);
  useEffect(() => {
    legendRef.current?.focus();
  }, [seccionActual?.id]);

  const proximo = seccionActual ? recorrido.siguientes[seccionActual.id] ?? null : null;
  const esUltimoPaso = !proximo || proximo === 'enviar';

  const errorDe = (preguntaId: string) =>
    errores.find((e) => e.pregunta_id === preguntaId)?.mensaje;

  const cambiarValor = (preguntaId: string, valor: unknown) => {
    setValores((prev) => ({ ...prev, [preguntaId]: valor }));
    setErrores((prev) => prev.filter((e) => e.pregunta_id !== preguntaId));
  };

  const validarEnvio = (): ErrorRespuestaFormulario[] => {
    const encontrados = validarRespuestas(esquema, valores);
    if (formulario.requiere_consentimiento && !consentimiento) {
      encontrados.push({
        pregunta_id: 'consentimiento',
        mensaje: 'Debes aceptar el aviso de privacidad',
      });
    }
    return encontrados;
  };

  const enviar = () => {
    if (modo === 'preview') return;
    const encontrados = validarEnvio();
    setErrores(encontrados);
    if (encontrados.length > 0) return;
    onEnviar?.(sanearRespuestas(esquema, valores), consentimiento, website);
  };

  const continuar = () => {
    if (!seccionActual) return;
    const erroresSeccion: ErrorRespuestaFormulario[] = [];
    for (const p of seccionActual.preguntas) {
      if (!visiblesSeccion.has(p.id)) continue;
      const mensaje = validarPregunta(p, valores[p.id]);
      if (mensaje) erroresSeccion.push({ pregunta_id: p.id, mensaje });
    }
    if (esUltimoPaso && formulario.requiere_consentimiento && !consentimiento) {
      erroresSeccion.push({
        pregunta_id: 'consentimiento',
        mensaje: 'Debes aceptar el aviso de privacidad',
      });
    }
    if (erroresSeccion.length > 0) {
      setErrores(erroresSeccion);
      return;
    }
    setErrores([]);
    if (esUltimoPaso) {
      enviar();
      return;
    }
    setCamino((prev) => [...prev, proximo as string]);
  };

  if (mensajeExito) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ClipboardList className="mx-auto size-8 text-success" />
        <p className="mt-3 text-lg font-medium">{mensajeExito}</p>
      </div>
    );
  }

  const encabezado = (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-xl font-semibold">{formulario.nombre}</h2>
      {formulario.descripcion && (
        <p className="mt-1 text-sm text-muted-foreground">{formulario.descripcion}</p>
      )}
      {nombreInvitado && (
        <p className="mt-2 text-sm">
          Hola, <span className="font-medium">{nombreInvitado}</span>
        </p>
      )}
      {conLogica && (
        <p
          aria-live="polite"
          className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Sección {camino.length}
        </p>
      )}
    </div>
  );

  const bloqueConsentimiento = (conError: boolean) =>
    formulario.requiere_consentimiento && (
      <div className="space-y-2">
        {formulario.texto_privacidad && (
          <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {formulario.texto_privacidad}
          </div>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <Checkbox
            checked={consentimiento}
            onCheckedChange={(v) => {
              setConsentimiento(v === true);
              setErrores((prev) => prev.filter((e) => e.pregunta_id !== 'consentimiento'));
            }}
            className="mt-0.5"
          />
          <span>Acepto el aviso de privacidad y el tratamiento de mis datos.</span>
        </label>
        {conError && errorDe('consentimiento') && (
          <p role="alert" className="text-xs text-destructive">
            {errorDe('consentimiento')}
          </p>
        )}
      </div>
    );

  const honeypot = (
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="hidden"
      value={website}
      onChange={(e) => setWebsite(e.target.value)}
    />
  );

  // ---- Wizard (solo con lógica) ----
  if (conLogica) {
    return (
      <div className="space-y-6">
        {encabezado}

        {esquema.secciones.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Agrega secciones y preguntas para ver la vista previa.
          </div>
        ) : seccionActual ? (
          <>
            <fieldset key={seccionActual.id} className="rounded-xl border bg-card p-6">
              <legend
                ref={legendRef}
                tabIndex={-1}
                className="px-1 text-base font-semibold outline-none"
              >
                {seccionActual.titulo}
              </legend>
              {seccionActual.descripcion && (
                <p className="mb-4 text-sm text-muted-foreground">{seccionActual.descripcion}</p>
              )}
              <div className="mt-2 space-y-6">
                {seccionActual.preguntas
                  .filter((p) => visiblesSeccion.has(p.id))
                  .map((pregunta) => (
                    <CampoPregunta
                      key={pregunta.id}
                      pregunta={pregunta}
                      valor={valores[pregunta.id]}
                      onCambio={(v) => cambiarValor(pregunta.id, v)}
                      error={errorDe(pregunta.id)}
                    />
                  ))}
                {seccionActual.preguntas.every((p) => !visiblesSeccion.has(p.id)) && (
                  <p className="text-sm text-muted-foreground">
                    Esta sección no tiene preguntas para tus respuestas actuales.
                  </p>
                )}
              </div>
            </fieldset>

            <div className="space-y-4 rounded-xl border bg-card p-6">
              {esUltimoPaso && bloqueConsentimiento(modo === 'real')}
              {modo === 'real' && honeypot}
              {errores.length > 0 && (
                <p role="alert" className="text-sm text-destructive">
                  Revisa las preguntas marcadas antes de continuar.
                </p>
              )}
              {modo === 'preview' && esUltimoPaso && (
                <p className="text-xs text-muted-foreground">
                  Fin de la vista previa — así se vería el último paso.
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCamino((prev) => prev.slice(0, -1))}
                  disabled={camino.length <= 1}
                >
                  <ArrowLeft className="size-4" />
                  Atrás
                </Button>
                {modo === 'real' ? (
                  <Button onClick={continuar} disabled={enviando}>
                    {enviando ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Enviando…
                      </>
                    ) : esUltimoPaso ? (
                      <>
                        <Send className="size-4" />
                        Enviar respuesta
                      </>
                    ) : (
                      <>
                        Continuar
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                ) : esUltimoPaso ? (
                  <Button disabled>Fin</Button>
                ) : (
                  <Button onClick={continuar}>
                    Continuar
                    <ArrowRight className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ---- Scroll (sin lógica) ----
  return (
    <div className="space-y-6">
      {encabezado}

      {esquema.secciones.map((seccion) => (
        <fieldset key={seccion.id} className="rounded-xl border bg-card p-6">
          <legend className="px-1 text-base font-semibold">{seccion.titulo}</legend>
          {seccion.descripcion && (
            <p className="mb-4 text-sm text-muted-foreground">{seccion.descripcion}</p>
          )}
          <div className="mt-2 space-y-6">
            {seccion.preguntas.map((pregunta) => (
              <CampoPregunta
                key={pregunta.id}
                pregunta={pregunta}
                valor={valores[pregunta.id]}
                onCambio={(v) => cambiarValor(pregunta.id, v)}
                error={errorDe(pregunta.id)}
              />
            ))}
            {seccion.preguntas.length === 0 && (
              <p className="text-sm text-muted-foreground">Esta sección aún no tiene preguntas.</p>
            )}
          </div>
        </fieldset>
      ))}

      {esquema.secciones.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Agrega secciones y preguntas para ver la vista previa.
        </div>
      )}

      {modo === 'real' && (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          {bloqueConsentimiento(true)}
          {honeypot}
          {errores.length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              Revisa las preguntas marcadas antes de enviar.
            </p>
          )}
          <Button onClick={enviar} disabled={enviando} className="w-full sm:w-auto">
            {enviando ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="size-4" />
                Enviar respuesta
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
