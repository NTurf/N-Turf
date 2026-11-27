import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours } from '../../_concours.js';
import { statsConcours } from '../../_concours_stats.js';

// Statistiques du concours Quinté+ : fiche de chaque participant, tableau comparatif, classements par spécialité.
// Réservé aux membres connectés. Aucune donnée personnelle (pas d'e-mail) : seulement pseudos et performances.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Réservé aux membres.' }, 401);
  const s = await statsConcours(db);
  const moi = s.joueurs.find((x) => x.id === u.id);
  s.joueurs.forEach((x) => { delete x.id; });
  return json({ ...s, moi: moi ? moi.pseudo : null });
}
