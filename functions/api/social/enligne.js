import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { EN_LIGNE_MS } from '../../_social.js';

// Membres en ligne (vus depuis moins de 5 minutes). Le nombre pour tous, les pseudos pour les membres connectés.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  const r = await env.DB.prepare("SELECT pseudo, role, moderateur FROM users WHERE vu > ? AND role != 'robot' AND banni = 0 ORDER BY lower(pseudo)").bind(Date.now() - EN_LIGNE_MS).all();
  const L = r.results || [];
  return json({ n: L.length, pseudos: u ? L.map((x) => ({ pseudo: x.pseudo, modo: x.role === 'admin' || !!x.moderateur })) : [] });
}
