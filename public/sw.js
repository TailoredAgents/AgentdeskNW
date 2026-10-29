const CACHE = 'agentdesk-public-shell-v1';
const PUBLIC_ASSETS = ['/offline.html', '/icon-192.png', '/icon-512.png', '/icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('agentdesk-public-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Business data and application responses are always fetched from the server.
  // Only the public offline explanation and icons are saved on this device.
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(async () => await caches.match('/offline.html') || new Response('AgentDesk is offline. Reconnect to continue.', { status: 503 })));
  else if (PUBLIC_ASSETS.includes(new URL(event.request.url).pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
