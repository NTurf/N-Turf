import { json, initDb, currentUser, lireContenu, noDb } from '../../_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  return json({ tickets: await lireContenu(env.DB, 'tickets'), quinte: await lireContenu(env.DB, 'quinte') });
}
