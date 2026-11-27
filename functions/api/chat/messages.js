import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initChat, salonsDe } from './_chat.js';

const COLS = `m.id, m.user_id, m.pseudo, m.modo, m.texte, m.cree, m.supprime, m.reponse_a,
  p.pseudo AS r_pseudo, p.texte AS r_texte, p.supprime AS r_sup`;
const FROM = 'FROM chat_messages m LEFT JOIN chat_messages p ON p.id = m.reponse_a';

// Lire les messages d'un salon : /api/chat/messages?salon=general&apres=123
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initChat(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour accéder au tchat.' }, 401);
  const q = new URL(request.url).searchParams;
  const L = salonsDe(u);
  const salon = L[q.get('salon')] ? q.get('salon') : 'general';
  const apres = parseInt(q.get('apres') || '0', 10) || 0;
  let r;
  if (apres) r = await env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE m.salon = ? AND m.id > ? ORDER BY m.id LIMIT 200`).bind(salon, apres).all();
  else r = await env.DB.prepare(`SELECT * FROM (SELECT ${COLS} ${FROM} WHERE m.salon = ? ORDER BY m.id DESC LIMIT 100) ORDER BY id`).bind(salon).all();
  // messages supprimés depuis la dernière lecture (pour les retirer de l'écran)
  const sup = apres ? (await env.DB.prepare('SELECT id FROM chat_messages WHERE salon = ? AND supprime = 1 AND id <= ? ORDER BY id DESC LIMIT 200').bind(salon, apres).all()).results.map((x) => x.id) : [];
  const msgs = (r.results || []).map((m) => m.supprime ? { id: m.id, supprime: 1, cree: m.cree } : {
    id: m.id, uid: m.user_id, pseudo: m.pseudo, modo: !!m.modo, texte: m.texte, cree: m.cree,
    // le message cité, en petit au-dessus de la réponse
    rep: m.reponse_a ? { id: m.reponse_a, pseudo: m.r_pseudo || '', texte: m.r_sup ? '' : String(m.r_texte || '').slice(0, 140), sup: !!m.r_sup || !m.r_pseudo } : null,
  });
  let signalements = 0;
  if (u.moderateur) signalements = (await env.DB.prepare('SELECT COUNT(DISTINCT message_id) AS n FROM chat_signalements WHERE traite = 0').first()).n;
  return json({ moi: { id: u.id, pseudo: u.pseudo, modo: u.moderateur }, salons: L, messages: msgs, supprimes: sup, signalements });
}

// Écrire un message (éventuellement en réponse à un autre : { reponse: id })
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initChat(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour écrire.' }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const salon = salonsDe(u)[b.salon] ? b.salon : 'general';
  const texte = String(b.texte || '').replace(/\s+$/,'').replace(/^\s+/,'').slice(0, 500);
  if (!texte) return json({ erreur: 'Message vide.' }, 400);
  const der = await env.DB.prepare('SELECT cree FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1').bind(u.id).first();
  if (der && Date.now() - der.cree < 3000 && !u.moderateur) return json({ erreur: 'Doucement : attends quelques secondes entre deux messages.' }, 429);
  let rep = null;
  if (b.reponse) {
    const p = await env.DB.prepare('SELECT id FROM chat_messages WHERE id = ? AND salon = ? AND supprime = 0').bind(parseInt(b.reponse, 10) || 0, salon).first();
    if (p) rep = p.id;
  }
  const r = await env.DB.prepare('INSERT INTO chat_messages (salon, user_id, pseudo, modo, texte, cree, reponse_a) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(salon, u.id, u.pseudo, u.moderateur ? 1 : 0, texte, Date.now(), rep).run();
  return json({ ok: true, id: r.meta.last_row_id });
}
