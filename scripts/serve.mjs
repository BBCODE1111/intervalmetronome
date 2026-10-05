import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve('dist');
const port = Number(process.env.PORT || 4173);
const types = { '.json': 'application/json', '.wav': 'audio/wav', '.m4a':'audio/mp4', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
await stat(resolve(root, 'index.html'));
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname.startsWith('/intervalmetronome/') ? pathname.slice('/intervalmetronome'.length) : pathname;
    const file = resolve(root, `.${relative.endsWith('/') ? `${relative}index.html` : relative}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let body = await readFile(file);
    const compressed = /\bgzip\b/.test(request.headers['accept-encoding'] || '') && /\.(?:html|js|css|json|svg|md|txt)$/.test(file);
    if (compressed) body = gzipSync(body);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Vary':'Accept-Encoding', 'Content-Length':body.length, ...(compressed ? {'Content-Encoding':'gzip'} : {}) });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/intervalmetronome/`));
