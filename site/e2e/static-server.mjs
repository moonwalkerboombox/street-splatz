// A tiny static file server that behaves like the Cloudflare setup in wrangler.jsonc:
// /admin serves admin.html and an unknown path serves 404.html with status 404.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

export function serve(dir, port) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const tries = path.endsWith('/') ? [`${path}index.html`] : extname(path) ? [path] : [path, `${path}.html`];
    for (const t of tries) {
      try {
        const body = await readFile(join(dir, t));
        res.writeHead(200, { 'content-type': TYPES[extname(t)] || 'application/octet-stream', 'cache-control': 'no-store' });
        return res.end(body);
      } catch { /* try the next one */ }
    }
    const body = await readFile(join(dir, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
