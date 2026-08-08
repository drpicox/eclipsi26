/* Servei de fons: fa que l'app arrenqui i el mapa es dibuixi sense cobertura.
   La línia de sota la reescriu el desplegament amb l'SHA del commit; canviar-la
   és el que fa que el navegador s'adoni que hi ha versió nova. */
const VERSIO = 'dev';

const APP    = 'eclipsi-app-' + VERSIO;
const TILES  = 'eclipsi-tiles-v1';   // el gestiona la pàgina; no el toquem mai en activar

/* Tot el que cal per obrir l'app amb l'avió en mode avió. */
const CLOSCA = [
  './index.html',      // totes les navegacions es resolen contra aquesta entrada
  './app.css',
  './app.js',
  './vendor/leaflet.css',
  './vendor/leaflet.js',
  './data/eclipsi.js',
  './data/ombres.png',
  './manifest.webmanifest',
  './icons/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const SERVIDORS_TESSELES = ['basemaps.cartocdn.com', 'server.arcgisonline.com'];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(APP);
    // cache:'reload' — passem per sobre de la memòria cau d'HTTP, que a GitHub
    // Pages guarda els fitxers 10 minuts i ens deixaria una closca a mitges.
    await c.addAll(CLOSCA.map(u => new Request(u, {cache: 'reload'})));
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms
      .filter(n => n.startsWith('eclipsi-app-') && n !== APP)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// La pàgina ens diu quan l'usuari accepta la versió nova.
self.addEventListener('message', ev => {
  if(ev.data === 'activa') self.skipWaiting();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(SERVIDORS_TESSELES.includes(url.hostname)){ ev.respondWith(tessela(ev, req)); return; }
  if(url.origin !== location.origin) return;       // enllaços externs: no ens hi fiquem
  ev.respondWith(propi(ev, req));
});

/* Tessel·les: primer la còpia desada. És el cas normal a la franja de
   l'eclipsi, on la xarxa mòbil estarà saturada o directament morta. */
async function tessela(ev, req){
  const c = await caches.open(TILES);
  const desada = await c.match(req, {ignoreVary: true});
  if(desada) return desada;
  try{
    const r = await fetch(req);
    if(r.ok) ev.waitUntil(c.put(req, r.clone()));   // el que miris pel camí, queda desat
    return r;
  }catch(e){
    // Que falli neta: Leaflet deixa a la vista la tessel·la de menys zoom.
    return new Response('', {status: 504, statusText: 'sense connexio'});
  }
}

/* Fitxers propis: servim la còpia desada a l'instant i refresquem al darrere. */
async function propi(ev, req){
  const c = await caches.open(APP);

  // Qualsevol navegació — amb query, sense, /index.html o l'arrel — va a parar a
  // la mateixa entrada. Si no, un enllaç amb ?utm_source=... no obriria res
  // sense cobertura.
  const navega = req.mode === 'navigate' || req.destination === 'document';
  const clau = navega ? './index.html' : req;

  const desada = await c.match(clau);
  const xarxa = fetch(req).then(r => {
    if(r.ok && r.type === 'basic') c.put(clau, r.clone());
    return r;
  }).catch(() => null);

  if(desada){ ev.waitUntil(xarxa); return desada; }

  const r = await xarxa;
  if(r) return r;
  return new Response('Sense connexió i sense còpia desada.',
    {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}
