/**
 * Cache del navegador para datos de aplicación ya filtrados por RLS.
 *
 * - Backend: IndexedDB (JSON grande de estructura); fallback localStorage
 *   si IDB no está disponible; in-memory en SSR/tests.
 * - Claves versionadas (`cs:<scope>:v<N>:<id>`) para invalidar por cambio
 *   de schema o de formato de payload.
 * - Solo datos que el usuario ya puede ver (respuestas filtradas por RLS);
 *   aisladas por userId. Nunca tokens ni sesión (viven en cookies de
 *   supabase-ssr).
 */

type CacheEntry = { v: unknown; t: number };

export type CacheBackend = {
  get: (key: string) => Promise<CacheEntry | null>;
  set: (key: string, value: unknown, cachedAt: number) => Promise<void>;
  del: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

const DB_NAME = 'erp-codixia-cache';
const DB_VERSION = 1;
const STORE = 'kv';

export class InMemoryBackend implements CacheBackend {
  private entries = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, value: unknown, cachedAt: number): Promise<void> {
    this.entries.set(key, { v: value, t: cachedAt });
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

export class LocalStorageBackend implements CacheBackend {
  private static readonly PREFIX = 'cs:';

  private keyOf(key: string): string {
    return `${LocalStorageBackend.PREFIX}${key}`;
  }

  async get(key: string): Promise<CacheEntry | null> {
    try {
      const raw = window.localStorage.getItem(this.keyOf(key));
      if (!raw) return null;
      return JSON.parse(raw) as CacheEntry;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, cachedAt: number): Promise<void> {
    try {
      window.localStorage.setItem(this.keyOf(key), JSON.stringify({ v: value, t: cachedAt }));
    } catch {
      // Quota u otros errores: el cache es best-effort.
    }
  }

  async del(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(this.keyOf(key));
    } catch {
      // best-effort
    }
  }

  async clear(): Promise<void> {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(LocalStorageBackend.PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // best-effort
    }
  }
}

export class IdbBackend implements CacheBackend {
  constructor(private readonly db: IDBDatabase) {}

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string): Promise<CacheEntry | null> {
    return new Promise((resolve) => {
      try {
        const req = this.tx('readonly').get(key);
        req.onsuccess = () => resolve((req.result as CacheEntry | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async set(key: string, value: unknown, cachedAt: number): Promise<void> {
    await new Promise<void>((resolve) => {
      try {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ key, v: value, t: cachedAt });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async del(key: string): Promise<void> {
    await new Promise<void>((resolve) => {
      try {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async clear(): Promise<void> {
    await new Promise<void>((resolve) => {
      try {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

function idbOpen(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let backendPromise: Promise<CacheBackend> | null = null;

async function resolveBackend(): Promise<CacheBackend> {
  const idb = await idbOpen();
  if (idb) return new IdbBackend(idb);
  return new LocalStorageBackend();
}

function getBackend(): Promise<CacheBackend> {
  if (!backendPromise) {
    backendPromise = resolveBackend();
  }
  return backendPromise;
}

/** Solo para tests: fuerza un backend distinto en el próximo acceso. */
export function resetCacheBackend(): void {
  backendPromise = null;
}

/** Solo para tests: fija un backend concreto. */
export function setCacheBackendForTests(backend: CacheBackend): void {
  backendPromise = Promise.resolve(backend);
}

export type CachedValue<T> = { value: T; cachedAt: number };

/**
 * Lee una entrada. Si `ttlMs` se pasa y la entrada es más vieja, se
 * considera ausente (el caller revalidará).
 */
export async function cacheGet<T>(key: string, ttlMs?: number): Promise<CachedValue<T> | null> {
  const backend = await getBackend();
  const entry = await backend.get(key);
  if (!entry) return null;
  if (ttlMs !== undefined && Date.now() - entry.t > ttlMs) return null;
  return { value: entry.v as T, cachedAt: entry.t };
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const backend = await getBackend();
  await backend.set(key, value, Date.now());
}

export async function cacheDel(key: string): Promise<void> {
  const backend = await getBackend();
  await backend.del(key);
}

/** Elimina todo el cache de la aplicación (logout / cambio de cuenta). */
export async function cacheClearAll(): Promise<void> {
  const backend = await getBackend();
  await backend.clear();
}

// ---- Sincronización entre pestañas ----
// Cuando una pestaña muta datos (write propio o evento realtime), notifica a
// las demás para que invaliden React Query y descarten la copia local. No se
// emite desde cacheSet/cacheDel para evitar bucles de revalidación.

const CANAL_CACHE = 'cs-cache';

const emisor: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CANAL_CACHE) : null;

type OyenteCambio = (claves: string[]) => void;
const oyentes = new Set<OyenteCambio>();

if (emisor) {
  emisor.onmessage = (evt) => {
    const claves = (evt.data as { claves?: unknown } | null)?.claves;
    if (!Array.isArray(claves) || claves.length === 0) return;
    for (const oyente of oyentes) oyente(claves as string[]);
  };
}

/** Registra un oyente de cambios de otras pestañas. Devuelve el cleanup. */
export function alCambiarCache(oyente: OyenteCambio): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Notifica a las OTRAS pestañas que estas claves quedaron obsoletas. */
export function notificarCambioCache(claves: string[]): void {
  if (claves.length === 0) return;
  emisor?.postMessage({ claves });
}