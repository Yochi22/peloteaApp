// Service worker mínimo — solo existe para que el navegador ofrezca
// "instalar" la app (manifest.webmanifest + un SW con `fetch` son los dos
// requisitos de Chrome). A propósito NO cachea nada dinámico: disponibilidad,
// precios y estados de reserva cambian todo el tiempo y son plata de por
// medio — servir una versión vieja desde caché podría dejar reservar un
// horario que ya no existe o mostrar un precio que ya cambió. Lo único que
// se cachea son archivos verdaderamente estáticos (los íconos), nunca HTML
// ni respuestas de /api/*.
const CACHE_ESTATICO = 'pelotea-estatico-v1';
const RUTAS_ESTATICAS = ['/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_ESTATICO).then((cache) => cache.addAll(RUTAS_ESTATICAS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE_ESTATICO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && RUTAS_ESTATICAS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cacheada) => cacheada ?? fetch(event.request)));
    return;
  }
  // Todo lo demás (páginas, /api/*) siempre va directo a la red.
  event.respondWith(fetch(event.request));
});
