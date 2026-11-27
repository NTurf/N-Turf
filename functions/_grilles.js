// ANALYSE DES GRILLES DE 5 À 8 CHEVAUX (cahier des charges, point 5C)
// Sur chaque Quinté+ déjà couru et calculé, pour chaque méthode (TCR, ALGO, PERSO, Études, Formule, synthèse des joueurs, chaque membre),
// on garde les N premiers chevaux de sa sélection (N = 5, 6, 7, 8) et on « joue » cette grille dans chaque structure,
// aux mises de base du PMU, avec les rapports officiels pour 1 €. C'est une SIMULATION sur l'historique : aucun euro n'a été joué.
import { pronoRetenu } from './_concours.js';

export const NS = [5, 6, 7, 8];
// Mises de base par combinaison (tarifs PMU confirmés par Bruno ; Simple et Couplé à 1 €)
export const STRUCT = [
  { k: 'sg', nom: 'Simple gagnant', mise: 1 }, { k: 'sp', nom: 'Simple placé', mise: 1 },
  { k: 'cg', nom: 'Couplé gagnant', mise: 1 }, { k: 'cp', nom: 'Couplé placé', mise: 1 },
  { k: 'tierce', nom: 'Tiercé', mise: 1 }, { k: 'quarte', nom: 'Quarté+', mise: 1.5 },
  { k: 'multi', nom: 'Multi en 4', mise: 3 }, { k: 'quinte', nom: 'Quinté+', mise: 2 },
];
const r2 = (x) => Math.round(x * 100) / 100;
function C(n, k) { if (k < 0 || n < k) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
const contient = (G, T) => T.every((h) => G.includes(h));
// « Ordre » : les chevaux arrivés sont dans le même ordre que dans la sélection (règle validée pour le concours)
const dansLOrdre = (L, T) => T.every((h, i) => i === 0 || L.indexOf(T[i - 1]) < L.indexOf(h));

// Une grille G (N chevaux, dans l'ordre de la sélection) jouée dans chaque structure
export function jouer(G, arr, R) {
  const N = G.length, out = {};
  const t3 = arr.slice(0, 3), t4 = arr.slice(0, 4), t5 = arr.slice(0, 5);
  const add = (k, cout, gains, comb) => { out[k] = { cout: r2(cout), gains: r2(gains), comb }; };
  // Simple : chaque cheval de la grille, 1 € gagnant / 1 € placé
  const g1 = G.includes(arr[0]) && R.g[arr[0]] ? R.g[arr[0]] : 0;
  add('sg', N, g1, g1 ? 1 : 0);
  let sp = 0, nsp = 0; G.forEach((h) => { if (R.p[h]) { sp += R.p[h]; nsp++; } }); add('sp', N, sp, nsp);
  // Couplé : toutes les paires de la grille
  const paires = C(N, 2), kg = arr.slice(0, 2).slice().sort((a, b) => a - b).join('-');
  const cg = contient(G, arr.slice(0, 2)) && R.cg[kg] ? R.cg[kg] : 0; add('cg', paires, cg, cg ? 1 : 0);
  let cp = 0, ncp = 0;
  for (const k of Object.keys(R.cp || {})) { const [a, b] = k.split('-').map(Number); if (G.includes(a) && G.includes(b)) { cp += R.cp[k]; ncp++; } }
  add('cp', paires, cp, ncp);
  // Tiercé combiné : 1 combinaison gagnante si les 3 premiers sont dans la grille
  let t = 0, nt = 0;
  if (t3.length === 3 && contient(G, t3)) { t = dansLOrdre(G, t3) && R.t.o ? R.t.o : (R.t.d || 0); nt = 1; }
  add('tierce', C(N, 3), t, nt);
  // Quarté+ combiné : 4 premiers (ordre ou désordre) + bonus 3 (combinaisons avec les 3 premiers sans le 4e)
  let q = 0, nq = 0;
  if (t4.length === 4 && contient(G, t4)) { q += (dansLOrdre(G, t4) && R.qa.o ? R.qa.o : (R.qa.d || 0)) * 1.5; nq++; }
  if (R.qa.b3 && t3.length === 3 && contient(G, t3)) { const n = C(N - 3 - (G.includes(arr[3]) ? 1 : 0), 1); q += n * R.qa.b3 * 1.5; nq += n; }
  add('quarte', C(N, 4) * 1.5, q, nq);
  // Multi en 4 : les 4 premiers dans une combinaison de 4
  const m = t4.length === 4 && contient(G, t4) && R.m4 ? R.m4 * 3 : 0; add('multi', C(N, 4) * 3, m, m ? 1 : 0);
  // Quinté+ combiné : 5 premiers (ordre ou désordre) + bonus 4, 4 sur 5, 3
  let qi = 0, nqi = 0;
  if (t5.length === 5) {
    const dedans = t5.filter((h) => G.includes(h)).length, autres = N - dedans;
    if (dedans === 5) { qi += (dansLOrdre(G, t5) && R.qi.o ? R.qi.o : (R.qi.d || 0)) * 2; nqi++; }
    // bonus 4 : combinaisons avec les 4 premiers et un cheval hors des 5
    if (contient(G, t4) && R.qi.b4) { const n = autres; qi += n * R.qi.b4 * 2; nqi += n; }
    // bonus 4 sur 5 : 4 des 5 premiers (pas les 4 premiers) + un cheval hors des 5
    if (R.qi.b45) { let n = 0; for (let i = 0; i < 4; i++) { const S = t5.filter((_, j) => j !== i); if (contient(G, S)) n += autres; } qi += n * R.qi.b45 * 2; nqi += n; }
    // bonus 3 : les 3 premiers + 2 chevaux hors des 5
    if (contient(G, t3) && R.qi.b3) { const n = C(autres, 2); qi += n * R.qi.b3 * 2; nqi += n; }
  }
  add('quinte', C(N, 5) * 2, qi, nqi);
  return out;
}

const vide = () => ({ courses: 0, gagnees: 0, comb: 0, cout: 0, gains: 0 });
function cumuler(A, res) { A.courses++; A.cout += res.cout; A.gains += res.gains; A.comb += res.comb; if (res.gains > 0) A.gagnees++; }
const fin = (A) => ({ ...A, cout: r2(A.cout), gains: r2(A.gains), net: r2(A.gains - A.cout) });

export async function analyseGrilles(db) {
  const jours = (await db.prepare(`SELECT date, arrivee, partants, rapports FROM concours_jours WHERE statut = 'calcule' AND rapports IS NOT NULL ORDER BY date`).all()).results || [];
  const pronos = (await db.prepare(`SELECT p.date, p.chevaux, u.pseudo, u.role FROM concours_pronos p JOIN users u ON u.id = p.user_id JOIN concours_jours j ON j.date = p.date WHERE j.statut = 'calcule'`).all()).results || [];
  const J = new Map(jours.map((j) => [j.date, { arr: JSON.parse(j.arrivee || '[]'), R: JSON.parse(j.rapports), parts: JSON.parse(j.partants || '[]') }]));
  // Sélections de départ : chaque joueur (ou méthode du site), + la synthèse brute des joueurs du jour (chevaux les plus cités)
  const src = new Map();
  const ajouter = (nom, robot, date, liste) => { const s = src.get(nom) || { nom, robot, courses: [] }; s.courses.push({ date, liste }); src.set(nom, s); };
  const parJour = new Map();
  for (const p of pronos) {
    const j = J.get(p.date); if (!j) continue;
    const np = j.parts.filter((x) => x.np).map((x) => x.n);
    const L = pronoRetenu(JSON.parse(p.chevaux || '[]'), np, 8);
    if (L.length < 5) continue;
    ajouter(p.pseudo, p.role === 'robot', p.date, L);
    if (p.role !== 'robot') { const t = parJour.get(p.date) || []; t.push(L); parJour.set(p.date, t); }
  }
  for (const [date, Ls] of parJour) {
    if (Ls.length < 2) continue;
    const pts = new Map(); Ls.forEach((L) => L.forEach((h, i) => pts.set(h, (pts.get(h) || 0) + 100 - i)));
    ajouter('Synthèse des joueurs', true, date, [...pts.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 8));
  }
  const profil = (j) => { const n = j.parts.filter((x) => !x.np).length; return n <= 14 ? 'jusqu\'à 14 partants' : n <= 16 ? '15 ou 16 partants' : '17 partants et plus'; };
  const sources = [];
  for (const s of src.values()) {
    s.courses.sort((a, b) => a.date.localeCompare(b.date));
    const n = s.courses.length;
    const T = {}, couv = {}, prof = {};
    NS.forEach((N) => { T[N] = {}; STRUCT.forEach((x) => { T[N][x.k] = vide(); }); couv[N] = { t3: 0, t4: 0, t5: 0, dans5: 0 }; });
    const rangs = Array.from({ length: 8 }, () => ({ top5: 0, gagnant: 0, place: 0 }));
    const paires = new Map();
    // construction = 2/3 premières courses ; contrôle = le dernier tiers (jamais utilisé pour choisir)
    const coupe = Math.floor(n * 2 / 3), build = {}, ctrl = {};
    s.courses.forEach((c, idx) => {
      const j = J.get(c.date), arr = j.arr, t5 = arr.slice(0, 5);
      const pr = profil(j);
      NS.forEach((N) => {
        if (c.liste.length < N) return;
        const G = c.liste.slice(0, N), res = jouer(G, arr, j.R);
        STRUCT.forEach((x) => {
          cumuler(T[N][x.k], res[x.k]);
          const cle = N + '|' + x.k, B = idx < coupe ? build : ctrl;
          B[cle] = B[cle] || vide(); cumuler(B[cle], res[x.k]);
          prof[pr] = prof[pr] || {}; prof[pr][cle] = prof[pr][cle] || vide(); cumuler(prof[pr][cle], res[x.k]);
        });
        const cv = couv[N];
        if (contient(G, arr.slice(0, 3))) cv.t3++; if (contient(G, arr.slice(0, 4))) cv.t4++; if (t5.length === 5 && contient(G, t5)) cv.t5++;
        cv.dans5 += t5.filter((h) => G.includes(h)).length;
      });
      // Associations : quels rangs de la sélection finissent dans les 5, et quelles paires de rangs ensemble
      const rg = c.liste.slice(0, 8).map((h, i) => (t5.includes(h) ? i : -1)).filter((i) => i >= 0);
      rg.forEach((i) => { rangs[i].top5++; });
      const i1 = c.liste.indexOf(arr[0]); if (i1 >= 0 && i1 < 8) rangs[i1].gagnant++;
      arr.slice(0, 3).forEach((h) => { const i = c.liste.indexOf(h); if (i >= 0 && i < 8) rangs[i].place++; });
      for (let a = 0; a < rg.length; a++) for (let b = a + 1; b < rg.length; b++) { const k = (rg[a] + 1) + '-' + (rg[b] + 1); paires.set(k, (paires.get(k) || 0) + 1); }
    });
    const grilles = {}; NS.forEach((N) => { grilles[N] = {}; STRUCT.forEach((x) => { grilles[N][x.k] = fin(T[N][x.k]); }); });
    // Validation : meilleure grille (N + structure) sur la construction, puis son résultat sur le contrôle
    let validation = null;
    if (n >= 6 && coupe >= 3 && n - coupe >= 2) {
      const best = Object.keys(build).map((k) => ({ k, ...fin(build[k]) })).sort((a, b) => b.net - a.net)[0];
      if (best) {
        const [N, sk] = best.k.split('|');
        validation = { construction: { du: s.courses[0].date, au: s.courses[coupe - 1].date, courses: coupe }, controle: { du: s.courses[coupe].date, au: s.courses[n - 1].date, courses: n - coupe },
          choix: { N: +N, structure: sk }, surConstruction: best, surControle: fin(ctrl[best.k] || vide()) };
      }
    }
    const profils = Object.keys(prof).map((p) => {
      const L = Object.keys(prof[p]).map((k) => ({ k, ...fin(prof[p][k]) })).sort((a, b) => b.net - a.net);
      return { profil: p, courses: L.length ? L[0].courses : 0, meilleure: L[0] || null };
    });
    sources.push({ nom: s.nom, robot: s.robot, courses: n, du: s.courses[0].date, au: s.courses[n - 1].date, grilles, couverture: couv, rangs,
      paires: [...paires.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ rangs: k, fois: v })), profils, validation });
  }
  sources.sort((a, b) => (b.robot - a.robot) || b.courses - a.courses || a.nom.localeCompare(b.nom));
  return { courses: jours.length, structures: STRUCT, ns: NS, sources };
}
