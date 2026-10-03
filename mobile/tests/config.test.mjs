import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveServer, tokenStorageKey } from '../src/serverConfig.ts';

test('local development and preview never silently target live accounts', () => {
  assert.ok(resolveServer(undefined, undefined, true).error);
  assert.ok(resolveServer(undefined, 'preview', false).error);
});
test('an explicit staging URL is used for both HTTP and WebSocket origins', () => {
  assert.deepEqual(resolveServer('https://stage.example/', 'preview', false), { server: 'https://stage.example', error: '' });
});
test('release defaults remain compatible with already installed production builds', () => {
  assert.equal(resolveServer(undefined, undefined, false).server, 'https://closer.hozaiphaa.workers.dev');
});
test('unencrypted release URLs and credential-bearing URLs are rejected', () => {
  assert.ok(resolveServer('http://stage.example', 'preview', false).error);
  assert.ok(resolveServer('https://secret@stage.example', 'preview', false).error);
  assert.equal(resolveServer('http://192.168.1.20:8787', 'development', true).server, 'http://192.168.1.20:8787');
});

test('staging never reuses a saved production credential while production keeps existing logins', () => {
  assert.equal(tokenStorageKey('https://closer.hozaiphaa.workers.dev'), 'closer:token');
  assert.notEqual(tokenStorageKey('https://stage.example'), tokenStorageKey('https://closer.hozaiphaa.workers.dev'));
  assert.notEqual(tokenStorageKey('https://stage.example'), tokenStorageKey('https://other.example'));
});
