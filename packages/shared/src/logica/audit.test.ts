import { describe, it, expect, vi } from 'vitest';
import { insertAuditLog } from '@/lib/audit';

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}));

import { log } from '@/lib/logger';
const mockedLog = vi.mocked(log);

export function clientWith(insertImpl: unknown) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(insertImpl as never),
    })),
  } as unknown as Parameters<typeof insertAuditLog>[0];
}

describe('insertAuditLog', () => {
  it('inserta con mapeo correcto', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    await insertAuditLog(clientWith(insert), 'org1', 'update_telegram', 'telegram_config', { a: 1 }, { b: 2 });
    expect(insert).toHaveBeenCalledWith({
      organization_id: 'org1',
      user_id: 'u1',
      action: 'update_telegram',
      entity: 'telegram_config',
      before: { a: 1 },
      after: { b: 2 },
    });
  });

  it('mapea before/after null por defecto', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    await insertAuditLog(clientWith(insert), 'org1', 'x', 'y');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ before: null, after: null, user_id: 'u1' }),
    );
  });

  it('loguea error sin lanzar', async () => {
    mockedLog.mockClear();
    const insert = vi.fn(async () => ({ error: { message: 'insert falló' } }));
    await insertAuditLog(clientWith(insert), 'org1', 'act', 'ent');
    expect(mockedLog).toHaveBeenCalledWith(
      'error',
      'insertAuditLog falló',
      expect.objectContaining({ action: 'act', entity: 'ent' }),
    );
  });
});
