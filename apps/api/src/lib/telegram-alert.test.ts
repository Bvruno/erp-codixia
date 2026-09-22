import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramAlert, telegramAlertText } from '@/lib/telegram-alert';

const ROW = {
  id: 'err-1',
  message: 'Fallo en la base de datos',
  name: 'TypeError',
  route: '/api/org/export',
  source: 'server',
  count: 3,
  organization_id: 'org-1',
};

function fakeQuery(data: unknown) {
  const query: {
    select(): unknown;
    eq(): unknown;
    is(): unknown;
    update(): unknown;
    maybeSingle(): Promise<{ data: unknown; error: null }>;
    single(): Promise<{ data: unknown; error: null }>;
  } = {
    select: () => query,
    eq: () => query,
    is: () => query,
    update: () => query,
    maybeSingle: () => Promise.resolve({ data: data ?? null, error: null }),
    single: () => Promise.resolve({ data: data ?? null, error: null }),
  };
  return query;
}

function makeSupabase(opts: {
  row?: unknown;
  org?: unknown;
  config?: unknown;
  owner?: unknown;
  claimResult?: unknown;
}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'error_logs') {
        let updated = false;
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          update: () => {
            updated = true;
            return query;
          },
          maybeSingle: () =>
            Promise.resolve({
              data: updated ? opts.claimResult : opts.row,
              error: null,
            }),
          single: () => Promise.resolve({ data: opts.row, error: null }),
        };
        return query;
      }
      if (table === 'organizations') return fakeQuery(opts.org);
      if (table === 'telegram_config') return fakeQuery(opts.config);
      if (table === 'profiles') return fakeQuery(opts.owner);
      return fakeQuery(null);
    },
  } as unknown as SupabaseClient;
}

const ORG = { name: 'ERP CODIXIA', owner_id: 'owner-1' };

describe('telegramAlertText', () => {
  it('incluye organización, ruta y veces', () => {
    const text = telegramAlertText(ROW, 'ERP CODIXIA');
    expect(text).toContain('ERP CODIXIA');
    expect(text).toContain('Ruta: /api/org/export');
    expect(text).toContain('Veces: 3');
    expect(text).toContain('TypeError: Fallo en la base de datos');
  });

  it('trunca mensajes largos a 200 caracteres', () => {
    const long = { ...ROW, message: 'x'.repeat(500) };
    const text = telegramAlertText(long);
    expect(text).toContain('x'.repeat(200));
    expect(text).not.toContain('x'.repeat(201));
  });

  it('omite línea de organización y ruta cuando faltan', () => {
    const text = telegramAlertText({ ...ROW, route: null });
    expect(text).not.toContain('Ruta:');
    expect(text).not.toContain('Organización:');
  });
});

describe('sendTelegramAlert', () => {
  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_CHAT_ID', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('modo global: envía a TELEGRAM_CHAT_ID con TELEGRAM_BOT_TOKEN de todas las orgs', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'global-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'chat-global');
    const supabase = makeSupabase({
      row: ROW,
      org: ORG,
      claimResult: { id: 'err-1' },
    });

    await sendTelegramAlert(supabase, 'err-1');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botglobal-token/sendMessage');
    const body = JSON.parse(init!.body as string);
    expect(body.chat_id).toBe('chat-global');
    expect(body.text).toContain('ERP CODIXIA');
  });

  it('fallback por-org: usa telegram_config y chat del owner', async () => {
    const supabase = makeSupabase({
      row: ROW,
      org: ORG,
      config: { bot_token: 'org-token', enabled: true },
      owner: { telegram_chat_id: 'chat-owner' },
      claimResult: { id: 'err-1' },
    });

    await sendTelegramAlert(supabase, 'err-1');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botorg-token/sendMessage');
    expect(JSON.parse(init!.body as string).chat_id).toBe('chat-owner');
  });

  it('fallback no envía si el bot de la org está deshabilitado', async () => {
    const supabase = makeSupabase({
      row: ROW,
      org: ORG,
      config: { bot_token: 'org-token', enabled: false },
      owner: { telegram_chat_id: 'chat-owner' },
      claimResult: { id: 'err-1' },
    });

    await sendTelegramAlert(supabase, 'err-1');

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('no envía si otro proceso ya reclamó la alerta', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'global-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'chat-global');
    const supabase = makeSupabase({ row: ROW, org: ORG, claimResult: null });

    await sendTelegramAlert(supabase, 'err-1');

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('no envía sin organización en el error', async () => {
    const supabase = makeSupabase({ row: { ...ROW, organization_id: null } });

    await sendTelegramAlert(supabase, 'err-1');

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});