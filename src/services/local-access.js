const crypto = require('node:crypto');

const COOKIE_NAME = 'E2P_LOCAL_SESSION';

function createLocalAccess({ port, sessionToken = crypto.randomBytes(32).toString('hex') }) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

  function boundary(request, response, next) {
    const remote = request.socket?.remoteAddress || '';
    const host = String(request.headers.host || '').toLowerCase();
    const origin = request.get('Origin');
    const fetchSite = request.get('Sec-Fetch-Site');
    if (!isLoopbackAddress(remote) || !allowedHosts.has(host)
      || (origin && origin !== `http://${host}`)
      || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
      response.status(403).json({ error: 'The E2P interface is restricted to its local origin.' });
      return;
    }
    if (request.method === 'GET' && ['/', '/index.html'].includes(request.path)) {
      response.setHeader('Set-Cookie', `${COOKIE_NAME}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`);
    }
    next();
  }

  function requireArtifactSession(request, response, next) {
    const cookies = String(request.headers.cookie || '').split(';').map((item) => item.trim());
    const supplied = cookies.find((item) => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || '';
    if (!safeTokenEqual(supplied, sessionToken)) {
      response.status(403).json({ error: 'Open E2P locally before accessing saved artifacts.' });
      return;
    }
    next();
  }

  return { boundary, requireArtifactSession };
}

function isLoopbackAddress(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(address || ''));
}

function safeTokenEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

module.exports = { COOKIE_NAME, createLocalAccess, isLoopbackAddress };
