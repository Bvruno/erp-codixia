import { createClient } from '@/lib/supabase/client';
import { urlRealtime } from './api/base';
import { queryClient } from './query-client';

// Cliente realtime por WebSocket → pasarela Hono (/cws).
// API compatible con supabase.channel(...).on(...).subscribe() para
// minimizar el diff de los componentes. La separación total vive en
// la pasarela: el navegador nunca abre canales Supabase directos.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API compatible con supabase channel
type Escucha = { evt: string; cfg: CfgEscucha; cb: (payload: any) => void };

export type CfgEscucha = {
  event?: string;
  schema?: string;
  table?: string;
  filter?: string;
};

export interface CanalRealtime {
  on(evt: string, cfg: CfgEscucha, cb: (payload: any) => void): CanalRealtime; // eslint-disable-line @typescript-eslint/no-explicit-any
  subscribe(): CanalRealtime;
  unsubscribe(): void;
  send(mensaje: unknown): void;
}

let socket: WebSocket | null = null;
let conectando = false;
let autenticado = false;
let huboDesconexion = false;
let intentosConexion = 0;
let authListenerRegistrado = false;
let watchdog: ReturnType<typeof setInterval> | null = null;
let ultimoMensajeEn = 0;
const canales = new Map<string, { escuchas: Escucha[]; opts?: unknown }>();
const suscritos = new Set<string>();

const ESPERA_SIN_MENSAJES_MS = 60_000;
const PING_ESPERADO_MS = 25_000;

function logRt(mensaje: string) {
  if (import.meta.env.DEV) console.log(`[rt] ${mensaje}`);
}

// Sin cola: los mensajes solo se envían con el socket abierto. Las
// suscripciones se reenvían completas desde `canales` al autenticarse, así
// que encolar `unsubscribe` provocaba que un canal recién creado se cerrara
// al vaciar la cola después del `auth_ok` (suscripción "fantasma").
function enviar(mensaje: unknown) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(mensaje));
  }
}

function iniciarWatchdog() {
  if (watchdog) clearInterval(watchdog);
  ultimoMensajeEn = Date.now();
  watchdog = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - ultimoMensajeEn > ESPERA_SIN_MENSAJES_MS) {
      logRt('sin mensajes del servidor: reconectando');
      socket.close();
    }
  }, PING_ESPERADO_MS);
}

function detenerWatchdog() {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
}

function reenviarSesion() {
  void createClient()
    .auth.getSession()
    .then(({ data }) => {
      const sesion = data.session;
      if (!sesion) return;
      enviar({
        type: 'auth',
        token: sesion.access_token,
        refresh_token: sesion.refresh_token,
      });
    });
}

function registrarListenerToken() {
  if (authListenerRegistrado) return;
  authListenerRegistrado = true;
  createClient().auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'TOKEN_REFRESHED' && sesion) {
      enviar({
        type: 'auth',
        token: sesion.access_token,
        refresh_token: sesion.refresh_token,
      });
    }
  });
}

function programarReconexion() {
  const base = Math.min(8_000, 1000 * 2 ** intentosConexion);
  const delay = base * (0.5 + Math.random() * 0.5);
  intentosConexion += 1;
  setTimeout(asegurarConexion, delay);
}

