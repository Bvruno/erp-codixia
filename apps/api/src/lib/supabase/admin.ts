import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchConLog } from '../log';

let _adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        global: { fetch: fetchConLog('admin') },
      }
    );
  }
  return _adminClient;
}
