import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initTd, statsContributeurs } from '../../_td.js';
// Statistiques des contributeurs du Ticket du jour (membres connectés)
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initTd(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Réservé aux membres.' }, 401);
  return json({ contributeurs: await statsContributeurs(env.DB) });
}
