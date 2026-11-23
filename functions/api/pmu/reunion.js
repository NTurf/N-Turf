import { json, initDb } from '../../_auth.js';
import { BASE, norm, cache, get, preparer, dateParam, detailCourse } from '../../_pmu.js';

// Données publiques du PMU pour une réunion : partants, musique, arrivée, rapports.
// Appel : /api/pmu/reunion?date=23/11/2026&hippo=vincennes
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ erreur: 'Base absente.' }, 503);
  const db = env.DB;
  await initDb(db); await preparer(db);
  const u = new URL(request.url);
  const d = dateParam(u), hippo = norm(u.searchParams.get('hippo'));
  if (!d || !hippo) return json({ erreur: 'Paramètres manquants.' }, 400);
  try {
    const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
    const reunions = prog && prog.programme && prog.programme.reunions || [];
    const reu = reunions.find((r) => {
      const a = norm(r.hippodrome && r.hippodrome.libelleCourt), b = norm(r.hippodrome && r.hippodrome.libelleLong);
      return (a && (a.includes(hippo) || hippo.includes(a))) || (b && (b.includes(hippo) || hippo.includes(b)));
    });
    if (!reu) return json({ trouve: false });
    const courses = [];
    for (const c of reu.courses || []) courses.push(await detailCourse(db, d, reu.numOfficiel, c));
    return json({ trouve: true, reunion: reu.numOfficiel, hippodrome: reu.hippodrome && reu.hippodrome.libelleCourt, courses });
  } catch (e) {
    return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502);
  }
}
