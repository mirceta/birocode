// Status board — CommonJS style server, nested two folders deep.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const STATUS_PORT = 5412;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    const page = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

// no host argument -> dual-stack :: bind, reachable on 127.0.0.1 and [::1]
server.listen(STATUS_PORT, () => {
  console.log('status-board listening on ' + STATUS_PORT);
});
