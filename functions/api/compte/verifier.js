import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initMail, lireJeton, consommer, envoyerVerification, mailPret, envoyerUn, gabarit } from '../../_mail.js';

// { t, quoi: 'verif' } : confirmation de l'adresse à l'inscription
// { t, quoi: 'email' } : confirmation d'une NOUVELLE adresse (le changement ne se fait qu'à ce moment-là)
// { renvoyer: true }   : membre connecté, renvoie le lien de vérification
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await initMail(db);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  if (b.renvoyer) {
    const u = await currentUser(db, request);
    if (!u) return json({ erreur: 'Connecte-toi d\'abord.' }, 401);
    if (!mailPret(env)) return json({ erreur: 'L\'envoi d\'e-mails n\'est pas encore en service.' }, 503);
    const x = await db.prepare('SELECT id, pseudo, email, email_verifie FROM users WHERE id = ?').bind(u.id).first();
    if (x.email_verifie) return json({ ok: true, texte: 'Ton adresse est déjà vérifiée.' });
    const n = await db.prepare('SELECT COUNT(*) AS n FROM mail_jetons WHERE user_id = ? AND type = ? AND cree > ?').bind(u.id, 'verif', Date.now() - 3600000).first();
    if (n.n >= 3) return json({ erreur: 'Déjà 3 envois dans l\'heure : regarde tes courriers indésirables, ou réessaie plus tard.' }, 429);
    await envoyerVerification(env, db, x);
    return json({ ok: true, texte: 'Lien envoyé à ' + x.email + '.' });
  }
  const quoi = b.quoi === 'email' ? 'email' : 'verif';
  const r = await lireJeton(db, b.t, quoi);
  if (!r) return json({ erreur: 'Ce lien n\'est plus valable (déjà utilisé ou trop ancien).' }, 400);
  if (quoi === 'verif') {
    await consommer(db, r);
    await db.prepare('UPDATE users SET email_verifie = 1, email_ko = 0, email_ko_raison = NULL WHERE id = ?').bind(r.user_id).run();
    return json({ ok: true, texte: 'Merci, ton adresse e-mail est confirmée.' });
  }
  const nouvelle = r.data && r.data.email;
  if (await db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').bind(nouvelle, r.user_id).first()) return json({ erreur: 'Cette adresse est déjà utilisée par un autre compte.' }, 400);
  const avant = await db.prepare('SELECT email, pseudo FROM users WHERE id = ?').bind(r.user_id).first();
  await consommer(db, r);
  await db.prepare('UPDATE users SET email = ?, email_verifie = 1, email_ko = 0, email_ko_raison = NULL WHERE id = ?').bind(nouvelle, r.user_id).run();
  // l'ancienne adresse est prévenue (sécurité du compte)
  try { await envoyerUn(env, avant.email, 'N-TURF : ton adresse e-mail a changé', gabarit('Adresse e-mail modifiée', `<p>Bonjour ${String(avant.pseudo).replace(/[<>&"]/g, '')},</p><p>L'adresse e-mail de ton compte N-TURF vient d'être remplacée par <b>${nouvelle}</b>.</p><p>Si ce n'est pas toi, réponds tout de suite à ce message.</p>`)); } catch (e) {}
  return json({ ok: true, texte: 'C\'est fait : ta nouvelle adresse est ' + nouvelle + '.' });
}
