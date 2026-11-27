import { json, initDb, noDb } from '../../_auth.js';
import { initMail, mailPret, emailOk, creerJeton, tropDeDemandes, envoyerUn, gabarit, bouton, SITE, REPONSE } from '../../_mail.js';

// Mot de passe oublié / pseudo oublié : { quoi: 'mdp' | 'pseudo', email }
// Toujours la même réponse, que l'adresse existe ou non (personne ne peut savoir qui est inscrit).
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await initMail(db);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  if (!mailPret(env)) return json({ erreur: `L'envoi d'e-mails n'est pas encore en service. Écris-nous à ${REPONSE} et on t'aide à retrouver ton compte.` }, 503);
  const email = String(b.email || '').trim().toLowerCase();
  if (!emailOk(email)) return json({ erreur: "Cette adresse e-mail n'est pas valide." }, 400);
  const quoi = b.quoi === 'pseudo' ? 'pseudo' : 'mdp';
  const reponse = json({ ok: true, texte: "Si un compte existe avec cette adresse, un e-mail vient de partir. Regarde aussi dans les courriers indésirables (spams)." });
  const u = await db.prepare('SELECT id, pseudo, email, banni FROM users WHERE email = ?').bind(email).first();
  if (!u || u.banni) return reponse;
  if (await tropDeDemandes(db, u.id, quoi === 'pseudo' ? 'pseudo' : 'mdp')) return reponse;
  if (quoi === 'pseudo') {
    await creerJeton(db, u.id, 'pseudo', 1); // sert seulement à compter les demandes
    await envoyerUn(env, u.email, 'N-TURF : ton pseudo', gabarit('Ton pseudo N-TURF',
      `<p>Bonjour,</p><p>Ton pseudo sur N-TURF est : <b style="font-size:20px">${u.pseudo.replace(/[<>&"]/g, '')}</b></p><p>Tu peux te connecter avec ce pseudo ou avec ton adresse e-mail.</p>` + bouton(`${SITE}/inscription.html#connexion`, 'Me connecter'),
      'Tu reçois ce message parce que quelqu\'un a demandé le pseudo lié à cette adresse sur N-TURF. Si ce n\'est pas toi, ignore-le.'));
  } else {
    const t = await creerJeton(db, u.id, 'mdp', 60);
    await envoyerUn(env, u.email, 'N-TURF : nouveau mot de passe', gabarit('Choisis un nouveau mot de passe',
      `<p>Bonjour ${u.pseudo.replace(/[<>&"]/g, '')},</p><p>Tu as demandé à changer ton mot de passe. Touche le bouton ci-dessous : ce lien ne sert <b>qu'une seule fois</b> et n'est valable <b>qu'une heure</b>.</p>` + bouton(`${SITE}/motdepasse.html#t=${t}`, 'Choisir mon nouveau mot de passe'),
      'Si tu n\'as rien demandé, ignore ce message : ton mot de passe actuel reste valable.'));
  }
  return reponse;
}
