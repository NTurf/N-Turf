import { json, initDb, currentUser, noDb } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ connecte: false });
  // La Balançoire : le lien n'apparaît que pour ses joueurs et l'administrateur
  let balancoire = u.role === 'admin';
  if (!balancoire) { try { balancoire = !!(await env.DB.prepare('SELECT 1 AS o FROM bal_joueurs WHERE user_id = ? AND actif = 1').bind(u.id).first()); } catch (e) {} }
  return json({ connecte: true, ...u, balancoire });
}
