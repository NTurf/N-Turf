import { initDb } from '../../_auth.js';
import { initMail } from '../../_mail.js';
// Retours de Brevo (adresse invalide, rejet définitif, désabonnement) : /api/mail/webhook?cle=MAIL_WEBHOOK_KEY
// Le membre est seulement SIGNALÉ dans l'administration ; son compte n'est jamais supprimé.
export async function onRequestPost({ request, env }) {
  const cle = new URL(request.url).searchParams.get('cle');
  if (!env.DB || !env.MAIL_WEBHOOK_KEY || cle !== env.MAIL_WEBHOOK_KEY) return new Response('Non', { status: 403 });
  await initDb(env.DB); await initMail(env.DB);
  let L; try { L = await request.json(); } catch { return new Response('ok'); }
  for (const e of (Array.isArray(L) ? L : [L]).slice(0, 50)) {
    const email = String(e.email || '').toLowerCase(), ev = String(e.event || '');
    if (!email) continue;
    if (['hard_bounce', 'invalid_email', 'blocked', 'error'].includes(ev)) {
      const raison = (ev === 'hard_bounce' ? 'adresse refusée par sa messagerie' : ev === 'invalid_email' ? 'adresse invalide' : ev === 'blocked' ? 'adresse bloquée' : 'erreur') + (e.reason ? ' (' + String(e.reason).slice(0, 120) + ')' : '');
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET email_ko = 1, email_ko_raison = ? WHERE email = ?').bind(raison, email),
        env.DB.prepare("UPDATE mail_dest SET statut = 'non distribue', erreur = ? WHERE rowid = (SELECT MAX(rowid) FROM mail_dest WHERE email = ?)").bind(raison, email),
      ]);
    } else if (ev === 'unsubscribed') await env.DB.prepare('UPDATE users SET info_ok = 0 WHERE email = ?').bind(email).run();
  }
  return new Response('ok');
}
