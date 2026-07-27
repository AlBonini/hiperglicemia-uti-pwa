// Service worker da PWA de Hiperglicemia UTI - cacheia o app shell para uso offline.
// Suba a versao do CACHE_NOME sempre que publicar uma atualizacao dos arquivos abaixo,
// para forcar os clientes a buscar a versao nova em vez de servir o cache antigo.
var CACHE_NOME = 'hiperglicemia-uti-v1';
var ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './protocolo.js',
  './db.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE_NOME).then(function (cache) {
      return cache.addAll(ARQUIVOS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (chaves) {
      return Promise.all(
        chaves.filter(function (k) { return k !== CACHE_NOME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    caches.match(ev.request).then(function (respostaCache) {
      if (respostaCache) return respostaCache;
      return fetch(ev.request).then(function (respostaRede) {
        var copia = respostaRede.clone();
        caches.open(CACHE_NOME).then(function (cache) { cache.put(ev.request, copia); });
        return respostaRede;
      }).catch(function () { return respostaCache; });
    })
  );
});
