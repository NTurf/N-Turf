// L'ancienne adresse n-turf.pages.dev renvoie vers n-turf.net (même page, même chemin).
// Les versions de test (xxxx.n-turf.pages.dev) ne sont pas concernées.
export async function onRequest({ request, next }) {
  const u = new URL(request.url);
  if (u.hostname === 'n-turf.pages.dev') {
    u.hostname = 'n-turf.net';
    return Response.redirect(u.toString(), request.method === 'GET' || request.method === 'HEAD' ? 301 : 308);
  }
  return next();
}
