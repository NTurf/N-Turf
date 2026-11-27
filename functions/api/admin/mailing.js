import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initMail, mailPret, emailOk, envoyerUn, envoyerLot, gabarit, texteVersHtml, lienDesabo } from '../../_mail.js';

// MAILING – COMMUNICATION AUX MEMBRES (administrateur seul)
// Groupes : tous, modérateurs, contributeurs du Ticket du jour, joueurs de La Balançoire, joueurs du concours, membres qui donnent des pronos, ou choix à la main.
// Catégorie : « essentiel » (fonctionnement du compte : envoyé à tous les ciblés) ou « info » (seulement à ceux qui acceptent les informations, avec lien de désabonnement).
// Chaque membre reçoit son propre e-mail : personne ne voit l'adresse des autres.
const GROUPES = {
  tous: { nom: 'Tous les membres', sql: '1 = 1' },
  moderateurs: { nom: 'Modérateurs', sql: "(u.moderateur = 1 OR u.role = 'admin')" },
  contributeurs: { nom: 'Contributeurs du Ticket du jour', sql: 'u.id IN (SELECT user_id FROM td_contributeurs WHERE actif = 1)' },
  balancoire: { nom: 'Joueurs de La Balançoire', sql: 'u.id IN (SELECT user_id FROM bal_joueurs WHERE actif = 1 AND user_id IS NOT NULL)' },
  concours: { nom: 'Joueurs du concours Quinté+', sql: 'u.id IN (SELECT DISTINCT user_id FROM concours_pronos)' },
  pronos: { nom: 'Membres qui donnent des pronos', sql: 'u.id IN (SELECT DISTINCT user_id FROM pm_pronos)' },
  inactifs: { nom: 'Pas venus depuis 30 jours', sql: "(u.last_login IS NULL OR u.last_login < datetime('now', '-30 days'))" },
};
async function admin(env, request) {
  if (!env.DB) return { err: noDb() };
  const db = env.DB; await initDb(db); await initMail(db);
  const u = await currentUser(db, request);
  if (!u || u.role !== 'admin') return { err: json({ erreur: 'Réservé à l\'administrateur.' }, 403) };
  return { db, u };
}
// Les destinataires d'une cible
async function destinataires(db, cible, categorie) {
  const g = GROUPES[cible && cible.groupe] || null;
  let where = g ? g.sql : '0 = 1';
  const binds = [];
  if (cible && cible.groupe === 'choix') { const ids = (cible.ids || []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 500); where = ids.length ? `u.id IN (${ids.map(() => '?').join(',')})` : '0 = 1'; binds.push(...ids); }
  let rows = [];
  try { rows = (await db.prepare(`SELECT u.id, u.pseudo, u.email, u.email_ko, u.info_ok FROM users u WHERE u.role != 'robot' AND u.banni = 0 AND ${where}`).bind(...binds).all()).results || []; }
  catch (e) { rows = []; } // un groupe dont la table n'existe pas encore = personne
  const exclus = { ko: 0, info: 0, invalide: 0 };
  const L = rows.filter((r) => {
    if (!emailOk(r.email)) { exclus.invalide++; return false; }
    if (r.email_ko && !(cible && cible.inclureKo)) { exclus.ko++; return false; }
    if (categorie === 'info' && !r.info_ok) { exclus.info++; return false; }
    return true;
  });
  return { L, exclus };
}
export async function onRequestGet({ request, env }) {
  const { err, db } = await admin(env, request); if (err) return err;
  const id = parseInt(new URL(request.url).searchParams.get('envoi'), 10);
  if (id) {
    const e = await db.prepare('SELECT * FROM mail_envois WHERE id = ?').bind(id).first();
    const d = (await db.prepare('SELECT d.email, d.statut, d.erreur, u.pseudo FROM mail_dest d LEFT JOIN users u ON u.id = d.user_id WHERE d.envoi_id = ? ORDER BY d.statut DESC, u.pseudo').bind(id).all()).results || [];
    return json({ envoi: e, destinataires: d });
  }
  const membres = (await db.prepare("SELECT id, pseudo, email, email_ko, email_ko_raison, email_verifie, info_ok FROM users WHERE role != 'robot' AND banni = 0 ORDER BY pseudo_lc").all()).results || [];
  const envois = (await db.prepare('SELECT id, quand, sujet, categorie, cible, nb, ok, echecs FROM mail_envois ORDER BY id DESC LIMIT 50').all()).results || [];
  const nd = (await db.prepare("SELECT envoi_id, COUNT(*) AS n FROM mail_dest WHERE statut = 'non distribue' GROUP BY envoi_id").all()).results || [];
  const ndm = {}; nd.forEach((x) => { ndm[x.envoi_id] = x.n; });
  return json({ pret: mailPret(env), expediteur: env.MAIL_FROM || 'contact@n-turf.net', groupes: Object.keys(GROUPES).map((k) => ({ k, nom: GROUPES[k].nom })),
    membres: membres.map((m) => ({ id: m.id, pseudo: m.pseudo, ko: !!m.email_ko, raison: m.email_ko_raison, verifie: !!m.email_verifie, info: !!m.info_ok, invalide: !emailOk(m.email) })),
    envois: envois.map((e) => ({ ...e, nonDistribues: ndm[e.id] || 0 })) });
}
export async function onRequestPost({ request, env }) {
  const { err, db, u } = await admin(env, request); if (err) return err;
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const categorie = b.categorie === 'info' ? 'info' : 'essentiel';
  if (b.action === 'apercu') {
    const { L, exclus } = await destinataires(db, b.cible, categorie);
    return json({ nb: L.length, exclus });
  }
  if (b.action === 'reinitKo') {
    await db.prepare('UPDATE users SET email_ko = 0, email_ko_raison = NULL WHERE id = ?').bind(parseInt(b.user, 10) || 0).run();
    return json({ ok: true });
  }
  if (!mailPret(env)) return json({ erreur: 'Le service d\'envoi (Brevo) n\'est pas encore branché.' }, 503);
  const sujet = String(b.sujet || '').trim().slice(0, 150), corps = String(b.corps || '').trim().slice(0, 20000);
  if (!sujet || !corps) return json({ erreur: 'Il faut un objet et un message.' }, 400);
  const pied = categorie === 'info' ? 'Message d\'information de N-TURF.' : 'Message lié à ton compte N-TURF.';
  const html = async (d) => gabarit(sujet, `<p>Bonjour ${String(d.pseudo || '').replace(/[<>&"]/g, '')},</p><p>${texteVersHtml(corps)}</p>`,
    pied + (categorie === 'info' && d.id ? ` <a href="${await lienDesabo(env, d.id)}" style="color:#1E5BB5">Ne plus recevoir ces informations</a>` : ''));
  if (b.action === 'test') {
    const moi = await db.prepare('SELECT id, pseudo, email FROM users WHERE id = ?').bind(u.id).first();
    const r = await envoyerUn(env, moi.email, '[TEST] ' + sujet, await html(moi));
    return r.ok ? json({ ok: true, texte: 'Message test envoyé à ' + moi.email + '.' }) : json({ erreur: 'Échec du test : ' + r.erreur }, 502);
  }
  if (b.action === 'envoyer') {
    const { L } = await destinataires(db, b.cible, categorie);
    if (!L.length) return json({ erreur: 'Aucun destinataire.' }, 400);
    if (L.length > 290) return json({ erreur: `${L.length} destinataires : l'offre gratuite de Brevo permet 300 e-mails par jour. Coupe l'envoi en plusieurs groupes.` }, 400);
    const pre = {}; for (const d of L) pre[d.id] = await html(d);
    const res = await envoyerLot(env, sujet, L, (d) => pre[d.id]);
    const ok = res.filter((x) => x.statut === 'envoye').length;
    const g = b.cible && b.cible.groupe;
    const cibleTxt = g === 'choix' ? 'Choix à la main' : (GROUPES[g] ? GROUPES[g].nom : g);
    const e = await db.prepare('INSERT INTO mail_envois (par, sujet, corps, categorie, cible, nb, ok, echecs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(u.id, sujet, corps, categorie, cibleTxt, L.length, ok, L.length - ok).run();
    const eid = e.meta.last_row_id;
    for (let i = 0; i < res.length; i += 20) {
      const lot = res.slice(i, i + 20);
      await db.prepare(`INSERT INTO mail_dest (envoi_id, user_id, email, statut, erreur) VALUES ${lot.map(() => '(?, ?, ?, ?, ?)').join(', ')}`).bind(...lot.flatMap((x) => [eid, x.id, x.email, x.statut, x.erreur || null])).run();
    }
    // une adresse refusée à l'envoi est signalée (le compte n'est jamais supprimé)
    const ko = res.filter((x) => x.statut === 'echec' && /email|adresse|invalid/i.test(x.erreur || ''));
    for (const x of ko.slice(0, 20)) await db.prepare('UPDATE users SET email_ko = 1, email_ko_raison = ? WHERE id = ?').bind('refusée à l\'envoi : ' + String(x.erreur).slice(0, 100), x.id).run();
    return json({ ok: true, envoi: eid, nb: L.length, envoyes: ok, echecs: L.length - ok });
  }
  return json({ erreur: 'Action inconnue.' }, 400);
}
