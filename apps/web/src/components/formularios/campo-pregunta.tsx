'use client';

import type { PreguntaFormulario } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Campo de una pregunta: renderiza el input según el tipo. Mismo
// componente para la vista previa del editor y la página pública.

export type ValorPregunta = unknown;

export function CampoPregunta({
  pregunta,
  valor,
  onCambio,
  error,
  deshabilitado,
  idPrefijo = '',
}: {
  pregunta: PreguntaFormulario;
  valor: ValorPregunta;
  onCambio: (v: ValorPregunta) => void;
  error?: string;
  deshabilitado?: boolean;
  idPrefijo?: string;
}) {
  const id = `${idPrefijo}${pregunta.id}`;
  const errorId = `${id}-error`;
  const aria = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    disabled: deshabilitado,
  };

  const contenido = (() => {
    switch (pregunta.tipo) {
      case 'texto_corto': {
        const validacion = pregunta.validacion_texto;
        return (
          <Input
            {...aria}
            type={validacion?.modo === 'email' ? 'email' : 'text'}
            inputMode={validacion?.modo === 'numero' ? 'numeric' : undefined}
            autoComplete={validacion?.modo === 'email' ? 'email' : undefined}
            value={typeof valor === 'string' ? valor : ''}
            maxLength={
              validacion?.modo === 'numero' && validacion.digitos_max !== undefined
                ? validacion.digitos_max
                : pregunta.max_caracteres
            }
            onChange={(e) => onCambio(e.target.value)}
            placeholder={
              validacion?.modo === 'numero'
                ? 'Solo números'
                : validacion?.modo === 'email'
                  ? 'correo@ejemplo.com'
                  : 'Tu respuesta'
            }
          />
        );
      }

      case 'texto_largo':
        return (
          <Textarea
            {...aria}
            value={typeof valor === 'string' ? valor : ''}
            maxLength={pregunta.max_caracteres}
            onChange={(e) => onCambio(e.target.value)}
            placeholder="Tu respuesta"
            rows={4}
          />
        );

      case 'email':
        return (
          <Input
            {...aria}
            type="email"
            autoComplete="email"
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) => onCambio(e.target.value)}
            placeholder="correo@ejemplo.com"
          />
        );

      case 'numero':
        return (
          <Input
            {...aria}
            type="number"
            min={pregunta.numero?.min}
            max={pregunta.numero?.max}
            value={typeof valor === 'number' || typeof valor === 'string' ? String(valor) : ''}
            onChange={(e) => onCambio(e.target.value === '' ? '' : Number(e.target.value))}
            className="max-w-48"
          />
        );

      case 'fecha':
        return (
          <Input
            {...aria}
            type="date"
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) => onCambio(e.target.value)}
            className="max-w-48"
          />
        );

      case 'hora':
        return (
          <Input
            {...aria}
            type="time"
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) => onCambio(e.target.value)}
            className="max-w-48"
          />
        );

      case 'desplegable':
        return (
          <Select
            value={typeof valor === 'string' ? valor : ''}
            onValueChange={(v) => onCambio(v)}
            disabled={deshabilitado}
          >
            <SelectTrigger id={id} aria-invalid={error ? true : undefined} className="max-w-72">
              <SelectValue placeholder="Selecciona una opción" />
            </SelectTrigger>
            <SelectContent>
              {(pregunta.opciones ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'opcion_multiple':
        return (
          <div role="radiogroup" aria-labelledby={`${id}-label`} className="space-y-2">
            {(pregunta.opciones ?? []).map((o) => {
              const marcada = valor === o.id;
              return (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2.5 text-sm"
                >
                  <input
                    type="radio"
                    name={id}
                    checked={marcada}
                    disabled={deshabilitado}
                    onChange={() => onCambio(o.id)}
                    className="size-4 accent-primary"
                  />
                  <span>{o.etiqueta}</span>
                </label>
              );
            })}
          </div>
        );

      case 'casillas': {
        const marcadas = Array.isArray(valor) ? (valor as string[]) : [];
        return (
          <div className="space-y-2">
            {(pregunta.opciones ?? []).map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox
                  checked={marcadas.includes(o.id)}
                  disabled={deshabilitado}
                  onCheckedChange={(v) => {
                    const set = new Set(marcadas);
                    if (v === true) set.add(o.id);
                    else set.delete(o.id);
                    onCambio([...set]);
                  }}
                />
                <span>{o.etiqueta}</span>
              </label>
            ))}
          </div>
        );
      }

      case 'escala': {
        const min = pregunta.escala?.min ?? 1;
        const max = pregunta.escala?.max ?? 5;
        const valores = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {valores.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => onCambio(n)}
                  aria-pressed={valor === n}
                  className={cn(
                    'size-9 rounded-full border text-sm transition-colors',
                    valor === n
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            {(pregunta.escala?.etiqueta_min || pregunta.escala?.etiqueta_max) && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{pregunta.escala?.etiqueta_min}</span>
                <span>{pregunta.escala?.etiqueta_max}</span>
              </div>
            )}
          </div>
        );
      }
    }
  })();

  return (
    <div className="space-y-2">
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium">
        {pregunta.titulo || 'Pregunta sin título'}
        {pregunta.requerida && <span className="ml-1 text-destructive">*</span>}
      </label>
      {pregunta.descripcion && (
        <p className="text-xs text-muted-foreground">{pregunta.descripcion}</p>
      )}
      {contenido}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
