import { json, initDb, currentUser, noDb } from '../../_auth.js';

// Tous les tickets publiés, jour par jour, avec l'arrivée et les rapports gardés pour ce jour
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const t = await env.DB.prepare("SELECT cle, data FROM contenu WHERE cle LIKE 'tickets-____-__-__' ORDER BY cle").all();
  const q = await env.DB.prepare("SELECT cle, data FROM contenu WHERE cle LIKE 'quinte-____-__-__'").all();
  const qs = {};
  for (const r of q.results || []) qs[r.cle.slice(7)] = JSON.parse(r.data);
  const jours = (t.results || []).map((r) => {
    const j = r.cle.slice(8);
    return { jour: j, tickets: JSON.parse(r.data), quinte: qs[j] || null };
  });
  const rep = await env.DB.prepare("SELECT data FROM contenu WHERE cle = 'tickets_report'").first();
  return json({ jours, report: rep ? JSON.parse(rep.data) : null });
}
