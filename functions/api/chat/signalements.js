import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initChat, SALONS } from './_chat.js';

// Liste des messages signalés (modérateurs)
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initChat(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || !u.moderateur) return json({ erreur: 'Réservé aux modérateurs.' }, 403);
  const r = await env.DB.prepare(`SELECT m.id, m.salon, m.pseudo, m.texte, m.cree, COUNT(s.id) AS nb
    FROM chat_signalements s JOIN chat_messages m ON m.id = s.message_id
    WHERE s.traite = 0 AND m.supprime = 0 GROUP BY m.id ORDER BY m.id DESC LIMIT 100`).all();
  return json({ signalements: (r.results || []).map((x) => ({ ...x, salonNom: SALONS[x.salon] || x.salon })) });
}
