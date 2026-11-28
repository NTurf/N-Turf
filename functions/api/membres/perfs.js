import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { cache, preparer, dateParam } from '../../_pmu.js';
import { etudePerfs } from '../../_etudes_auto.js';

// Étude « 5 dernières perfs » : classement de chaque course du jour selon la moyenne des 5 dernières places (10 au-delà de la 10e).
// Appel : /api/membres/perfs?date=24/11/2026

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await preparer(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const d = dateParam(new URL(request.url));
  if (!d) return json({ erreur: 'Date manquante.' }, 400);
  try {
    const out = await cache(db, 'perfs1-' + d, 600, () => etudePerfs(db, d));
    return json(out);
  } catch (e) {
    return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502);
  }
}
