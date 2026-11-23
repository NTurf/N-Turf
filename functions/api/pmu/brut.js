import { json, initDb, currentUser, peutPublier } from '../../_auth.js';
import { BASE, cache, get, preparer } from '../../_pmu.js';

// Pour vérifier : les rapports bruts du PMU d'une course (administration seulement)
// /api/pmu/brut?date=23112026&r=1&c=2
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  await initDb(db); await preparer(db);
  if (!peutPublier(await currentUser(db, request))) return json({ erreur: "Réservé à l'administration." }, 403);
  const q = new URL(request.url).searchParams;
  const d = q.get('date'), r = q.get('r'), c = q.get('c');
  try {
    const blocs = await cache(db, `rap-${d}-R${r}C${c}`, 60, () => get(`${BASE}/${d}/R${r}/C${c}/rapports-definitifs`));
    return json((blocs || []).map((b) => ({ type: b.typePari, audience: b.audience, rembourse: b.rembourse, rapports: (b.rapports || []).map((x) => ({ libelle: x.libelle, comb: x.combinaison, d: x.dividendePourUnEuro })) })));
  } catch (e) { return json({ erreur: String(e) }, 502); }
}
