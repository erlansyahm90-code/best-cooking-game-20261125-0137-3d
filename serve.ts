// serve.ts — tiny static file server for local play-testing only.
// Serves this directory's game/ at http://localhost:8080 (Node 22 stdlib).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const path = join(root, url === '/' ? 'index.html' : url);
  if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404); res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
}).listen(8080, () => console.log('Junction Kitchen 3D at http://localhost:8080'));
