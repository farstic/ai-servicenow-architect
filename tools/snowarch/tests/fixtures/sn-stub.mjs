// A ServiceNow-shaped REST endpoint on loopback, for tests that must authenticate against
// something. It is not a mock of the product — it answers one path, by credential, and counts.
//
// The COUNT is the point of several tests: "exactly one authentication attempt" cannot be asserted
// from the client side, because a retry loop that ended in the same failure looks identical from
// there. The server is the only honest witness.
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

export const PATH = '/api/now/table/sys_user';

/**
 * @param {{ user: string, password: string }} good  the one credential that is accepted
 * @param {{ forbidden?: string, tls?: { key: Buffer, cert: Buffer } }} [opts]
 *        `forbidden`: a user that authenticates but is not allowed.
 *        `tls`: serve HTTPS. The store schema only accepts an `https://` origin, so an end-to-end
 *        run through the real CLI needs one — the caller generates a certificate and points
 *        `NODE_EXTRA_CA_CERTS` at it, which is the same mechanism the product's TLS remedy tells
 *        operators to use, rather than a verification switch that only exists for tests.
 */
export function startStub(good, opts = {}) {
  const requests = [];
  const handler = (req, res) => {
    const auth = req.headers.authorization ?? '';
    const [scheme, encoded] = auth.split(' ');
    const [user, password] = scheme === 'Basic'
      ? Buffer.from(encoded ?? '', 'base64').toString('utf8').split(':')
      : [null, null];

    // The credential is recorded as a SHAPE, never as bytes: a fixture that kept the password in
    // memory for a test to read is a fixture that can print it in a failure message.
    requests.push({ url: req.url, user, hadPassword: Boolean(password), method: req.method });

    if (!req.url?.startsWith(PATH)) { res.writeHead(404).end('{}'); return; }
    if (user === opts.forbidden) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'insufficient rights' } }));
      return;
    }
    if (user !== good.user || password !== good.password) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'User Not Authenticated' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ result: [{ sys_id: '0'.repeat(32), user_name: user }] }));
  };
  const server = opts.tls ? createHttpsServer(opts.tls, handler) : createHttpServer(handler);

  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      ready({
        url: `${opts.tls ? 'https' : 'http'}://127.0.0.1:${port}`,
        requests,
        /** How many times anyone tried to authenticate. The retry-loop detector. */
        get attempts() { return requests.filter((r) => r.url?.startsWith(PATH)).length; },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
