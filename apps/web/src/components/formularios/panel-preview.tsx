'use client';

import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RenderizadorFormulario } from './renderizador-formulario';
import type { AjustesFormulario, FormularioEsquema } from '@/types';

// Capa 2: vista previa en vivo mientras se edita (capa 1).

export function PanelPreview({
  nombre,
  descripcion,
  esquema,
  ajustes,
}: {
  nombre: string;
  descripcion: string | null;
  esquema: FormularioEsquema;
  ajustes: AjustesFormulario;
}) {
  const [vista, setVista] = useState<'completo' | 'movil'>('completo');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Vista previa
        </p>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setVista('completo')}
            className={cn(
              'flex size-7 items-center justify-center rounded',
              vista === 'completo' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            )}
            title="Ancho completo"
            aria-label="Vista previa a ancho completo"
            aria-pressed={vista === 'completo'}
          >
            <Monitor className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setVista('movil')}
            className={cn(
              'flex size-7 items-center justify-center rounded',
              vista === 'movil' ? 'bg-muted text-foreground' : 'text-muted-foreground'
            )}
            title="Ancho móvil"
            aria-label="Vista previa móvil"
            aria-pressed={vista === 'movil'}
          >
            <Smartphone className="size-4" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'mx-auto transition-[max-width]',
          vista === 'movil' ? 'max-w-sm' : 'max-w-none'
        )}
      >
        <div className="rounded-xl border bg-muted/20 p-3">
          <RenderizadorFormulario
            modo="preview"
            formulario={{
              id: 'preview',
              nombre: nombre || 'Formulario sin título',
              descripcion,
              esquema,
              modo_acceso: ajustes.modo_acceso,
              identificadores: ajustes.identificadores,
              requiere_consentimiento: ajustes.requiere_consentimiento,
              texto_privacidad: ajustes.texto_privacidad,
              mensaje_confirmacion: ajustes.mensaje_confirmacion,
            }}
          />
        </div>
      </div>
    </div>
  );
}
