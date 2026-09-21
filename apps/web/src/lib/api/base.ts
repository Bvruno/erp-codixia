// Base única de la API. En dev el proxy de Vite enruta /api → localhost:8787;
// en producción VITE_API_URL apunta al servicio de la API en Render (origen
// distinto al del SPA, por eso la URL absoluta).
export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

// URL del WebSocket de realtime (/cws). Con VITE_WS_URL definido apunta a la
// API en Render; sin él se deriva del host actual (dev pasa por el proxy ws).
export function urlRealtime(): string {
  const configurada = import.meta.env.VITE_WS_URL;
  if (configurada) return configurada;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/cws`;
}
