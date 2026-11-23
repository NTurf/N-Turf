import { json, initDb, currentUser, noDb } from '../../_auth.js';

// Sert une image des pages Hippodrome aux membres connectés
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const q = new URL(request.url).searchParams;
  const g = ['quinte', 'pick5', 'etquinte', 'etr1', 'etout', 'ettrot'].includes(q.get('g')) ? q.get('g') : 'quinte';
  const i = parseInt(q.get('i'), 10);
  const r = await env.DB.prepare('SELECT data FROM contenu WHERE cle = ?').bind('hippo-img-' + g + '-' + i).first();
  if (!r) return new Response('Introuvable', { status: 404 });
  const url = JSON.parse(r.data).data || '';
  const bin = Uint8Array.from(atob(url.split(',')[1] || ''), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
}
