import { json, noDb } from '../../_auth.js';
import { verifier } from './_compte.js';
import { initMail, mailPret, creerJeton, envoyerUn, gabarit, bouton, SITE } from '../../_mail.js';

// Changement d'adresse e-mail (mot de passe actuel obligatoire).
// Avec le service d'e-mails : la nouvelle adresse doit être confirmée par un lien (24 h) avant de remplacer l'ancienne.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const v = await verifier(env, request, b.actuel); if (v.err) return v.err;
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ erreur: 'Adresse e-mail invalide.' }, 400);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').bind(email, v.u.id).first()) return json({ erreur: 'Cette adresse est déjà utilisée par un autre compte.' }, 400);
  if (mailPret(env)) {
    await initMail(env.DB);
    const u = await env.DB.prepare('SELECT pseudo FROM users WHERE id = ?').bind(v.u.id).first();
    const t = await creerJeton(env.DB, v.u.id, 'email', 60 * 24, { email });
    const r = await envoyerUn(env, email, 'N-TURF : confirme ta nouvelle adresse', gabarit('Confirme ta nouvelle adresse', `<p>Bonjour ${String(u.pseudo).replace(/[<>&"]/g, '')},</p><p>Pour que cette adresse remplace l'ancienne sur ton compte N-TURF, touche le bouton ci-dessous (valable 24 heures).</p>` + bouton(`${SITE}/verifier.html#e=${t}`, 'Confirmer ma nouvelle adresse'), 'Si tu n\'as rien demandé, ignore ce message : rien ne change.'));
    if (!r.ok) return json({ erreur: 'L\'e-mail de confirmation n\'a pas pu partir vers cette adresse. Vérifie-la.' }, 400);
    return json({ ok: true, attente: true, texte: 'Un lien de confirmation vient de partir vers ' + email + '. Ton adresse changera dès que tu l\'auras touché (valable 24 heures).' });
  }
  await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, v.u.id).run();
  return json({ ok: true, email });
}
