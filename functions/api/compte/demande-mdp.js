import { json, initDb, noDb } from '../../_auth.js';
import { initMdp } from '../../_mdp.js';

// Le membre a oublié son mot de passe : il laisse son pseudo (ou son e-mail) et un moyen de le joindre.
// Même réponse que le compte existe ou non. Limite : 3 demandes en attente par pseudo, 60 en tout.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await initMdp(db);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const login = String(b.login || '').trim().slice(0, 120), contact = String(b.contact || '').trim().slice(0, 200);
  if (login.length < 2) return json({ erreur: 'Indique ton pseudo ou ton adresse e-mail.' }, 400);
  const lc = login.toLowerCase();
  const u = await db.prepare('SELECT id FROM users WHERE pseudo_lc = ? OR email = ?').bind(lc, lc).first();
  const enAttente = await db.prepare('SELECT COUNT(*) AS n FROM mdp_demandes WHERE traite = 0 AND lower(login) = ?').bind(lc).first();
  const total = await db.prepare('SELECT COUNT(*) AS n FROM mdp_demandes WHERE traite = 0').first();
  if (enAttente.n < 3 && total.n < 60) {
    await db.prepare('INSERT INTO mdp_demandes (user_id, login, contact) VALUES (?, ?, ?)').bind(u ? u.id : null, login, contact).run();
  }
  return json({ ok: true, texte: 'Demande envoyée à l\'administrateur. Il te renverra un mot de passe provisoire au moyen que tu as indiqué : tu te connecteras avec, puis tu le changeras dans Mon compte.' });
}
