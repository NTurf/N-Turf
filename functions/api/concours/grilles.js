import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours } from '../../_concours.js';
import { analyseGrilles } from '../../_grilles.js';
// Analyse des grilles de 5 à 8 chevaux (point 5C) — réservée à l'administrateur pour l'instant
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initConcours(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  return json(await analyseGrilles(env.DB));
}
