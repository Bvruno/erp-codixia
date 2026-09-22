export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatearFechaHora(valor: string | null | undefined): string {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatearDinero(monto: number, moneda = 'USD'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 2,
  }).format(monto);
}

export function hace(valor: string | null | undefined): string {
  if (!valor) return '—';
  const ms = Date.now() - new Date(valor).getTime();
  if (Number.isNaN(ms)) return '—';
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} mes${meses === 1 ? '' : 'es'}`;
}

export function periodoActual(): string {
  return new Date().toISOString().slice(0, 7);
}
