import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours, calculerSiPret, parisJour, isoVersFr, bornesSemaine, bornesMois, classement, classementJour, dernierJourCalcule } from '../../_concours.js';

// Les trois podiums : du jour, de la semaine (lundi-dimanche), Globe de Cristal (mois). Visibles de tous.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db);
  const auj = parisJour();
  try { await calculerSiPret(db, auj); } catch (e) {}
  const u = await currentUser(db, request);
  const dj = await dernierJourCalcule(db);
  const [s1, s2] = bornesSemaine(auj), [m1, m2] = bornesMois(auj);
  const sem = await classement(db, s1, s2, false);
  const mois = await classement(db, m1, m2, true);
  const jour = dj ? await classementJour(db, dj) : [];
  const restants = Math.max(0, Math.round((Date.UTC(...m2.split('-').map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...auj.split('-').map((x, i) => i === 1 ? x - 1 : +x))) / 86400000) + 1);
  const moi = (L) => (u ? L.find((x) => x.id === u.id) || null : null);
  const sansId = (L) => L.map(({ id, ...r }) => r);
  return json({
    jour: { date: dj, dateFr: dj ? isoVersFr(dj) : null, liste: sansId(jour), moi: moi(jour) },
    semaine: { du: isoVersFr(s1), au: isoVersFr(s2), jours: sem.jours.length, liste: sansId(sem.liste), moi: moi(sem.liste) },
    globe: { mois: m1.slice(0, 7), du: isoVersFr(m1), au: isoVersFr(m2), restants, jours: mois.jours.length, liste: sansId(mois.liste), moi: moi(mois.liste) },
  });
}
