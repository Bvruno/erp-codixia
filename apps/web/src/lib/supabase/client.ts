import { createClient as crearSupabase, type SupabaseClient } from '@supabase/supabase-js';

let _cliente: SupabaseClient | null = null;

// Cliente browser (anon key + RLS). La sesión vive en localStorage.
export function createClient(): SupabaseClient {
  if (!_cliente) {
    _cliente = crearSupabase(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string
    );
  }
  return _cliente;
}