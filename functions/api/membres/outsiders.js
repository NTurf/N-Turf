import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { cache, preparer, dateParam } from '../../_pmu.js';
import { outsiders } from '../../_etudes_auto.js';

// Études outsiders (automatique) : chevaux cotés de 6 à 10 au PMU, réunions publiées + Quinté+. Appel : /api/membres/outsiders?date=27/11/2026
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await preparer(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const d = dateParam(new URL(request.url));
  if (!d) return json({ erreur: 'Date manquante.' }, 400);
  try { return json(await cache(db, 'outs-' + d, 120, () => outsiders(db, d))); }
  catch (e) { return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502); }
}
