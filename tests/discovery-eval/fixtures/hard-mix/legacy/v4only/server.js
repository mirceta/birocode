// DECOY: fixed port, serves at root — but binds 127.0.0.1 ONLY (no [::1]).
// The local-exposure contract requires a dual-stack loopback bind, so this is
// NOT a valid exposure and discovery must not report it.
'use strict';
const http = require('http');

const PORT = 5499;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<h1>legacy v4-only panel</h1>');
});

// explicit IPv4-only host — [::1] never answers
server.listen(PORT, '127.0.0.1', () => {
  console.log('legacy panel on http://127.0.0.1:' + PORT + ' (IPv4 only)');
});
