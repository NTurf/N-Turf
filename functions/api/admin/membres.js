import { json, initDb, currentUser, noDb } from '../../_auth.js';

// Gestion des membres : réservée à l'administrateur (Bruno) seul
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  const r = await env.DB.prepare('SELECT id, pseudo, email, role, moderateur, publier, banni, created_at, last_login FROM users ORDER BY created_at DESC').all();
  return json({ membres: r.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const cible = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(parseInt(b.id, 10)).first();
  if (!cible) return json({ erreur: 'Membre introuvable.' }, 404);
  if (cible.role === 'admin') return json({ erreur: 'On ne modifie pas le compte administrateur.' }, 400);
  const champs = ['moderateur', 'publier', 'banni'].filter((k) => k in b);
  for (const k of champs) {
    await env.DB.prepare(`UPDATE users SET ${k} = ? WHERE id = ?`).bind(b[k] ? 1 : 0, cible.id).run();
  }
  if (b.banni) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(cible.id).run();
  return json({ ok: true });
}
