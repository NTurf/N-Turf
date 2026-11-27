import { json, initDb, currentUser } from '../../_auth.js';
import { initBal, acces, reprendreHistorique } from '../../_balancoire.js';
// Pour qui n'a pas accès, La Balançoire n'existe pas : réponse « introuvable », comme pour une page qui n'existe pas
export const introuvable = () => new Response('Introuvable', { status: 404 });
export async function entrer(request, env) {
  if (!env.DB) return { refus: introuvable() };
  const db = env.DB;
  await initDb(db); await initBal(db);
  const u = await currentUser(db, request);
  const a = await acces(db, u);
  if (!a) return { refus: introuvable() };
  try { await reprendreHistorique(db); } catch (e) {}
  return { db, u, a };
}
export { json };
