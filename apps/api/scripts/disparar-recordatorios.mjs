// Disparador del cron de recordatorios: Render Cron Job llama a este script,
// que invoca el endpoint protegido por CRON_SECRET.
//
// Env requeridas: API_URL (base de la API, sin /api final) y CRON_SECRET.
// Uso local: node apps/api/scripts/disparar-recordatorios.mjs

const apiUrl = process.env.API_URL;
const secreto = process.env.CRON_SECRET;

if (!apiUrl || !secreto) {
  console.error('Faltan API_URL y/o CRON_SECRET');
  process.exit(1);
}

const url = `${apiUrl.replace(/\/+$/, '')}/cron/recordatorios`;

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-cron-secret': secreto },
  });
  const texto = await res.text();
  console.log(`[recordatorios] ${res.status} ${texto}`);
  process.exit(res.ok ? 0 : 1);
} catch (error) {
  console.error('[recordatorios] error de red:', error);
  process.exit(1);
}
