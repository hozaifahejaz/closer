// A separate private Durable Object stores only explicitly submitted reports
// and guest safety identities. It never queries or copies private answer history.
import { listEntries } from './room-storage.js';
export const TERMS_VERSION = '2026-10-04';
export const SAFETY = '__safety';
export const REASONS = ['Harassment or threats', 'Sexual or inappropriate content', 'Hate or discrimination', 'Child safety', 'Spam or impersonation', 'Other'];
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const safetyHandle = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const pairKey = async (a, b) => 'block:' + await safetyHandle([a, b].sort().join(':'));
const YEAR = 365 * 86400e3;

export async function safetyFetch(ctx, request) {
  const path = new URL(request.url).pathname;
  const body = request.method === 'POST' ? await request.json() : {};
  if (['/terms', '/block', '/report'].includes(path) && await ctx.storage.getAlarm() === null) await ctx.storage.setAlarm(Date.now() + 86400e3);
  if (path === '/terms') {
    const key = 'terms:' + await safetyHandle(body.id);
    if (body.accept === TERMS_VERSION) await ctx.storage.put(key, { version: TERMS_VERSION, at: Date.now() });
    const value = await ctx.storage.get(key);
    return json(200, { accepted: value?.version === TERMS_VERSION && value.at > Date.now() - YEAR });
  }
  if (path === '/blocked' || path === '/block') {
    const key = await pairKey(body.a, body.b);
    if (path === '/block') await ctx.storage.put(key, { at: Date.now() });
    const value = await ctx.storage.get(key);
    return json(200, { blocked: Boolean(value && value.at > Date.now() - YEAR) });
  }
  if (path === '/report') {
    const receiptKey = 'report-receipt:' + await safetyHandle(body.reporter + ':' + body.requestId);
    const receipt = await ctx.storage.get(receiptKey);
    if (receipt) return json(200, { id: receipt.id });
    // Rate limits survive reconnects. No report content is written to logs.
    const key = 'rate:' + await safetyHandle(body.reporter);
    const recent = (await ctx.storage.get(key) || []).filter(at => at > Date.now() - 3600000);
    if (recent.length >= 5) return json(429, { error: 'Please wait before submitting another report.' });
    const id = crypto.randomUUID();
    await ctx.storage.put({ [key]: [...recent, Date.now()], [receiptKey]: { id, at: Date.now() }, ['report:' + id]: { ...body, id, createdAt: Date.now(), status: 'open', events: [] } });
    return json(200, { id });
  }
  if (path === '/reports') {
    const records = Array.from((await listEntries(ctx.storage, 'report:')).values()).filter(report => report.createdAt > Date.now() - YEAR);
    records.sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || Number(b.reason === 'Child safety') - Number(a.reason === 'Child safety') || a.createdAt - b.createdAt);
    const offset = Number.isSafeInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
    return json(200, { reports: records.slice(offset, offset + 50), nextOffset: records.length > offset + 50 ? offset + 50 : null });
  }
  if (path === '/review') {
    const key = 'report:' + body.id;
    const report = await ctx.storage.get(key);
    if (!report || report.createdAt <= Date.now() - YEAR) return json(404, { error: 'Report not found.' });
    if (!body.event) return json(200, report);
    report.status = body.status;
    report.events.push({ ...body.event, at: Date.now() });
    await ctx.storage.put(key, report);
    return json(200, { ok: true });
  }
  return json(404, { error: 'Not found' });
}

export async function safetyAlarm(ctx) {
  // Reports and guest identifiers expire after a year. Account blocks live in SQL.
  for (const [key, value] of await listEntries(ctx.storage, '')) {
    const at = value.createdAt || value.at || (Array.isArray(value) ? value.at(-1) : 0);
    if (at && at < Date.now() - YEAR) await ctx.storage.delete(key);
  }
  await ctx.storage.setAlarm(Date.now() + 86400e3);
}
