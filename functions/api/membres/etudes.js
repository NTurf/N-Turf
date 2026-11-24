import { json, initDb, currentUser, lireContenu, noDb } from '../../_auth.js';

// Études du jour (images), réservées aux membres connectés
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const out = {};
  for (const g of ['etquinte', 'etr1', 'etout', 'ettrot']) out[g] = await lireContenu(env.DB, 'hippo_' + g);
  // date du Quinté+ affiché : les études d'un autre jour ne se montrent plus
  const q = await lireContenu(env.DB, 'quinte');
  out.quinteDate = (q && q.date) || null;
  return json(out);
}
