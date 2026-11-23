import { initDb, currentUser } from '../_auth.js';

// Les études publiées par Claude dans le dépôt ne sont servies qu'aux membres connectés
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return new Response('Indisponible', { status: 503 });
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return new Response('Réservé aux membres', { status: 401 });
  const r = await context.next();
  const h = new Headers(r.headers); h.set('cache-control', 'private, no-cache');
  return new Response(r.body, { status: r.status, headers: h });
}
