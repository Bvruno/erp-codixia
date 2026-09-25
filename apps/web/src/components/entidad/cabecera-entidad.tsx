'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { metaEntidad, type TipoEntidadUI } from '@/lib/entidades-meta';
import { SUBTITULO, TITULO_PAGINA } from './tipografia';
import { useAjusteTitulo } from './use-ajuste-titulo';
import { AccionesEntidad } from './accion-entidad';
import { RutaEntidad, type ItemRutaEntidad } from './ruta-entidad';

// Cabecera estándar (fila plana): título ajustado al ancho + subtítulo +
// badges + estado de guardado + acciones. Igual en todas las vistas de la
// app. `tipo` solo aporta la etiqueta accesible de la ruta.

export function CabeceraEntidad({
  tipo,
  titulo,
  subtitulo,
  badges,
  ruta,
  estado,
  acciones,
  className,
}: {
  tipo?: TipoEntidadUI;
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  badges?: React.ReactNode;
  ruta?: ItemRutaEntidad[];
  estado?: React.ReactNode;
  acciones?: React.ReactNode;
  className?: string;
}) {
  const meta = tipo ? metaEntidad(tipo) : undefined;
  const texto = typeof titulo === 'string' ? titulo : '';
  const { contenedorRef, tamano } = useAjusteTitulo(texto);

  return (
    <header className={cn('space-y-2', className)}>
      {ruta && ruta.length > 0 && (
        <RutaEntidad items={ruta} ariaLabel={`Ruta de la ${meta?.etiqueta ?? 'sección'}`} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div ref={contenedorRef} className="relative min-w-0 flex-1">
          {typeof titulo === 'string' ? (
            <h1
              className={cn('h-9 truncate px-1 -mx-1 leading-9', TITULO_PAGINA)}
              style={{ fontSize: `${tamano}px` }}
            >
              {titulo}
            </h1>
          ) : (
            titulo
          )}
          {subtitulo && (
            <p className={cn('mt-0.5', SUBTITULO)}>{subtitulo}</p>
          )}
        </div>
        {badges}
        {estado}
        {acciones && <AccionesEntidad>{acciones}</AccionesEntidad>}
      </div>
    </header>
  );
}

// Título editable con la tipografía de la cabecera y el mismo ajuste
// proporcional. Controlado si se pasa onCambio; si no, confirma en blur/Enter.
export function TituloEditableEntidad({
  valor,
  onCambio,
  onCommit,
  placeholder,
  disabled = false,
  className,
}: {
  valor: string;
  onCambio?: (valor: string) => void;
  onCommit?: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const controlado = onCambio !== undefined;
  const { contenedorRef, tamano } = useAjusteTitulo(valor);

  const confirmar = (v: string) => {
    const limpio = v.trim();
    if (limpio && limpio !== valor) onCommit?.(limpio);
  };

  return (
    <div ref={contenedorRef} className="relative w-full">
      <Input
        {...(controlado
          ? { value: valor, onChange: (e) => onCambio(e.target.value) }
          : { key: valor, defaultValue: valor })}
        disabled={disabled}
        readOnly={disabled}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Título'}
        title={disabled ? valor : 'Click para editar el título'}
        onBlur={(e) => confirmar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.currentTarget.value = valor;
            e.currentTarget.blur();
          }
        }}
        style={{ fontSize: `${tamano}px` }}
        className={cn(
          'h-9 w-full min-w-48 border-none bg-transparent px-1 -mx-1 shadow-none focus-visible:ring-1',
          TITULO_PAGINA,
          className
        )}
      />
    </div>
  );
}
