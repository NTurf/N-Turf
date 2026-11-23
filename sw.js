// Service worker minimal : permet d'installer N-TURF comme une application.
// Il ne garde rien en mémoire : le contenu est toujours celui du site, à jour.
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(){ /* tout passe directement par le réseau */ });
