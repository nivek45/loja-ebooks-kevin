const { APP_ORIGIN, CRON_SECRET } = process.env;
if (!APP_ORIGIN?.startsWith('https:') || !CRON_SECRET)
  throw new Error('Configure APP_ORIGIN HTTPS e CRON_SECRET.');
const r = await fetch(new URL('/api/internal/maintenance', APP_ORIGIN), {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + CRON_SECRET },
  signal: AbortSignal.timeout(280000),
});
if (!r.ok) throw new Error('Falha de manutenção: HTTP ' + r.status);
const result = await r.json();
console.log(result);
if (result.failed > 0) process.exitCode = 1;
