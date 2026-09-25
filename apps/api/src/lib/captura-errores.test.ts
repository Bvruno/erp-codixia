import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureErrorServer } from './captura-errores';

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}));
vi.mock('@/lib/telegram-plataforma', () => ({
  emitirErrorPlataforma: vi.fn(),
}));

import { getAdminClient } from '@/lib/supabase/admin';
import { emitirErrorPlataforma } from '@/lib/telegram-plataforma';

const mockedGetAdminClient = vi.mocked(getAdminClient);
const mockedEmitirError = vi.mocked(emitirErrorPlataforma);

function rpcClient(result: unknown) {
  return {
    rpc: vi.fn(async () => result),
  } as unknown as ReturnType<typeof getAdminClient>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('captureErrorServer', () => {
  it('no-op sin service role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);
    await captureErrorServer({ source: 'server', message: 'boom' });
    expect(mockedGetAdminClient).not.toHaveBeenCalled();
  });

  it('llama rpc y notifica a la plataforma cuando el error es nuevo', async () => {
    mockedGetAdminClient.mockReturnValue(rpcClient({ data: { id: 'err-1', is_new: true } }));
    await captureErrorServer({
      source: 'server',
      message: 'boom',
      name: 'TypeError',
      route: '/api/x',
    });
    const rpc = mockedGetAdminClient.mock.results[0].value.rpc as ReturnType<typeof vi.fn>;
    expect(rpc).toHaveBeenCalledWith('log_error', {
      p_source: 'server',
      p_message: 'boom',
      p_level: 'error',
      p_name: 'TypeError',
      p_code: null,
      p_stack: null,
      p_route: '/api/x',
      p_method: null,
      p_user_id: null,
      p_organization_id: null,
      p_user_agent: null,
      p_client_ip: null,
      p_context: {},
      p_fingerprint: expect.any(String),
    });
    expect(mockedEmitirError).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'err-1', message: 'boom', route: '/api/x' })
    );
  });

  it('no notifica cuando el error ya existía', async () => {
    mockedGetAdminClient.mockReturnValue(rpcClient({ data: { id: 'err-1', is_new: false } }));
    await captureErrorServer({ source: 'server', message: 'boom' });
    expect(mockedEmitirError).not.toHaveBeenCalled();
  });

  it('nunca lanza aunque la rpc falle', async () => {
    mockedGetAdminClient.mockReturnValue(rpcClient({ error: { message: 'rpc falló' } }));
    await expect(
      captureErrorServer({ source: 'server', message: 'boom' })
    ).resolves.toBeUndefined();
  });
});
