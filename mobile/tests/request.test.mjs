import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { requestJson } from '../src/request.ts';

let server;
let origin;
before(async () => {
  server = createServer((request, response) => {
    if (request.url === '/slow') {
      const timer = setTimeout(() => response.end('{}'), 100);
      response.on('close', () => clearTimeout(timer));
    } else if (request.url === '/revoked') {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end('{"error":"Please log in again"}');
    } else if (request.url === '/html') {
      response.end('<html>Wrong service</html>');
    } else {
      response.end(JSON.stringify({ authorized: request.headers.authorization === 'Bearer valid' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test('a stalled startup request fails within the application timeout', async () => {
  await assert.rejects(requestJson(origin + '/slow', null, undefined, 10), error => error.status === 0);
});
test('unauthorized replies keep their status so session recovery can sign out', async () => {
  await assert.rejects(requestJson(origin + '/revoked', 'revoked'), error => error.status === 401);
});
test('unexpected HTML is an API error instead of a successful empty account', async () => {
  await assert.rejects(requestJson(origin + '/html', null), error => error.status === 502);
});
test('signed-in requests still send their bearer token', async () => {
  assert.deepEqual(await requestJson(origin + '/ok', 'valid'), { authorized: true });
});
