import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { cache, preparer } from '../../_pmu.js';
import { etudeQuinte } from '../../_etudes_auto.js';

// Étude Quinté+ (automatique) : listes N-TURF du fichier publié + formule du membre (trot) + cotes PMU, croisées
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await preparer(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  try { return json(await etudeQuinte(db)); }
  catch (e) { return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502); }
}
