'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  OPERADORES_CONDICION_ETIQUETA,
  OPERADORES_POR_TIPO,
  OPERADORES_SIN_VALOR,
} from '@erp/shared';
import { cn } from '@/lib/utils';
import type {
  OperadorCondicion,
  PreguntaFormulario,
  ReglaLogica,
} from '@/types';
import { condicionDefecto, nuevoId, valorDefecto } from './utils';

// Editor de una regla IF: lista de condiciones + modo todas/alguna.
// Se usa tanto para visibilidad de preguntas como para ramas de sección.

function ValorCondicion({
  pregunta,
  operador,
  valor,
  onChange,
  deshabilitado,
}: {
  pregunta: PreguntaFormulario;
  operador: OperadorCondicion;
  valor: string | number | undefined;
  onChange: (v: string | number) => void;
  deshabilitado?: boolean;
}) {
  if (OPERADORES_SIN_VALOR.has(operador)) return null;

  const esComparacion = (pregunta.opciones?.length ?? 0) > 0 &&
    (operador === 'igual' || operador === 'distinto' || operador === 'incluye');

  if (esComparacion) {
    return (
      <Select
        value={typeof valor === 'string' ? valor : ''}
        onValueChange={(v) => onChange(v)}
        disabled={deshabilitado}
      >
        <SelectTrigger className="h-8 flex-1">
          <SelectValue placeholder="Opción" />
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
  }

  if (
    pregunta.tipo === 'numero' ||
    pregunta.tipo === 'escala' ||
    operador === 'mayor' ||
    operador === 'menor' ||
    operador === 'mayor_igual' ||
    operador === 'menor_igual'
  ) {
    return (
      <Input
        type="number"
        value={typeof valor === 'number' ? valor : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        disabled={deshabilitado}
        className="h-8 flex-1"
      />
    );
  }

  return (
    <Input
      type={pregunta.tipo === 'fecha' ? 'date' : pregunta.tipo === 'hora' ? 'time' : 'text'}
      value={typeof valor === 'string' ? valor : ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={deshabilitado}
      className="h-8 flex-1"
      placeholder="Valor"
    />
  );
}

export function EditorRegla({
  regla,
  preguntasDisponibles,
  onChange,
  deshabilitado,
}: {
  regla: ReglaLogica;
  preguntasDisponibles: PreguntaFormulario[];
  onChange: (r: ReglaLogica) => void;
  deshabilitado?: boolean;
}) {
  const setCondicion = (idx: number, patch: Partial<ReglaLogica['condiciones'][number]>) => {
    const condiciones = regla.condiciones.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange({ ...regla, condiciones });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Se cumple</span>
        <div className="flex rounded-md border p-0.5 text-xs">
          {(['todas', 'alguna'] as const).map((modo) => (
            <button
              key={modo}
              type="button"
              disabled={deshabilitado}
              onClick={() => onChange({ ...regla, modo })}
              className={cn(
                'rounded px-2 py-0.5 capitalize transition-colors',
                regla.modo === modo ? 'bg-muted font-medium' : 'text-muted-foreground'
              )}
            >
              {modo === 'todas' ? 'Todas' : 'Alguna'}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">de las condiciones</span>
      </div>

      {regla.condiciones.map((condicion, idx) => {
        const ref =
          preguntasDisponibles.find((p) => p.id === condicion.pregunta_id) ??
          preguntasDisponibles[0];
        if (!ref) return null;
        const operadores = OPERADORES_POR_TIPO[ref.tipo];
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <Select
              value={condicion.pregunta_id}
              onValueChange={(v) => {
                const nuevaRef = preguntasDisponibles.find((p) => p.id === v);
                if (!nuevaRef) return;
                setCondicion(idx, condicionDefecto(nuevaRef));
              }}
              disabled={deshabilitado}
            >
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Pregunta" />
              </SelectTrigger>
              <SelectContent>
                {preguntasDisponibles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.titulo || 'Pregunta sin título'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={condicion.operador}
              onValueChange={(v) => {
                const operador = v as OperadorCondicion;
                const sinValor = OPERADORES_SIN_VALOR.has(operador);
                setCondicion(idx, {
                  operador,
                  valor: sinValor
                    ? undefined
                    : condicion.valor !== undefined
                      ? condicion.valor
                      : valorDefecto(ref),
                });
              }}
              disabled={deshabilitado}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operadores.map((op) => (
                  <SelectItem key={op} value={op}>
                    {OPERADORES_CONDICION_ETIQUETA[op]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ValorCondicion
              pregunta={ref}
              operador={condicion.operador}
              valor={condicion.valor}
              onChange={(v) => setCondicion(idx, { valor: v })}
              deshabilitado={deshabilitado}
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              disabled={deshabilitado || regla.condiciones.length <= 1}
              onClick={() =>
                onChange({
                  ...regla,
                  condiciones: regla.condiciones.filter((_, i) => i !== idx),
                })
              }
              aria-label="Quitar condición"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={deshabilitado || regla.condiciones.length >= 10 || preguntasDisponibles.length === 0}
        onClick={() =>
          onChange({
            ...regla,
            condiciones: [...regla.condiciones, condicionDefecto(preguntasDisponibles[0])],
          })
        }
      >
        <Plus className="size-3.5" />
        Condición
      </Button>
    </div>
  );
}

/** Fila de condición por defecto para una regla nueva. */
export function reglaNueva(preguntas: PreguntaFormulario[]): ReglaLogica | null {
  const ref = preguntas[preguntas.length - 1];
  if (!ref) return null;
  return { id: nuevoId(), condiciones: [condicionDefecto(ref)], modo: 'todas' };
}
