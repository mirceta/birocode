// DECOY: a real HTTP server — but it listens on an EPHEMERAL port (listen(0)),
// so there is no fixed port and it is NOT a valid local-app exposure.
import { createServer } from 'node:http';
import { request } from 'node:http';

const UPSTREAM = { host: '127.0.0.1', port: 5412 };

const server = createServer((req, res) => {
  const proxied = request({ ...UPSTREAM, path: req.url, method: req.method }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  proxied.on('error', () => { res.writeHead(502); res.end('bad gateway'); });
  req.pipe(proxied);
});

// listen(0) = OS-assigned random port each start — deliberately not fixed.
server.listen(0, () => {
  console.log('proxy up on ephemeral port ' + server.address().port);
});
