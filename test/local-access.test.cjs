const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createLocalAccess } = require('../src/services/local-access');

test('local UI receives a session and ordinary media remains usable only in that session', async (t) => {
  const app = express();
  let access;
  app.use((request, response, next) => access.boundary(request, response, next));
  app.get('/', (_request, response) => response.send('<img src="/artifacts/run/image.png">'));
  app.get('/artifacts/run/image.png', (request, response, next) => access.requireArtifactSession(request, response, next),
    (_request, response) => response.type('png').send(Buffer.from([137, 80, 78, 71])));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  access = createLocalAccess({ port, sessionToken: 'a'.repeat(64) });
  const root = `http://127.0.0.1:${port}`;

  const page = await fetch(root);
  assert.equal(page.status, 200);
  const cookie = page.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^E2P_LOCAL_SESSION=/);
  assert.equal((await fetch(`${root}/artifacts/run/image.png`)).status, 403);
  const media = await fetch(`${root}/artifacts/run/image.png`, { headers: { Cookie: cookie } });
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${root}/artifacts/run/image.png`, { headers: {
    Cookie: cookie, Origin: 'http://malicious.example',
  } })).status, 403);
  assert.equal((await fetch(`${root}/artifacts/run/image.png`, { headers: {
    Cookie: cookie, 'Sec-Fetch-Site': 'cross-site',
  } })).status, 403);
  const forgedHostStatus = await new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: '/', headers: { Host: `malicious.example:${port}` } },
      (response) => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(forgedHostStatus, 403);
});
