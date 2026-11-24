import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { BASE, cache, get, preparer, dateParam } from '../../_pmu.js';
import { limites, classer, chevauxFormule, estTrot } from '../../_formule.js';

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
    const out = await cache(db, 'trot-' + d, 600, async () => {
      const prog = await cache(db, 'prog-' + d, 600, () => get(`${BASE}/${d}`));
      const reunions = (prog && prog.programme && prog.programme.reunions) || [];
      const res = [];
      for (const r of reunions) {
        if (r.pays && r.pays.code && r.pays.code !== 'FRA') continue;
        const courses = [];
        for (const c of r.courses || []) {
          if (!estTrot(c)) continue;
          const parts = await cache(db, `part-${d}-R${r.numOfficiel}C${c.numOrdre}`, 1800, () => get(`${BASE}/${d}/R${r.numOfficiel}/C${c.numOrdre}/participants`));
          const chevaux = chevauxFormule(parts);
          if (!chevaux.length) continue;
          const g = chevaux.map((h) => h.gains), fictif = Math.round((Math.min(...g) + Math.max(...g)) / 2);
          const lim = limites(c.conditions);
          const L = lim.recul || lim.plafond;
          const arrivee = Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x).slice(0, 5) : [];
          courses.push({
            c: c.numOrdre, nom: c.libelle || '', heure: c.heureDepart || null, partants: chevaux.length,
            cotes: chevaux.some((h) => h.cote),
            limite: L, typeLimite: lim.recul ? 'recul' : (lim.plafond ? 'plafond' : null), fictif,
            conditions: classer(chevaux, L), reculFictif: classer(chevaux, fictif),
            noms: Object.fromEntries(chevaux.map((h) => [h.n, h.nom])), arrivee,
          });
        }
        if (courses.length) res.push({ r: r.numOfficiel, h: (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || ('R' + r.numOfficiel), courses });
      }
      return { reunions: res };
    });
    return json(out);
  } catch (e) {
    return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502);
  }
}
