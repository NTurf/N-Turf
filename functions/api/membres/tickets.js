import { json, initDb, currentUser, lireContenu, noDb } from '../../_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const t = await lireContenu(env.DB, 'tickets'), q = await lireContenu(env.DB, 'quinte');
  // Les tickets d'un autre jour que le Quinté+ affiché ne se montrent plus (ils restent gardés par date pour les bilans)
  return json({ tickets: t && q && t.date && q.date && t.date !== q.date ? null : t, quinte: q });
}
