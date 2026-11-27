// Envoi des e-mails du site par Brevo (cahier des charges, points 1 et 2).
// Réglages sur Cloudflare (variables du projet) : BREVO_API_KEY (obligatoire), MAIL_FROM (adresse d'envoi, par défaut contact@n-turf.net),
// MAIL_SECRET (facultatif, signe les liens de désabonnement), MAIL_WEBHOOK_KEY (facultatif, retours d'adresses invalides).
export const SITE = 'https://n-turf.net';
export const REPONSE = 'n.turf.contact@gmail.com';
export const mailPret = (env) => !!(env && env.BREVO_API_KEY);
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export const jeton = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && String(e).length <= 120;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let pret = false;
export async function initMail(db) {
  if (pret) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_jetons (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, type TEXT NOT NULL, data TEXT,
      expire INTEGER NOT NULL, utilise INTEGER NOT NULL DEFAULT 0, cree INTEGER NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS mail_jetons_user ON mail_jetons (user_id, type, cree)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_envois (id INTEGER PRIMARY KEY AUTOINCREMENT, quand TEXT NOT NULL DEFAULT (datetime('now')), par INTEGER,
      sujet TEXT NOT NULL, corps TEXT NOT NULL, categorie TEXT NOT NULL, cible TEXT, nb INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, echecs INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mail_dest (envoi_id INTEGER NOT NULL, user_id INTEGER, email TEXT NOT NULL, statut TEXT NOT NULL, erreur TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS mail_dest_envoi ON mail_dest (envoi_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS mail_dest_email ON mail_dest (email)'),
  ]);
  // email_verifie : adresse confirmée ; email_ko : adresse signalée en échec (le compte n'est jamais supprimé) ; info_ok : accepte les messages d'information
  for (const col of ['email_verifie INTEGER NOT NULL DEFAULT 0', 'email_ko INTEGER NOT NULL DEFAULT 0', 'email_ko_raison TEXT', 'info_ok INTEGER NOT NULL DEFAULT 1']) {
    try { await db.prepare('ALTER TABLE users ADD COLUMN ' + col).run(); } catch (e) { /* déjà là */ }
  }
  pret = true;
}

// Mise en page commune des e-mails (simple, lisible sur téléphone)
export function gabarit(titre, corpsHtml, pied) {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#e8eef8;font-family:Arial,Helvetica,sans-serif;color:#0D1E3D">
<div style="max-width:560px;margin:0 auto;padding:16px">
<div style="background:#0D1E3D;color:#fff;border-radius:12px 12px 0 0;padding:14px 18px;font-weight:bold;font-size:20px;letter-spacing:1px">N-TURF<br><span style="font-size:12px;font-weight:normal;color:#f0be3c">Le collectif des passionnés de courses hippiques</span></div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:18px;font-size:16px;line-height:1.5">
<h1 style="font-size:19px;margin:0 0 12px">${esc(titre)}</h1>${corpsHtml}</div>
<p style="font-size:12px;color:#5b6b85;text-align:center;margin:14px 0">${pied || ''}<br>N-TURF · <a href="${SITE}" style="color:#1E5BB5">n-turf.net</a> · Jeu responsable, interdit aux mineurs</p>
</div></body></html>`;
}
export const bouton = (url, txt) => `<p style="text-align:center;margin:22px 0"><a href="${url}" style="background:#1E5BB5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;display:inline-block">${esc(txt)}</a></p><p style="font-size:13px;color:#5b6b85">Si le bouton ne marche pas, copie ce lien dans ton navigateur :<br><span style="word-break:break-all">${esc(url)}</span></p>`;
export const texteVersHtml = (t) => esc(t).replace(/\n/g, '<br>');

// Un envoi Brevo. versions : [{ email, html, texte?, sujet? }] — chaque destinataire reçoit SON e-mail, seul (jamais les adresses des autres).
async function appelBrevo(env, corps) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(corps),
  });
  if (r.ok) return { ok: true };
  let m = 'Brevo ' + r.status; try { const j = await r.json(); m = j.message || j.code || m; } catch (e) {}
  return { ok: false, erreur: String(m).slice(0, 200), statut: r.status };
}
const expediteur = (env) => ({ name: 'N-TURF', email: env.MAIL_FROM || 'contact@n-turf.net' });

export async function envoyerUn(env, email, sujet, html) {
  if (!mailPret(env)) return { ok: false, erreur: 'Service d\'e-mails non branché.' };
  return appelBrevo(env, { sender: expediteur(env), replyTo: { email: REPONSE, name: 'N-TURF' }, to: [{ email }], subject: sujet, htmlContent: html });
}

// Envoi groupé, chacun séparément (par paquets de 50 ; si un paquet est refusé, on reprend ses adresses une par une pour isoler les fautives)
export async function envoyerLot(env, sujet, dest, htmlPour) {
  const res = [];
  let appels = 0;
  for (let i = 0; i < dest.length; i += 50) {
    const lot = dest.slice(i, i + 50);
    const r = await appelBrevo(env, { sender: expediteur(env), replyTo: { email: REPONSE, name: 'N-TURF' }, subject: sujet, htmlContent: htmlPour(lot[0]),
      messageVersions: lot.map((d) => ({ to: [{ email: d.email }], htmlContent: htmlPour(d) })) });
    appels++;
    if (r.ok) { lot.forEach((d) => res.push({ ...d, statut: 'envoye' })); continue; }
    if (r.statut === 401 || r.statut === 403) { lot.forEach((d) => res.push({ ...d, statut: 'echec', erreur: 'Clé Brevo refusée : ' + r.erreur })); continue; }
    for (const d of lot) {
      if (appels > 40) { res.push({ ...d, statut: 'echec', erreur: 'Non tenté (trop d\'appels en une fois) : ' + r.erreur }); continue; }
      const u = await appelBrevo(env, { sender: expediteur(env), replyTo: { email: REPONSE, name: 'N-TURF' }, to: [{ email: d.email }], subject: sujet, htmlContent: htmlPour(d) });
      appels++;
      res.push({ ...d, statut: u.ok ? 'envoye' : 'echec', erreur: u.ok ? null : u.erreur });
    }
  }
  return res;
}

// Lien de désabonnement des messages d'information (signé : personne ne peut désabonner un autre membre)
export async function lienDesabo(env, uid) {
  const s = (await sha((env.MAIL_SECRET || env.BREVO_API_KEY || 'n-turf') + '|desabo|' + uid)).slice(0, 24);
  return `${SITE}/api/mail/desabo?u=${uid}&s=${s}`;
}
export async function verifDesabo(env, uid, s) { return (await sha((env.MAIL_SECRET || env.BREVO_API_KEY || 'n-turf') + '|desabo|' + uid)).slice(0, 24) === s; }

// Jetons à usage unique et à durée limitée (mot de passe oublié, vérification d'adresse, changement d'adresse)
export async function creerJeton(db, userId, type, minutes, data) {
  const t = jeton(), now = Date.now();
  await db.prepare('INSERT INTO mail_jetons (hash, user_id, type, data, expire, cree) VALUES (?, ?, ?, ?, ?, ?)').bind(await sha(t), userId, type, data ? JSON.stringify(data) : null, now + minutes * 60000, now).run();
  return t;
}
export async function lireJeton(db, t, type) {
  if (!/^[0-9a-f]{64}$/.test(String(t || ''))) return null;
  const r = await db.prepare('SELECT * FROM mail_jetons WHERE hash = ? AND type = ?').bind(await sha(t), type).first();
  if (!r || r.utilise || r.expire < Date.now()) return null;
  return { ...r, data: r.data ? JSON.parse(r.data) : null };
}
export const consommer = (db, r) => db.prepare('UPDATE mail_jetons SET utilise = 1 WHERE hash = ?').bind(r.hash).run();
// Pas plus de 3 demandes par heure et par compte pour un même type (protège les boîtes des membres)
export async function tropDeDemandes(db, userId, type) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM mail_jetons WHERE user_id = ? AND type = ? AND cree > ?').bind(userId, type, Date.now() - 3600000).first();
  return (r && r.n) >= 3;
}

export async function envoyerVerification(env, db, u) {
  if (!mailPret(env)) return false;
  const t = await creerJeton(db, u.id, 'verif', 60 * 48);
  const r = await envoyerUn(env, u.email, 'N-TURF : confirme ton adresse e-mail', gabarit('Bienvenue sur N-TURF, ' + u.pseudo + ' !',
    '<p>Pour confirmer que cette adresse est bien la tienne, touche le bouton ci-dessous. Le lien est valable 48 heures.</p>' + bouton(`${SITE}/verifier.html#t=${t}`, 'Confirmer mon adresse'),
    'Tu reçois ce message parce qu\'un compte N-TURF vient d\'être créé avec cette adresse. Si ce n\'est pas toi, ignore-le.'));
  return r.ok;
}
