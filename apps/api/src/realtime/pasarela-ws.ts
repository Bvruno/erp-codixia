import type { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import type { Server } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { verificarJwt } from '../supabase/verificar-token';
import { fetchConLog, logsActivos } from '../lib/log';

interface EventoCliente {
  type: 'auth' | 'subscribe' | 'unsubscribe' | 'broadcast';
  token?: string;
  refresh_token?: string;
  channel?: string;
  opts?: unknown;
  payload?: unknown;
  listeners?: { evt: string; cfg: unknown }[];
}

interface CanalActivo {
  canal: ReturnType<ReturnType<typeof createClient>['channel']>;
}

// Pasarela realtime: el SPA se conecta a /cws; cada subscribe abre un
// canal Supabase Realtime CON EL JWT del usuario (RLS aplica igual que
// antes) y los eventos se reenvían al socket. Separación total: el
// navegador nunca toca Supabase Realtime directamente.
export function crearPasarelaRealtime(app: Hono) {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.get(
    '/cws',
    upgradeWebSocket(() => {
      let token: string | null = null;
      let supabase: ReturnType<typeof createClient> | null = null;
      const canales = new Map<string, CanalActivo>();
      let ping: ReturnType<typeof setInterval> | null = null;

      return {
        onOpen: (_evt, ws) => {
          console.log('[cws] conexión abierta');
          // Heartbeat: detecta sockets muertos (proxy/NAT) sin esperar al TCP.
          ping = setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // socket cerrado: onClose limpia el intervalo
            }
          }, 25_000);
        },
        onMessage: async (evt, ws) => {
          let msg: EventoCliente;
          try {
            msg = JSON.parse(String(evt.data)) as EventoCliente;
          } catch {
            ws.close(1008, 'JSON inválido');
            return;
          }

          if (msg.type === 'auth') {
            const usuario = msg.token ? await verificarJwt(msg.token) : null;
            if (!usuario) {
              ws.close(1008, 'Token inválido');
              return;
            }
            token = msg.token ?? null;
            if (!supabase) {
              supabase = createClient(
                process.env.SUPABASE_URL!,
                process.env.SUPABASE_ANON_KEY!,
                {
                  auth: { persistSession: true, autoRefreshToken: false },
                  global: { fetch: fetchConLog('realtime') },
                }
              );
            }
            // El realtime usa la sesión interna del client; setSession con
            // access+refresh reales y setAuth explícito para que el token
            // esté listo ANTES de crear canales (sin depender de SIGNED_IN).
            if (msg.refresh_token) {
              await supabase.auth.setSession({
                access_token: msg.token!,
                refresh_token: msg.refresh_token,
              });
            }
            supabase.realtime.setAuth(msg.token!);
            const { data: sesionActual } = await supabase.auth.getSession();
            if (!sesionActual.session) {
              // Sin sesión real: que el SPA reconecte con tokens frescos.
              ws.send(JSON.stringify({ type: 'auth_error' }));
              return;
            }
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            if (logsActivos()) console.log('[cws] auth ok');
            return;
          }

          if (!token || !supabase) {
            ws.close(1008, 'No autenticado');
            return;
          }

          if (msg.type === 'subscribe' && msg.channel) {
            // Re-suscripción tras reconexión: cancela el canal previo con el
            // mismo nombre para no duplicar eventos.
            canales.get(msg.channel)?.canal.unsubscribe();
            const canal = supabase.channel(msg.channel, msg.opts as never);
            for (const l of msg.listeners ?? []) {
              canal.on(l.evt as never, l.cfg as never, (payload: unknown) => {
                if (logsActivos()) {
                  const tabla = (l.cfg as { table?: string } | null)?.table ?? '?';
                  console.log(`[rt] → canal=${msg.channel} tabla=${tabla}`);
                }
                ws.send(
                  JSON.stringify({
                    type: l.evt,
                    channel: msg.channel,
                    cfg: l.cfg,
                    payload,
                  })
                );
              });
            }
            canal.subscribe((status) => {
              // El SPA revalida sus queries si el canal de Supabase falla.
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.log('[cws] canal', msg.channel, 'estado:', status);
                ws.send(
                  JSON.stringify({ type: 'canal_status', channel: msg.channel, status })
                );
              }
            });
            canales.set(msg.channel, { canal });
            ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
            if (logsActivos()) console.log('[cws] subscribe', msg.channel);
            return;
          }

          if (msg.type === 'unsubscribe' && msg.channel) {
            canales.get(msg.channel)?.canal.unsubscribe();
            canales.delete(msg.channel);
            console.log('[cws] unsubscribe', msg.channel);
            return;
          }

          if (msg.type === 'broadcast' && msg.channel) {
            canales.get(msg.channel)?.canal.send(msg.payload as never);
          }
        },
        onClose: () => {
          if (ping) clearInterval(ping);
          ping = null;
          for (const activo of canales.values()) {
            activo.canal.unsubscribe();
          }
          canales.clear();
        },
      };
    })
  );

  return injectWebSocket;
}

export function inyectarSocketServer(
  injectWebSocket: (server: Server) => void,
  server: Server
) {
  injectWebSocket(server);
}
