// Disparador del cron de plataforma: Render Cron Job llama a este script,
// que invoca el endpoint protegido por CRON_SECRET (polling de Telegram,
// facturas vencidas, avisos y resumen diario).
//
// Env requeridas: API_URL (base de la API, sin /api final) y CRON_SECRET.
// Uso local: node --env-file=apps/api/.env.local apps/api/scripts/disparar-plataforma.mjs

const apiUrl = process.env.API_URL;
const secreto = process.env.CRON_SECRET;

if (!apiUrl || !secreto) {
  console.error('Faltan API_URL y/o CRON_SECRET');
  process.exit(1);
}

const url = `${apiUrl.replace(/\/+$/, '')}/cron/plataforma`;

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-cron-secret': secreto },
  });
  const texto = await res.text();
  console.log(`[plataforma] ${res.status} ${texto}`);
  process.exit(res.ok ? 0 : 1);
} catch (error) {
  console.error('[plataforma] error de red:', error);
  process.exit(1);
}
