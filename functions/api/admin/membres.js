import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { prepAnalyses, AUTEURS } from '../../_analyses.js';

// Gestion des membres : réservée à l'administrateur (Bruno) seul
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  await prepAnalyses(env.DB);
  const r = await env.DB.prepare(`SELECT u.id, u.pseudo, u.email, u.role, u.moderateur, u.publier, u.banni, u.hippo, u.created_at, u.last_login, a.auteur AS analyste FROM users u LEFT JOIN analystes a ON a.user_id = u.id WHERE u.role != 'robot' ORDER BY u.created_at DESC`).all();
  return json({ membres: r.results || [], auteurs: AUTEURS });
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
  const champs = ['moderateur', 'publier', 'banni', 'hippo'].filter((k) => k in b);
  for (const k of champs) {
    await env.DB.prepare(`UPDATE users SET ${k} = ? WHERE id = ?`).bind(b[k] ? 1 : 0, cible.id).run();
  }
  if ('analyste' in b) {
    await prepAnalyses(env.DB);
    if (!b.analyste) await env.DB.prepare('DELETE FROM analystes WHERE user_id = ?').bind(cible.id).run();
    else if (AUTEURS.includes(b.analyste)) await env.DB.prepare('INSERT INTO analystes (user_id, auteur) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET auteur = excluded.auteur').bind(cible.id, b.analyste).run();
    else return json({ erreur: 'Auteur inconnu.' }, 400);
  }
  if (b.banni) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(cible.id).run();
  return json({ ok: true });
}
