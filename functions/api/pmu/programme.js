import { json, initDb } from '../../_auth.js';
import { BASE, cache, get, preparer, dateParam } from '../../_pmu.js';

// Programme du jour : réunions (hippodrome) et numéros de course. Appel : /api/pmu/programme?date=23/11/2026
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ erreur: 'Base absente.' }, 503);
  const db = env.DB;
  await initDb(db); await preparer(db);
  const d = dateParam(new URL(request.url));
  if (!d) return json({ erreur: 'Date manquante.' }, 400);
  try {
    const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
    const reunions = ((prog && prog.programme && prog.programme.reunions) || []).map((r) => ({
      r: r.numOfficiel, h: (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || ('R' + r.numOfficiel),
      courses: (r.courses || []).map((c) => c.numOrdre),
      fin: Math.max(0, ...(r.courses || []).map((c) => Number(c.heureDepart) || 0)),
    }));
    return json({ reunions });
  } catch (e) { return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502); }
}
