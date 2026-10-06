// Private account-deletion outbox. PostgreSQL queues room IDs atomically with
// account erasure; this object only acknowledges a job after its room is gone.
export const MAINTENANCE = '__maintenance';
const RETRY_MS = 30000;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function armMaintenance(ctx) {
  const next = Date.now() + RETRY_MS;
  const alarm = await ctx.storage.getAlarm();
  if (alarm === null || alarm > next) await ctx.storage.setAlarm(next);
}

export async function drainCleanup(ctx, env, db) {
  // Persist a wake-up before any I/O: a crash or database outage keeps retrying.
  await armMaintenance(ctx);
  const jobs = await db.rpc('pending_room_cleanup');
  if (!Array.isArray(jobs)) throw new Error('Invalid cleanup queue response');
  let remaining = false;
  for (const { couple_id: pair } of jobs) {
    try {
      const result = await env.ROOMS.get(env.ROOMS.idFromName(`couple:${pair}`)).fetch('https://room/admin/close', {
        method: 'POST', body: JSON.stringify({ reason: 'This account was deleted', discard: true }),
      });
      if (!result.ok) throw new Error('Stored room cleanup is unavailable');
      // Room closure clears its own presence best-effort. Delete it explicitly
      // here too so a failed earlier call cannot leave names after completion.
      const presence = await env.ROOMS.get(env.ROOMS.idFromName('__stats')).fetch('https://stats/gone', {
        method: 'POST', body: JSON.stringify({ room: `couple:${pair}` }),
      });
      if (!presence.ok) throw new Error('Room presence cleanup is unavailable');
      await db.rpc('complete_room_cleanup', { p_couple_id: pair });
    } catch (error) {
      remaining = true;
      console.error('Account room cleanup pending:', error.message);
    }
  }
  return { pending: remaining || jobs.length >= 100 };
}

export async function maintenanceFetch(ctx, env, db, request) {
  if (!db.enabled) return json(503, { error: 'Account cleanup is unavailable' });
  const path = new URL(request.url).pathname;
  if (path === '/arm') { await armMaintenance(ctx); return json(200, { ok: true }); }
  if (path === '/drain') return json(200, await drainCleanup(ctx, env, db));
  return json(404, { error: 'Not found' });
}

export async function maintenanceAlarm(ctx, env, db) {
  // Keep polling after empty batches too: a caller may stop after the database
  // commits a deletion and before notifying this object about the new job.
  // Failure to schedule must propagate so Cloudflare retries the fired alarm.
  await armMaintenance(ctx);
  try { await drainCleanup(ctx, env, db); }
  catch (error) { console.error('Account cleanup retry pending:', error.message); }
}
