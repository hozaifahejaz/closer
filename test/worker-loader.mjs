import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';

export async function loadWorker(overrides = {}) {
  const context = vm.createContext({ console, crypto, Request, Response, Headers, URL, URLSearchParams, TextEncoder, structuredClone, setTimeout, clearTimeout, ...overrides });
  const modules = new Map();
  const root = path.resolve('worker/index.js');
  async function load(file) {
    if (modules.has(file)) return modules.get(file);
    let module;
    if (file === 'cloudflare:workers') {
      module = new vm.SyntheticModule(['DurableObject'], function () {
        this.setExport('DurableObject', class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } });
      }, { context, identifier: file });
    } else if (file.endsWith('.json')) {
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      module = new vm.SyntheticModule(['default'], function () { this.setExport('default', value); }, { context, identifier: file });
    } else module = new vm.SourceTextModule(await fs.readFile(file, 'utf8'), { context, identifier: file });
    modules.set(file, module);
    await module.link((specifier, referencing) => load(specifier.startsWith('cloudflare:') ? specifier : path.resolve(path.dirname(referencing.identifier), specifier)));
    return module;
  }
  const main = await load(root);
  await main.evaluate();
  return { ...main.namespace, game: modules.get(path.resolve('worker/game.js')).namespace, modules };
}

export class MemoryStorage {
  constructor(entries = []) { this.data = new Map(entries); this.alarm = null; }
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) {
    const entries = typeof key === 'string' ? [[key, value]] : Object.entries(key);
    for (const [k, v] of entries) {
      if (Buffer.byteLength(k) + Buffer.byteLength(JSON.stringify(v)) > 2_000_000) throw new Error('Value exceeds 2 MB');
      this.data.set(k, structuredClone(v));
    }
  }
  async list({ prefix = '', startAfter = '', limit = Infinity } = {}) { return new Map([...this.data].filter(([k]) => k.startsWith(prefix) && k > startAfter).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0,limit).map(([k, v]) => [k, structuredClone(v)])); }
  async delete(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) this.data.delete(k); }
  async deleteAll() { this.data.clear(); }
  async setAlarm(at) { this.alarm = at; }
  async getAlarm() { return this.alarm; }
  async transaction(fn) {
    const before = new Map(this.data);
    try { return await fn(this); } catch (err) { this.data = before; throw err; }
  }
}
