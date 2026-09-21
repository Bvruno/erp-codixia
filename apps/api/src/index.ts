import { serve } from '@hono/node-server';
import { cargarEntorno } from './config';
import { crearApp } from './app';
import { crearPasarelaRealtime, inyectarSocketServer } from './realtime/pasarela-ws';

const entorno = cargarEntorno();
const app = crearApp(entorno.WEB_ORIGIN);
const injectWebSocket = crearPasarelaRealtime(app);

const server = serve({ fetch: app.fetch, port: entorno.PORT }, (info) => {
  console.log(`[erp-api] escuchando en http://localhost:${info.port}`);
});

inyectarSocketServer(injectWebSocket, server as unknown as import('node:http').Server);
