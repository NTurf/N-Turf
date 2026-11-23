// Concours Quinté+ N-TURF : règles validées par Bruno le 23/11/2026
// Monnaie : fers à cheval. Gain = rapport PMU pour 1 € × mise d'une combinaison.
import { BASE, cache, get, preparer } from './_pmu.js';

export const MISE = { sgp: 40, couple: 12, tierce: 10, quarte: 22.5, multi: 45, quinte: 42 };
export const MISE_JOUR = 171.5;
const r2 = (x) => Math.round(x * 100) / 100;

export const parisJour = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }); // AAAA-MM-JJ
export const isoVersPmu = (iso) => iso.split('-').reverse().join('');
export const isoVersFr = (iso) => iso.split('-').reverse().join('/');

export async function initConcours(db) {
  await preparer(db);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS concours_jours (
      date TEXT PRIMARY KEY, reunion INTEGER, course INTEGER, hippodrome TEXT, libelle TEXT, heure INTEGER,
      partants TEXT, arrivee TEXT, rapports TEXT, statut TEXT NOT NULL DEFAULT 'ouvert', maj TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS concours_pronos (
      date TEXT NOT NULL, user_id INTEGER NOT NULL, chevaux TEXT NOT NULL, saisi TEXT NOT NULL,
      retenu TEXT, gains REAL, detail TEXT, PRIMARY KEY (date, user_id))`),
  ]);
}

// ---------- Lecture des rapports PMU ----------
const n = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const val = (r) => (Number(r && r.dividendePourUnEuro) || 0) / 100;
const nums = (c) => String(c || '').split(/[^0-9]+/).filter(Boolean).map(Number);

export function lireRapportsConcours(blocs) {
  const R = { g: {}, p: {}, cg: {}, cp: {}, t: {}, qa: {}, qi: {}, m4: 0 };
  if (!Array.isArray(blocs)) return R;
  const pris = new Map();
  for (const b of blocs) {
    if (!b || !b.typePari) continue;
    const cur = pris.get(b.typePari);
    if (!cur || (cur.audience !== 'NATIONAL' && b.audience === 'NATIONAL')) pris.set(b.typePari, b);
  }
  const each = (k, f) => { const b = pris.get(k); if (b && !b.rembourse) (b.rapports || []).forEach((r) => { if (!String(r.combinaison || '').includes('NP')) f(r); }); };
  each('SIMPLE_GAGNANT', (r) => { const c = nums(r.combinaison)[0]; if (c) R.g[c] = val(r); });
  each('SIMPLE_PLACE', (r) => { const c = nums(r.combinaison)[0]; if (c) R.p[c] = val(r); });
  each('COUPLE_GAGNANT', (r) => { const c = nums(r.combinaison); if (c.length === 2) R.cg[c.sort((a, b) => a - b).join('-')] = val(r); });
  each('COUPLE_PLACE', (r) => { const c = nums(r.combinaison); if (c.length === 2) R.cp[c.sort((a, b) => a - b).join('-')] = val(r); });
  const ordreDes = (k, o) => each(k, (r) => {
    // Le PMU écrit « Quinté+ ordre », « Quarté+ désordre », « Bonus 4sur5 », « Bonus 3 », « Bonus »…
    const l = n(r.libelle), v = val(r);
    if (l.includes('bonus4sur5')) o.b45 = Math.max(o.b45 || 0, v);
    else if (l.includes('bonus4')) o.b4 = v;
    else if (l.includes('bonus3') || l.endsWith('bonus')) o.b3 = v;
    else if (l.endsWith('desordre')) o.d = v;
    else if (l.endsWith('ordre')) o.o = v;
  });
  ordreDes('TIERCE', R.t); ordreDes('QUARTE_PLUS', R.qa); ordreDes('QUINTE_PLUS', R.qi);
  each('MULTI', (r) => { if (/en4$/.test(n(r.libelle)) || n(r.libelle) === 'multien4') R.m4 = val(r); });
  return R;
}

// ---------- Non-partants : le complément remplace le 1er non-partant ----------
export function pronoRetenu(ch, np) {
  const NP = new Set(np || []);
  const p = ch.slice(0, 7), comp = ch[7];
  const i = p.findIndex((x) => NP.has(x));
  if (i < 0) return p;
  const out = [];
  p.forEach((x, k) => { if (k === i) { if (!NP.has(comp)) out.push(comp); } else if (!NP.has(x)) out.push(x); });
  return out;
}

function combis(a, k) {
  const out = [];
  (function rec(s, acc) { if (acc.length === k) { out.push(acc); return; } for (let i = s; i < a.length; i++) rec(i + 1, acc.concat(a[i])); })(0, []);
  return out;
}
// Ordre : les chevaux arrivés sont dans le même ordre que dans le classement du joueur
const dansLOrdre = (liste, top) => top.every((h, i) => i === 0 || liste.indexOf(top[i - 1]) < liste.indexOf(h));

// ---------- Calcul des gains d'un pronostic ----------
export function calculer(liste, arr, R) {
  const L = [], add = (pari, type, fers) => { if (fers > 0) L.push({ pari, type, fers: r2(fers) }); };
  const top = (k) => arr.slice(0, k);
  // SGP : chevaux 1 et 2, 4 fers gagnant + 16 fers placé chacun
  liste.slice(0, 2).forEach((h) => {
    if (arr[0] === h && R.g[h]) add('Simple', 'Gagnant du ' + h, R.g[h] * 4);
    if (R.p[h]) add('Simple', 'Placé du ' + h, R.p[h] * 16);
  });
  // Couplé : chevaux 1 à 3 (3 paires), 2 fers gagnant + 2 fers placé par paire
  combis(liste.slice(0, 3), 2).forEach((c) => {
    const k = c.slice().sort((a, b) => a - b).join('-');
    if (R.cg[k]) add('Couplé', 'Gagnant ' + k, R.cg[k] * 2);
    if (R.cp[k]) add('Couplé', 'Placé ' + k, R.cp[k] * 2);
  });
  const odr = (nom, sel, k, mise, o) => {
    const t = top(k);
    combis(sel, k).forEach((c) => {
      if (t.length === k && t.every((h) => c.includes(h))) {
        if (dansLOrdre(liste, t) && o.o) add(nom, 'Ordre', o.o * mise);
        else add(nom, 'Désordre', (o.d || 0) * mise);
      }
    });
  };
  // Tiercé : chevaux 1 à 5 combiné, 1 fer la combinaison
  odr('Tiercé', liste.slice(0, 5), 3, 1, R.t);
  // Quarté+ : chevaux 1 à 6 combiné, 1,50 fer la combinaison, + bonus 3
  const s6 = liste.slice(0, 6);
  odr('Quarté+', s6, 4, 1.5, R.qa);
  if (R.qa.b3 && arr.length >= 4) combis(s6, 4).forEach((c) => {
    if (top(3).every((h) => c.includes(h)) && !c.includes(arr[3])) add('Quarté+', 'Bonus 3', R.qa.b3 * 1.5);
  });
  // Multi en 4 : chevaux 1 à 6, 3 fers la combinaison
  if (R.m4 && arr.length >= 4) combis(s6, 4).forEach((c) => { if (top(4).every((h) => c.includes(h))) add('Multi en 4', 'Multi en 4', R.m4 * 3); });
  // Quinté+ : chevaux 1 à 7 combiné, 2 fers la combinaison, + bonus 4, 4 sur 5, 3
  odr('Quinté+', liste.slice(0, 7), 5, 2, R.qi);
  if (arr.length >= 5) combis(liste.slice(0, 7), 5).forEach((c) => {
    const k5 = top(5).filter((h) => c.includes(h)).length;
    if (k5 === 4) {
      if (top(4).every((h) => c.includes(h))) { if (R.qi.b4) add('Quinté+', 'Bonus 4', R.qi.b4 * 2); }
      else if (R.qi.b45) add('Quinté+', 'Bonus 4 sur 5', R.qi.b45 * 2);
    } else if (k5 === 3 && top(3).every((h) => c.includes(h)) && R.qi.b3) add('Quinté+', 'Bonus 3', R.qi.b3 * 2);
  });
  // Regroupe les lignes identiques (ex. plusieurs bonus 3)
  const g = [];
  L.forEach((x) => { const y = g.find((z) => z.pari === x.pari && z.type === x.type); if (y) { y.fers = r2(y.fers + x.fers); y.nb++; } else g.push({ ...x, nb: 1 }); });
  return { gains: r2(g.reduce((s, x) => s + x.fers, 0)), detail: g };
}

// ---------- Le Quinté+ du jour d'après le PMU ----------
export async function courseDuJour(db, iso) {
  const ligne = await db.prepare('SELECT * FROM concours_jours WHERE date = ?').bind(iso).first();
  if (ligne && ligne.statut === 'calcule') return ligne;
  const d = isoVersPmu(iso);
  const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
  for (const r of (prog && prog.programme && prog.programme.reunions) || []) {
    for (const c of r.courses || []) {
      if (!(c.paris || []).some((p) => p.codePari === 'QUINTE_PLUS')) continue;
      const parts = await cache(db, `part-${d}-R${r.numOfficiel}C${c.numOrdre}`, 600, () => get(`${BASE}/${d}/R${r.numOfficiel}/C${c.numOrdre}/participants`));
      const partants = ((parts && parts.participants) || []).map((p) => ({ n: p.numPmu, nom: p.nom, np: p.statut === 'NON_PARTANT' })).sort((a, b) => a.n - b.n);
      const arrivee = Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [];
      const hippo = (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || '';
      await db.prepare(`INSERT INTO concours_jours (date, reunion, course, hippodrome, libelle, heure, partants, arrivee, maj) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(date) DO UPDATE SET reunion=excluded.reunion, course=excluded.course, hippodrome=excluded.hippodrome, libelle=excluded.libelle,
        heure=excluded.heure, partants=excluded.partants, arrivee=excluded.arrivee, maj=excluded.maj`)
        .bind(iso, r.numOfficiel, c.numOrdre, hippo, c.libelle || '', c.heureDepart || null, JSON.stringify(partants), JSON.stringify(arrivee)).run();
      return await db.prepare('SELECT * FROM concours_jours WHERE date = ?').bind(iso).first();
    }
  }
  return ligne || null;
}

// Calcule tous les pronostics du jour dès que les rapports définitifs sont publiés
export async function calculerSiPret(db, iso) {
  let j;
  try { j = await courseDuJour(db, iso); } catch (e) { return null; }
  if (!j || j.statut === 'calcule') return j;
  const arr = JSON.parse(j.arrivee || '[]');
  if (arr.length < 5) return j;
  const d = isoVersPmu(iso);
  const blocs = await cache(db, `rap-${d}-R${j.reunion}C${j.course}`, 60, () => get(`${BASE}/${d}/R${j.reunion}/C${j.course}/rapports-definitifs`));
  const R = lireRapportsConcours(blocs);
  if (!R.qi.d && !R.qi.o) return j; // rapports pas encore définitifs
  const np = JSON.parse(j.partants || '[]').filter((p) => p.np).map((p) => p.n);
  const pr = await db.prepare('SELECT user_id, chevaux FROM concours_pronos WHERE date = ?').bind(iso).all();
  const maj = [];
  for (const p of pr.results || []) {
    const ret = pronoRetenu(JSON.parse(p.chevaux), np);
    const c = calculer(ret, arr, R);
    maj.push(db.prepare('UPDATE concours_pronos SET retenu = ?, gains = ?, detail = ? WHERE date = ? AND user_id = ?')
      .bind(JSON.stringify(ret), c.gains, JSON.stringify(c.detail), iso, p.user_id));
  }
  maj.push(db.prepare("UPDATE concours_jours SET rapports = ?, statut = 'calcule', maj = datetime('now') WHERE date = ?").bind(JSON.stringify(R), iso));
  await db.batch(maj);
  try { await db.prepare("DELETE FROM pmu_cache WHERE cle = 'bandeau'").run(); } catch (e) {}
  return await db.prepare('SELECT * FROM concours_jours WHERE date = ?').bind(iso).first();
}

// ---------- Classements : gains moins mises ----------
// À partir de son premier pronostic (du mois pour le Globe), 171,50 fers retirés chaque jour de Quinté+ calculé, joué ou non.
function ajoute(iso, k) { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); }
export function bornesSemaine(iso) { const t = new Date(iso + 'T12:00:00Z'); const j = (t.getUTCDay() + 6) % 7; return [ajoute(iso, -j), ajoute(iso, 6 - j)]; }
export function bornesMois(iso) { const [a, m] = iso.split('-').map(Number); const fin = new Date(Date.UTC(a, m, 0)).getUTCDate(); return [`${a}-${String(m).padStart(2, '0')}-01`, `${a}-${String(m).padStart(2, '0')}-${String(fin).padStart(2, '0')}`]; }

export async function classement(db, du, au, depuisDebutPeriode) {
  const jours = ((await db.prepare("SELECT date FROM concours_jours WHERE statut = 'calcule' AND date BETWEEN ? AND ? ORDER BY date").bind(du, au).all()).results || []).map((x) => x.date);
  const rows = (await db.prepare(`SELECT p.user_id, u.pseudo, p.date, p.gains FROM concours_pronos p JOIN users u ON u.id = p.user_id
    WHERE p.date BETWEEN ? AND ?`).bind(depuisDebutPeriode ? du : '0000', au).all()).results || [];
  const premiers = new Map();
  const tous = (await db.prepare('SELECT user_id, MIN(date) AS d FROM concours_pronos GROUP BY user_id').all()).results || [];
  tous.forEach((x) => premiers.set(x.user_id, x.d));
  const J = new Map();
  for (const r of rows) {
    if (r.date < du) continue;
    let x = J.get(r.user_id);
    if (!x) { x = { id: r.user_id, pseudo: r.pseudo, gains: 0, joues: 0 }; J.set(r.user_id, x); }
    if (jours.includes(r.date)) { x.gains += r.gains || 0; x.joues++; }
  }
  const out = [];
  for (const x of J.values()) {
    // premier pronostic : dans la période pour le Globe (mois), depuis toujours pour la semaine
    const debut = depuisDebutPeriode
      ? (rows.filter((r) => r.user_id === x.id && r.date >= du).map((r) => r.date).sort()[0] || du)
      : (premiers.get(x.id) || du);
    const compte = jours.filter((d) => d >= debut).length;
    if (!compte) continue;
    const mises = r2(compte * MISE_JOUR);
    out.push({ pseudo: x.pseudo, id: x.id, joues: x.joues, jours: compte, mises, gains: r2(x.gains), net: r2(x.gains - mises) });
  }
  out.sort((a, b) => b.net - a.net || b.gains - a.gains || a.pseudo.localeCompare(b.pseudo));
  return { jours, liste: out };
}

export async function classementJour(db, iso) {
  const rows = (await db.prepare(`SELECT u.id, u.pseudo, p.gains FROM concours_pronos p JOIN users u ON u.id = p.user_id WHERE p.date = ?`).bind(iso).all()).results || [];
  return rows.map((r) => ({ id: r.id, pseudo: r.pseudo, joues: 1, jours: 1, mises: MISE_JOUR, gains: r2(r.gains || 0), net: r2((r.gains || 0) - MISE_JOUR) }))
    .sort((a, b) => b.net - a.net || a.pseudo.localeCompare(b.pseudo));
}

export async function dernierJourCalcule(db) {
  const r = await db.prepare("SELECT date FROM concours_jours WHERE statut = 'calcule' ORDER BY date DESC LIMIT 1").first();
  return r ? r.date : null;
}
