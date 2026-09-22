// Base única de la API. En dev el proxy de Vite enruta /api → localhost:8787;
// en producción VITE_API_URL apunta al servicio de la API en Render.
export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';
