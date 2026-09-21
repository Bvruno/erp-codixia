'use client';

// Nombre por defecto del clon: "Copia de X" y, si ya existe entre los
// hermanos del contenedor, sufijo numérico incremental.

export function nombreClonUnico(nombre: string, existentes: string[]): string {
  const base = `Copia de ${nombre}`;
  const usados = new Set(existentes.map((n) => n.trim().toLocaleLowerCase()));
  if (!usados.has(base.toLocaleLowerCase())) return base;
  let i = 2;
  while (usados.has(`${base} ${i}`.toLocaleLowerCase())) i += 1;
  return `${base} ${i}`;
}
