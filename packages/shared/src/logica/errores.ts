// Núcleo puro de captura de errores (sin dependencias de entorno):
// payload, fingerprint, normalización y argumentos RPC.
// La persistencia a error_logs vive en cada capa:
// - server: apps/api (captureErrorServer, service role)
// - navegador: apps/web (captureErrorClient, anon key)

export interface ErrorPayload {
  source: 'client' | 'server';
  message: string;
  level?: 'error' | 'warning';
  name?: string;
  code?: string;
  stack?: string;
  route?: string;
  method?: string;
  userId?: string;
  organizationId?: string;
  userAgent?: string;
  clientIp?: string;
  context?: Record<string, unknown>;
}

const FINGERPRINT_MAX = 500;

// Fingerprint estable: name + message (el stack cambia con cada build y
// generaría duplicados). sha-256 vía Web Crypto (browser y Node 18+).
export async function fingerprintError(
  name: string | undefined,
  message: string,
): Promise<string> {
  const input = `${name ?? ''}|${message.slice(0, FINGERPRINT_MAX)}`;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Normaliza cualquier valor lanzado (Error, string, objeto, desconocido)
// a { message, name, stack } seguro para persistir.
export function normalizeError(err: unknown): {
  message: string;
  name?: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  if (typeof err === 'string' && err) {
    return { message: err, name: 'Error' };
  }
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const message =
      typeof record.message === 'string' ? record.message : 'Error desconocido';
    return {
      message,
      name: typeof record.name === 'string' ? record.name : 'Error',
      stack: typeof record.stack === 'string' ? record.stack : undefined,
    };
  }
  return { message: String(err ?? 'Error desconocido'), name: 'Error' };
}

export function errorToPayload(
  err: unknown,
  source: 'client' | 'server',
  extra?: Partial<ErrorPayload>,
): ErrorPayload {
  const { message, name, stack } = normalizeError(err);
  return {
    source,
    message,
    name,
    stack,
    ...extra,
  };
}

function serializeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const serialized = JSON.stringify(context);
  if (serialized.length > 50000) return { truncated: true };
  return context;
}

export async function rpcArgs(payload: ErrorPayload) {
  const fingerprint = await fingerprintError(payload.name, payload.message);
  return {
    p_source: payload.source,
    p_message: payload.message,
    p_level: payload.level ?? 'error',
    p_name: payload.name ?? null,
    p_code: payload.code ?? null,
    p_stack: payload.stack ?? null,
    p_route: payload.route ?? null,
    p_method: payload.method ?? null,
    p_user_id: payload.userId ?? null,
    p_organization_id: payload.organizationId ?? null,
    p_user_agent: payload.userAgent ?? null,
    p_client_ip: payload.clientIp ?? null,
    p_context: serializeContext(payload.context) ?? {},
    p_fingerprint: fingerprint,
  };
}