import { json, initDb, hashPassword, createSession, noDb } from '../../_auth.js';
import { initMdp } from '../../_mdp.js';

// Mot de passe oublié, en libre-service : pseudo + adresse e-mail d'inscription + nouveau mot de passe.
// L'adresse e-mail n'est jamais montrée aux autres membres : c'est elle qui prouve que c'est bien le membre.
// Protection : 5 essais ratés par pseudo et par heure, puis blocage 1 h.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await initMdp(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS mdp_essais (login TEXT, quand INTEGER)`).run();
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const login = String(b.login || '').trim().toLowerCase(), email = String(b.email || '').trim().toLowerCase(), p = String(b.password || '');
  if (!login || !email) return json({ erreur: 'Indique ton pseudo et ton adresse e-mail d\'inscription.' }, 400);
  if (p.length < 8 || p.length > 200) return json({ erreur: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }, 400);
  const heure = Date.now() - 3600000;
  const ess = await db.prepare('SELECT COUNT(*) AS n FROM mdp_essais WHERE login = ? AND quand > ?').bind(login, heure).first();
  if (ess.n >= 5) return json({ erreur: 'Trop d\'essais. Réessaie dans une heure, ou laisse une demande à l\'administrateur plus bas.' }, 429);
  const u = await db.prepare('SELECT id, pseudo, role, banni FROM users WHERE pseudo_lc = ? AND email = ?').bind(login, email).first();
  if (!u) {
    await db.batch([db.prepare('INSERT INTO mdp_essais (login, quand) VALUES (?, ?)').bind(login, Date.now()), db.prepare('DELETE FROM mdp_essais WHERE quand < ?').bind(heure)]);
    return json({ erreur: 'Ce pseudo et cette adresse e-mail ne vont pas ensemble. Vérifie l\'orthographe, ou laisse une demande à l\'administrateur plus bas.' }, 400);
  }
  if (u.banni) return json({ erreur: 'Ce compte a été suspendu.' }, 403);
  if (u.role === 'admin') return json({ erreur: 'Le compte administrateur ne se change pas ici : passe par Mon compte.' }, 403);
  const { hash, salt } = await hashPassword(p);
  await db.batch([
    db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(hash, salt, u.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    db.prepare('DELETE FROM mdp_essais WHERE login = ?').bind(login),
    db.prepare('UPDATE mdp_demandes SET traite = 1 WHERE user_id = ?').bind(u.id),
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").bind(u.id),
  ]);
  const cookie = await createSession(db, u.id);
  return json({ ok: true, pseudo: u.pseudo }, 200, { 'set-cookie': cookie });
}
