import { initDb } from '../../_auth.js';
import { initMail, verifDesabo } from '../../_mail.js';
// Désabonnement des messages d'information (les messages indispensables au compte continuent)
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams, uid = parseInt(q.get('u'), 10);
  const page = (t) => new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>N-TURF</title></head><body style="font-family:Arial;padding:24px;max-width:520px;margin:auto"><h2>N-TURF</h2><p>${t}</p><p><a href="/compte.html">Mon compte</a> · <a href="/">Accueil</a></p></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (!env.DB || !uid || !(await verifDesabo(env, uid, q.get('s') || ''))) return page('Ce lien n\'est pas valable.');
  await initDb(env.DB); await initMail(env.DB);
  await env.DB.prepare('UPDATE users SET info_ok = 0 WHERE id = ?').bind(uid).run();
  return page('C\'est noté : tu ne recevras plus les messages d\'information de N-TURF. Les messages indispensables à ton compte (mot de passe, sécurité) continueront. Tu peux changer d\'avis dans « Mon compte ».');
}
