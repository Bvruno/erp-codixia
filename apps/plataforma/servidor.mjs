// Servidor estático mínimo para producción (Render Web Service).
// Sirve apps/plataforma/dist con fallback SPA a index.html para deep
// links de TanStack Router. Sin dependencias: node:http + node:fs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const puerto = Number(process.env.PORT) || 4174;

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function cabeceras(rutaArchivo) {
  const ext = extname(rutaArchivo).toLowerCase();
  const tipo = tipos[ext] ?? 'application/octet-stream';
  const cache = rutaArchivo.includes(`${sep}assets${sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  return { 'Content-Type': tipo, 'Cache-Control': cache };
}

async function enviar(res, rutaArchivo, estado = 200, metodo = 'GET') {
  const cuerpo = await readFile(rutaArchivo);
  res.writeHead(estado, { ...cabeceras(rutaArchivo), 'Content-Length': cuerpo.length });
  res.end(metodo === 'HEAD' ? undefined : cuerpo);
}

const servidor = createServer(async (req, res) => {
  const metodo = req.method ?? 'GET';
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Método no permitido');
    return;
  }

  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (ruta === '/') ruta = '/index.html';

  const candidato = normalize(join(dist, ruta));
  if (!candidato.startsWith(dist + sep)) {
    res.writeHead(403).end();
    return;
  }

  try {
    await enviar(res, candidato, 200, metodo);
    return;
  } catch {
    // No existe el archivo: fallback SPA (rutas profundas tipo /solicitudes).
  }

  try {
    await enviar(res, join(dist, 'index.html'), 200, metodo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

servidor.listen(puerto, '0.0.0.0', () => {
  console.log(`[plataforma] sirviendo ${dist} en http://0.0.0.0:${puerto}`);
});