function asegurarConexion() {
  if (typeof WebSocket === 'undefined') return; // jsdom / SSR: no-op
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (conectando) return;
  conectando = true;
  registrarListenerToken();

  socket = new WebSocket(urlRealtime());

  socket.onopen = () => {
    conectando = false;
    iniciarWatchdog();
    reenviarSesion();
  };

  socket.onmessage = (evt) => {
    ultimoMensajeEn = Date.now();
    let msg: {
      type: string;
      channel?: string;
      cfg?: CfgEscucha;
      payload?: unknown;
      status?: string;
    };
    try {
      msg = JSON.parse(String(evt.data));
    } catch {
      return;
    }
    if (msg.type === 'ping') {
      enviar({ type: 'pong' });
      return;
    }
    if (msg.type === 'canal_status') {
      // El canal de Supabase falló: revalidar todo para no quedar con datos
      // viejos si la suscripción no se recupera.
      if (msg.status === 'CHANNEL_ERROR' || msg.status === 'TIMED_OUT') {
        logRt(`canal ${msg.channel ?? '?'} ${msg.status}: revalidando queries`);
        void queryClient.invalidateQueries();
      }
      return;
    }
    if (msg.type === 'auth_error') {
      // Sesión no quedó lista en la pasarela: reintentar con tokens frescos.
      logRt('auth_error: reconectando');
      socket?.close();
      return;
    }
    if (msg.type === 'auth_ok') {
      autenticado = true;
      intentosConexion = 0;
      if (huboDesconexion) {
        // Catch-up: los eventos ocurridos durante la desconexión se
        // perdieron; una revalidación completa recupera el estado.
        huboDesconexion = false;
        logRt('reconectado: invalidando queries para catch-up');
        void queryClient.invalidateQueries();
      }
      // Reenvía las suscripciones activas (única fuente de verdad: `canales`).
      for (const canal of canales.keys()) {
        if (!suscritos.has(canal)) continue;
        const info = canales.get(canal);
        if (info) {
          enviar({
            type: 'subscribe',
            channel: canal,
            opts: info.opts,
            listeners: info.escuchas.map((e) => ({ evt: e.evt, cfg: e.cfg })),
          });
        }
      }
      return;
    }
    if (msg.type === 'subscribed') return;
    if ((msg.type === 'postgres_changes' || msg.type === 'broadcast') && msg.channel) {
      const info = canales.get(msg.channel);
      if (!info) return;
      const cfg = msg.cfg;
      info.escuchas
        .filter(
          (e) =>
            e.evt === msg.type &&
            (e.cfg.table ?? '') === (cfg?.table ?? '') &&
            (e.cfg.filter ?? '') === (cfg?.filter ?? '')
        )
        .forEach((e) => {
          logRt(`evento ${cfg?.table ?? msg.type} canal=${msg.channel}`);
          e.cb(msg.payload);
        });
    }
  };

  socket.onclose = () => {
    conectando = false;
    autenticado = false;
    socket = null;
    huboDesconexion = true;
    detenerWatchdog();
    programarReconexion();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

// Al recuperar red/foco/pestaña, reintenta ya (sin esperar backoff).
if (typeof window !== 'undefined') {
  const reconectarYa = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      intentosConexion = 0;
      asegurarConexion();
    }
  };
  window.addEventListener('online', reconectarYa);
  window.addEventListener('focus', reconectarYa);
  window.addEventListener('pageshow', reconectarYa);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconectarYa();
  });
}

export function canalRealtime(nombre: string, opts?: unknown): CanalRealtime {
  const escuchas: Escucha[] = [];
  const canal: CanalRealtime = {
    on(evt, cfg, cb) {
      escuchas.push({ evt, cfg, cb });
      return canal;
    },
    subscribe() {
      canales.set(nombre, { escuchas: [...escuchas], opts });
      suscritos.add(nombre);
      asegurarConexion();
      if (autenticado) {
        enviar({
          type: 'subscribe',
          channel: nombre,
          opts,
          listeners: escuchas.map((e) => ({ evt: e.evt, cfg: e.cfg })),
        });
      }
      return canal;
    },
    unsubscribe() {
      suscritos.delete(nombre);
      canales.delete(nombre);
      // Solo si la pasarela llegó a crear el canal; si no está autenticado
      // nunca existió en el servidor y no hay nada que cancelar.
      if (autenticado) enviar({ type: 'unsubscribe', channel: nombre });
    },
    send(mensaje) {
      if (!autenticado) return;
      enviar({ type: 'broadcast', channel: nombre, payload: mensaje });
    },
  };
  return canal;
}

export function removerCanal(canal: CanalRealtime) {
  canal.unsubscribe();
}
