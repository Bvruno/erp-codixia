import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '@/lib/logger';

describe('log', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info a console.log con JSON', () => {
    log('info', 'hola', { org: 'o1' });
    expect(infoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(infoSpy.mock.calls[0][0]);
    expect(parsed).toMatchObject({ level: 'info', message: 'hola', org: 'o1' });
    expect(parsed.ts).toBeTruthy();
  });

  it('warn a console.warn', () => {
    log('warn', 'cuidado');
    const parsed = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(parsed.level).toBe('warn');
  });

  it('error a console.error', () => {
    log('error', 'falló', { code: 500 });
    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed).toMatchObject({ level: 'error', code: 500 });
  });
});
