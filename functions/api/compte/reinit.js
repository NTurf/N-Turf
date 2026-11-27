import { json, initDb, hashPassword, createSession, noDb } from '../../_auth.js';
import { initMail, lireJeton, consommer } from '../../_mail.js';

// Nouveau mot de passe à partir du lien reçu par e-mail (une seule fois, une heure maximum). Les autres sessions sont fermées.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await initMail(db);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const r = await lireJeton(db, b.t, 'mdp');
  if (!r) return json({ erreur: 'Ce lien n\'est plus valable (déjà utilisé ou plus d\'une heure). Refais une demande « Mot de passe oublié ».' }, 400);
  const p = String(b.password || '');
  if (p.length < 8 || p.length > 200) return json({ erreur: 'Le mot de passe doit faire au moins 8 caractères.' }, 400);
  const { hash, salt } = await hashPassword(p);
  await consommer(db, r);
  await db.batch([
    db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, email_verifie = 1 WHERE id = ?').bind(hash, salt, r.user_id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(r.user_id),
  ]);
  const u = await db.prepare('SELECT pseudo FROM users WHERE id = ?').bind(r.user_id).first();
  const cookie = await createSession(db, r.user_id);
  return json({ ok: true, pseudo: u && u.pseudo }, 200, { 'set-cookie': cookie });
}
