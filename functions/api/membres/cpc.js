import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { cpcAvecCoeurs } from '../../_coeurs.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  return json({ cpc: await cpcAvecCoeurs(env.DB, 'cpc', 'coeurs') });
}
