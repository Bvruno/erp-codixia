'use client';

import { Eye, Pencil } from 'lucide-react';
import { AccionEntidad } from './accion-entidad';

// Pill Editando/Visualizando compartido por documento y mapa mental.

export function ToggleModoEntidad({
  modo,
  onCambio,
  disabled = false,
  motivo,
  className,
}: {
  modo: 'editar' | 'ver';
  onCambio: (modo: 'editar' | 'ver') => void;
  disabled?: boolean;
  motivo?: string;
  className?: string;
}) {
  const editando = modo === 'editar';
  return (
    <AccionEntidad
      icono={editando ? Pencil : Eye}
      pressed={editando}
      disabled={disabled}
      title={
        disabled
          ? motivo ?? 'Sin permisos de edición'
          : editando
            ? 'Cambiar a modo visualización'
            : 'Cambiar a modo edición'
      }
      onClick={() => onCambio(editando ? 'ver' : 'editar')}
      className={className}
    >
      {editando ? 'Editando' : 'Visualizando'}
    </AccionEntidad>
  );
}
