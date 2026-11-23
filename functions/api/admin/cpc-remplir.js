import { json, initDb, currentUser, peutPublier, noDb } from '../../_auth.js';
import { BASE, norm, cache, get, preparer } from '../../_pmu.js';

// Arrivées et rapports du PMU, rangés comme dans la feuille « Saisie Journaux » du fichier course par course
// Colonnes C à P de la ligne des rapports : Gagnant, Placé 1er, 2e, 3e, Couplé gagnant, Couplé placé 1-2, 1-3, 2-3, Trio, Multi 4, 5, 6, 7, Super 4
const val = (r) => Math.round(Number(r && r.dividendePourUnEuro) || 0) / 100;
const nums = (c) => String(c || '').split(/[^0-9]+/).filter(Boolean).map(Number);

function rapportsFichier(blocs, arr) {
  const pris = new Map();
  for (const b of Array.isArray(blocs) ? blocs : []) {
    if (!b || !b.typePari) continue;
    const cur = pris.get(b.typePari);
    if (!cur || (cur.audience !== 'NATIONAL' && b.audience === 'NATIONAL')) pris.set(b.typePari, b);
  }
  const R = (k) => { const b = pris.get(k); return b && !b.rembourse ? (b.rapports || []).filter((r) => !String(r.combinaison || '').includes('NP')) : null; };
  const paire = (a, b) => [a, b].sort((x, y) => x - y).join('-');
  const v = new Array(14).fill(null);
  const sg = R('SIMPLE_GAGNANT'); if (sg) { const r = sg.find((x) => nums(x.combinaison)[0] === arr[0]) || sg[0]; if (r) v[0] = val(r); }
  const sp = R('SIMPLE_PLACE'); if (sp) for (let i = 0; i < 3; i++) { const r = sp.find((x) => nums(x.combinaison)[0] === arr[i]); if (r) v[1 + i] = val(r); }
  const cg = R('COUPLE_GAGNANT') || R('COUPLE_ORDRE'); if (cg && cg[0]) v[4] = val(cg[0]);
  const cp = R('COUPLE_PLACE');
  if (cp) [[0, 1], [0, 2], [1, 2]].forEach(([a, b], i) => { const k = paire(arr[a], arr[b]); const r = cp.find((x) => paire(...nums(x.combinaison)) === k); if (r) v[5 + i] = val(r); });
  const tr = R('TRIO') || R('TRIO_ORDRE'); if (tr && tr[0]) v[8] = val(tr[0]);
  const mu = R('MULTI');
  if (!pris.has('MULTI')) { for (let i = 9; i <= 12; i++) v[i] = 'non'; }
  else for (let n = 4; n <= 7; n++) { const r = (mu || []).find((x) => new RegExp('en\\s*' + n).test(String(x.libelle || '').toLowerCase())); v[9 + n - 4] = r ? val(r) : 0; }
  const s4 = R('SUPER_QUATRE'); if (s4 && s4[0]) v[13] = val(s4[0]);
  return v;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await preparer(db);
  const u = await currentUser(db, request);
  if (!peutPublier(u)) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(b.date || '')) return json({ erreur: 'Date du fichier illisible.' }, 400);
  const d = b.date.split('/').join('');
  let prog;
  try { prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`)); } catch (e) { return json({ erreur: 'Le programme du PMU ne répond pas, réessaie dans un instant.' }, 502); }
  const reunionsPmu = (prog && prog.programme && prog.programme.reunions) || [];
  const out = [];
  for (const re of b.reunions || []) {
    const h = norm(re.brut);
    const pr = reunionsPmu.find((r) => { const a = norm(r.hippodrome && r.hippodrome.libelleCourt), c = norm(r.hippodrome && r.hippodrome.libelleLong); return h && ((a && (a.includes(h) || h.includes(a))) || (c && (c.includes(h) || h.includes(c)))); });
    const res = { brut: re.brut, trouve: !!pr, courses: [] };
    if (pr) for (const num of re.courses || []) {
      const c = (pr.courses || []).find((k) => k.numOrdre === num);
      const arr = c && Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [];
      if (arr.length < 3) { res.courses.push({ num, etat: c ? 'pas encore courue' : 'pas au programme du PMU' }); continue; }
      let blocs = null;
      try { blocs = await cache(db, `rap-${d}-R${pr.numOfficiel}C${num}`, 120, () => get(`${BASE}/${d}/R${pr.numOfficiel}/C${num}/rapports-definitifs`)); } catch (e) { blocs = null; }
      if (!Array.isArray(blocs) || !blocs.length) { res.courses.push({ num, arrivee: arr.slice(0, 4), etat: 'rapports pas encore publiés' }); continue; }
      res.courses.push({ num, arrivee: arr.slice(0, 4), rapports: rapportsFichier(blocs, arr), etat: 'ok' });
    }
    out.push(res);
  }
  return json({ reunions: out });
}
