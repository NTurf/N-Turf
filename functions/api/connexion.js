import { json, initDb, hashPassword, sameText, createSession, noDb } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const login = String(b.login || '').trim().toLowerCase();
  const password = String(b.password || '');
  const u = await db.prepare('SELECT id, pseudo, role, pass_hash, pass_salt, banni FROM users WHERE pseudo_lc = ? OR email = ?')
    .bind(login, login).first();
  const bad = () => json({ erreur: 'Pseudo, e-mail ou mot de passe incorrect.' }, 401);
  if (!u) { await hashPassword(password); return bad(); }
  const { hash } = await hashPassword(password, u.pass_salt);
  if (!sameText(hash, u.pass_hash)) return bad();
  if (u.banni) return json({ erreur: 'Ce compte a été suspendu.' }, 403);
  await db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").bind(u.id).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  const cookie = await createSession(db, u.id);
  return json({ ok: true, pseudo: u.pseudo, role: u.role }, 200, { 'set-cookie': cookie });
}
