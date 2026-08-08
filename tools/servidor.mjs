/* Servidor de proves per a desenvolupament local. Cal un servidor de veritat
   (no obrir el fitxer amb file://) perquè el servei de fons funcioni.
   Ús:  node tools/servidor.mjs [port]                                       */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2]) || 8080;
const ARREL = process.cwd();
const TIPUS = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

createServer(async (req, res) => {
  try{
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if(ruta.endsWith('/')) ruta += 'index.html';
    const fitxer = join(ARREL, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
    if(!fitxer.startsWith(ARREL)){ res.writeHead(403).end(); return; }
    await stat(fitxer);
    const cos = await readFile(fitxer);
    res.writeHead(200, {
      'Content-Type': TIPUS[extname(fitxer)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(cos);
  }catch(e){
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('No hi és');
  }
}).listen(PORT, () => console.log('http://localhost:' + PORT + '/'));
