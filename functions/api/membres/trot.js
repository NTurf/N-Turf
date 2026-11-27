import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { cache, preparer, dateParam } from '../../_pmu.js';
import { etudeTrot } from '../../_etudes_auto.js';

// Études trotteurs : formule du membre calculée automatiquement sur toutes les courses de trot françaises du jour.
// Note = |limite − gains| ÷ limite × dernière place (0, lettre ou > 10 = 10) × cote (30 maximum). Plus la note est petite, mieux c'est.
// Deux classements : limite des conditions (recul si la course en a, sinon plafond « n'ayant pas gagné ») et recul fictif ((plus petits + plus gros gains) ÷ 2).
// Appel : /api/membres/trot?date=24/11/2026

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await preparer(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const d = dateParam(new URL(request.url));
  if (!d) return json({ erreur: 'Date manquante.' }, 400);
  try {
    const out = await cache(db, 'trot2-' + d, 600, () => etudeTrot(db, d));
    return json(out);
  } catch (e) {
    return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502);
  }
}
