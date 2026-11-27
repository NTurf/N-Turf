import { json, initDb, hashPassword, createSession, noDb } from '../_auth.js';
import { initMail, envoyerVerification, mailPret } from '../_mail.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const pseudo = String(b.pseudo || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!/^[A-Za-z0-9À-ÿ_.-]{3,20}$/.test(pseudo))
    return json({ erreur: 'Le pseudo doit faire de 3 à 20 caractères (lettres, chiffres, point, tiret).' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)
    return json({ erreur: "L'adresse e-mail n'est pas valide." }, 400);
  if (password.length < 8 || password.length > 200)
    return json({ erreur: 'Le mot de passe doit faire au moins 8 caractères.' }, 400);
  if (b.majeur !== true)
    return json({ erreur: 'Le site est réservé aux personnes majeures.' }, 400);

  const pseudo_lc = pseudo.toLowerCase();
  if (await db.prepare('SELECT 1 FROM users WHERE pseudo_lc = ?').bind(pseudo_lc).first())
    return json({ erreur: 'Ce pseudo est déjà pris, choisissez-en un autre.' }, 409);
  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first())
    return json({ erreur: 'Un compte existe déjà avec cette adresse e-mail.' }, 409);

  const { hash, salt } = await hashPassword(password);
  const count = await db.prepare('SELECT COUNT(*) AS n FROM users').first();
  const role = count.n === 0 ? 'admin' : 'membre'; // le tout premier compte = administrateur
  let res;
  try {
    res = await db.prepare('INSERT INTO users (pseudo, pseudo_lc, email, pass_hash, pass_salt, role) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(pseudo, pseudo_lc, email, hash, salt, role).run();
  } catch {
    return json({ erreur: 'Ce pseudo ou cet e-mail est déjà utilisé.' }, 409);
  }
  // vérification de l'adresse : un lien est envoyé (le compte fonctionne tout de suite, la confirmation se fait quand il veut)
  if (mailPret(env)) { try { await initMail(db); await envoyerVerification(env, db, { id: res.meta.last_row_id, pseudo, email }); } catch (e) {} }
  const cookie = await createSession(db, res.meta.last_row_id);
  return json({ ok: true, pseudo, role }, 200, { 'set-cookie': cookie });
}
