import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const requireXcode = createRequire(require.resolve('xcode/package.json'));

test('the UUID version used by Xcode tooling rejects undersized output buffers', () => {
  const uuid = requireXcode('uuid');
  assert.throws(() => uuid.v5('x', '6ba7b810-9dad-11d1-80b4-00c04fd430c8', new Uint8Array(8), 4), RangeError);
});

test('the scoped UUID upgrade preserves Xcode project ID generation', () => {
  const project = require('xcode').project('unused.pbxproj');
  project.hash = { project: { objects: {} } };
  const ids = Array.from({ length: 100 }, () => project.generateUuid());
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
});
