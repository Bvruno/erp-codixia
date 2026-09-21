import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAdminClient } from '@/lib/supabase/admin';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { createClient as supabaseCreate } from '@supabase/supabase-js';
const mockedCreate = vi.mocked(supabaseCreate);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreate.mockReturnValue('client' as never);
  process.env.SUPABASE_URL = 'https://db.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

describe('getAdminClient', () => {
  it('crea un client con URL y service role key', () => {
    getAdminClient();
    expect(mockedCreate).toHaveBeenCalledWith(
      'https://db.supabase.co',
      'service-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
  });

  it('reusa el mismo client en llamadas siguientes (singleton)', () => {
    const a = getAdminClient();
    const b = getAdminClient();
    expect(a).toBe(b);
  });
});

