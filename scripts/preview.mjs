import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
const root = path.resolve(import.meta.dirname, '..');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = url.pathname === '/' ? '/dist/chrome/ui.html' : url.pathname;
  const resolved = path.resolve(root, '.' + decodeURIComponent(file));
  if (!resolved.startsWith(root + path.sep) || !['.html', '.css', '.js', '.png', '.svg', '.jpg', '.woff', '.woff2', '.ttf'].includes(path.extname(resolved))) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(resolved); res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'})[path.extname(resolved)]); res.end(body); } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.QX_PREVIEW_PORT || 4178), '127.0.0.1', () => console.log(`http://127.0.0.1:${process.env.QX_PREVIEW_PORT || 4178}/dist/chrome/ui.html?demo=1&popup=1`));
