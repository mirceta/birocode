// DECOY: an HTTP *client*, not a server. It talks to ports but never listens on one.
// Discovery must NOT report this directory as a local app.
import http from 'node:http';

const TARGETS = [5411, 5412, 5413];

function poll(port) {
  const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
    console.log(`:${port} -> ${res.statusCode}`);
    res.resume();
  });
  req.on('error', () => console.log(`:${port} -> down`));
}

setInterval(() => TARGETS.forEach(poll), 5000);
console.log('polling ' + TARGETS.join(', '));
