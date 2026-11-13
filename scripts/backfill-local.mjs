// Repeatedly triggers the scheduled ingest on a local `npm run dev` server.
// Usage: node scripts/backfill-local.mjs [runs=20] [port=8787]
// Prints only the run counters, never match data.
const runs = Number(process.argv[2] ?? 20);
const port = Number(process.argv[3] ?? 8787);
const url = `http://127.0.0.1:${port}/__scheduled?cron=${encodeURIComponent("* * * * *")}`;

for (let i = 1; i <= runs; i++) {
  const res = await fetch(url);
  console.log(`run ${i}/${runs}: HTTP ${res.status}`);
  if (!res.ok) process.exit(1);
  // The handler work runs in waitUntil; give it time before the next trigger.
  await new Promise((r) => setTimeout(r, 4000));
}
console.log("done - check the dev server log for 'ingest {...}' counters");
