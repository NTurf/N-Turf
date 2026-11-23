import { json, initDb } from '../../_auth.js';
import { BASE, cache, get, preparer, dateParam, detailCourse } from '../../_pmu.js';

// Le Quinté+ du jour d'après le PMU : course, partants, arrivée, rapports.
// Appel : /api/pmu/quinte?date=23/11/2026
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ erreur: 'Base absente.' }, 503);
  const db = env.DB;
  await initDb(db); await preparer(db);
  const d = dateParam(new URL(request.url));
  if (!d) return json({ erreur: 'Date manquante.' }, 400);
  try {
    const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
    for (const r of (prog && prog.programme && prog.programme.reunions) || []) {
      for (const c of r.courses || []) {
        const codes = (c.paris || []).map((p) => p.codePari);
        if (codes.includes('QUINTE_PLUS')) {
          const det = await detailCourse(db, d, r.numOfficiel, c);
          return json({ trouve: true, reunion: r.numOfficiel, hippodrome: r.hippodrome && r.hippodrome.libelleCourt, ...det });
        }
      }
    }
    return json({ trouve: false });
  } catch (e) {
    return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502);
  }
}
