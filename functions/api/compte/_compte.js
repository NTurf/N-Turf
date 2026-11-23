import { json, initDb, currentUser, hashPassword, sameText } from '../../_auth.js';

// Vérifie la session et le mot de passe actuel avant toute modification du compte
export async function verifier(env, request, motdepasse) {
  const db = env.DB;
  await initDb(db);
  const u = await currentUser(db, request);
  if (!u) return { err: json({ erreur: 'Connecte-toi d\'abord.' }, 401) };
  const r = await db.prepare('SELECT id, role, pass_hash, pass_salt FROM users WHERE id = ?').bind(u.id).first();
  const { hash } = await hashPassword(String(motdepasse || ''), r.pass_salt);
  if (!sameText(hash, r.pass_hash)) return { err: json({ erreur: 'Mot de passe actuel incorrect.' }, 403) };
  return { u: r };
}
