// A small stand-in for Cloudflare D1 over Node's built-in SQLite, with the
// production migrations applied. Enough of the API for worker/db.js.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON'); // D1 always enforces foreign keys
  for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
  const plain = row => row ? { ...row } : null;
  const statement = (sql, params = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => plain(sqlite.prepare(sql).get(...params)),
    all: async () => ({ results: sqlite.prepare(sql).all(...params).map(plain), success: true }),
    run: async () => statement(sql, params).runSync(),
    runSync: () => ({ success: true, meta: { changes: sqlite.prepare(sql).run(...params).changes } }),
    sql, params,
  });
  return {
    sqlite,
    prepare: sql => statement(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(s => /^\s*select/i.test(s.sql) ? { results: sqlite.prepare(s.sql).all(...s.params).map(plain), meta: { changes: 0 } } : s.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (err) { sqlite.exec('ROLLBACK'); throw err; }
    },
  };
}
