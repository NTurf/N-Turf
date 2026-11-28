// Pronos des membres : 4 chevaux maximum. Le membre choisit lui-même chaque pari, 1 € par pari :
//  - Simple : pour chaque cheval, gagnant, placé, les deux ou rien
//  - Couplé : 2 à 4 de ses chevaux (toutes les paires), en gagnant, en placé ou les deux
//  - Trio : 3 ou 4 de ses chevaux (toutes les combinaisons de 3)
//  - 2 sur 4 : 2 à 4 de ses chevaux (toutes les paires)
//  - Multi en 4 : ses 4 chevaux
//  - Report : un cheval d'une course, puis un cheval d'une course plus tard de la même réunion (table pm_reports)
//  - Courses de 7 partants ou moins : couplé ordre, trio ordre, Super 4 ordre, dans l'ordre où il a choisi ses chevaux
//    (8 puis 5 = 8-5 ; s'il a mis 5-8 et que l'arrivée est 8-5, il perd), ou « tout ordre » (toutes les permutations, plus cher)
// Chaque pari est stocké un par un (colonne paris) et vérifié après l'arrivée avec les rapports définitifs PMU.
import { BASE, cache, get } from './_pmu.js';

export const TYPES = { SG: 'Simple gagnant', SP: 'Simple placé', CG: 'Couplé gagnant', CP: 'Couplé placé', CO: 'Couplé ordre', TR: 'Trio', TO: 'Trio ordre', DQ: '2 sur 4', M4: 'Multi en 4', S4: 'Super 4 ordre', RP: 'Report' };
export const ORDRE_TYPES = ['SG', 'SP', 'CG', 'CP', 'CO', 'TR', 'TO', 'DQ', 'M4', 'S4', 'RP'];
const EN_ORDRE = ['CO', 'TO', 'S4'];
const TAILLE = { SG: 1, SP: 1, CG: 2, CP: 2, TR: 3, M4: 4 };
// anciens pronos (avant le 24/11/26 au soir) : un seul jeu
const ANCIENS = { simple: 'Simple', couple: 'Couplé placé', trio: 'Trio', multi: 'Multi en 4' };

export async function prepPm(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pm_pronos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, jour TEXT NOT NULL, reunion INTEGER NOT NULL, course INTEGER NOT NULL,
      hippo TEXT, user_id INTEGER NOT NULL, chevaux TEXT NOT NULL, jeu TEXT NOT NULL, mot TEXT,
      statut TEXT NOT NULL DEFAULT 'attente', mise REAL, gains REAL, detail TEXT,
      cree TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (jour, reunion, course, user_id))`),
    db.prepare('CREATE INDEX IF NOT EXISTS pm_jour ON pm_pronos (jour, reunion, course)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS pm_reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, prono_id INTEGER NOT NULL, user_id INTEGER NOT NULL, texte TEXT NOT NULL, cree TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare('CREATE INDEX IF NOT EXISTS pmr_prono ON pm_reactions (prono_id)'),
    // Reports : un cheval d'une 1re course (gagnant ou placé), tout ce qu'il rapporte est rejoué sur un cheval d'une course plus tard de la même réunion
    db.prepare(`CREATE TABLE IF NOT EXISTS pm_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, jour TEXT NOT NULL, reunion INTEGER NOT NULL, hippo TEXT,
      c1 INTEGER NOT NULL, n1 INTEGER NOT NULL, t1 TEXT NOT NULL, c2 INTEGER NOT NULL, n2 INTEGER NOT NULL, t2 TEXT NOT NULL,
      user_id INTEGER NOT NULL, mot TEXT, statut TEXT NOT NULL DEFAULT 'attente', mise REAL, gains REAL, detail TEXT, essai INTEGER,
      cree TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare('CREATE INDEX IF NOT EXISTS pmrep_jour ON pm_reports (jour, reunion)'),
  ]);
  for (const col of ['paris TEXT', 'essai INTEGER', 'cdj INTEGER', 'cdj_mise REAL', 'cdj_gains REAL', 'cdj_g REAL', 'cdj_p REAL']) {
    try { await db.prepare('ALTER TABLE pm_pronos ADD COLUMN ' + col).run(); } catch (e) { /* déjà là */ }
  }
  // Conversion des pronos déjà publiés (ancien format « un jeu ») en paris un par un, puis nouveau calcul
  const vieux = await db.prepare('SELECT id, chevaux, jeu FROM pm_pronos WHERE paris IS NULL LIMIT 300').all();
  const q = (vieux.results || []).map((p) => db.prepare("UPDATE pm_pronos SET paris = ?, statut = 'attente', essai = NULL WHERE id = ?").bind(JSON.stringify(convertirAncien(p)), p.id));
  if (q.length) await db.batch(q);
}

// sous-ensembles de k chevaux en gardant l'ordre du membre ; tout = toutes les permutations
function ordonnes(nums, k, tout) {
  const sous = combis(nums, k);
  if (!tout) return sous;
  const perm = (L) => L.length <= 1 ? [L] : L.flatMap((x, i) => perm(L.filter((_, j) => j !== i)).map((r) => [x, ...r]));
  return sous.flatMap(perm);
}

export const isoVersPmu = (iso) => iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4);

function combis(nums, k) {
  const out = [];
  const rec = (deb, cur) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = deb; i < nums.length; i++) { cur.push(nums[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

// ancien format : chevaux [{n,b}] + jeu → mêmes paris qu'avant, écrits un par un
export function convertirAncien(p) {
  const ch = JSON.parse(p.chevaux || '[]');
  if (p.jeu === 'simple') {
    const cibles = ch.some((x) => x.b) ? ch.filter((x) => x.b) : ch.slice(0, 1);
    return cibles.flatMap((x) => [{ t: 'SG', c: [x.n] }, { t: 'SP', c: [x.n] }]);
  }
  const t = { couple: 'CP', trio: 'TR', multi: 'M4' }[p.jeu];
  if (!t) return [];
  const k = TAILLE[t], bases = ch.filter((x) => x.b).map((x) => x.n);
  let L = combis(ch.map((x) => x.n), k);
  if (bases.length) L = bases.length <= k ? L.filter((c) => bases.every((b) => c.includes(b))) : L.filter((c) => c.every((n) => bases.includes(n)));
  return L.map((c) => ({ t, c }));
}

// choix du membre → liste des paris. Renvoie { paris } ou { erreur }
// choix = { s: [{n, g, p}], c: {ch:[..], g, p, to}, t: {ch:[..], to}, m: 0|1, mto: 0|1 }
// chevaux = dans l'ordre choisi par le membre ; petit = course de 7 partants ou moins (paris en ordre)
export function construire(choix, chevaux, petit) {
  const mes = new Set(chevaux);
  const paris = [];
  const s = Array.isArray(choix && choix.s) ? choix.s : [];
  for (const x of s) {
    const n = +x.n; if (!mes.has(n)) continue;
    if (x.g) paris.push({ t: 'SG', c: [n] });
    if (x.p) paris.push({ t: 'SP', c: [n] });
  }
  // chevaux cochés, rangés dans l'ordre du membre (pour les paris en ordre) ou par numéro
  const pris = (L) => { const v = new Set((Array.isArray(L) ? L : []).map(Number)); const o = chevaux.filter((n) => v.has(n)); return petit ? o : o.sort((a, b) => a - b); };
  const c = (choix && choix.c) || {};
  const cch = pris(c.ch);
  if (petit) {
    if (cch.length === 1) return { erreur: 'Pour le couplé ordre, choisis au moins 2 de tes chevaux.' };
    for (const paire of ordonnes(cch, 2, c.to)) paris.push({ t: 'CO', c: paire });
  } else if (c.g || c.p) {
    if (cch.length < 2) return { erreur: 'Pour le couplé, choisis au moins 2 de tes chevaux.' };
    for (const paire of combis(cch, 2)) { if (c.g) paris.push({ t: 'CG', c: paire }); if (c.p) paris.push({ t: 'CP', c: paire }); }
  }
  const t = (choix && choix.t) || {};
  const tch = pris(t.ch);
  if (tch.length) {
    if (tch.length < 3) return { erreur: `Pour le trio${petit ? ' ordre' : ''}, choisis 3 ou 4 de tes chevaux.` };
    for (const tr of (petit ? ordonnes(tch, 3, t.to) : combis(tch, 3))) paris.push({ t: petit ? 'TO' : 'TR', c: tr });
  }
  // 2 sur 4 : toutes les paires des chevaux cochés (2 à 4), 1 € la paire (le PMU la vend 3 €, rapport donné pour 1 €)
  const d = (choix && choix.d) || {};
  const dch = pris(d.ch);
  if (dch.length && !petit) {
    if (dch.length < 2) return { erreur: 'Pour le 2 sur 4, choisis au moins 2 de tes chevaux.' };
    for (const paire of combis(dch, 2)) paris.push({ t: 'DQ', c: paire });
  }
  if (choix && choix.m) {
    if (chevaux.length !== 4) return { erreur: `Le ${petit ? 'Super 4 ordre' : 'Multi en 4'} se joue avec tes 4 chevaux.` };
    if (petit) for (const o of ordonnes(chevaux, 4, choix.mto)) paris.push({ t: 'S4', c: o });
    else paris.push({ t: 'M4', c: [...chevaux].sort((a, b) => a - b) });
  }
  if (!paris.length) return { erreur: 'Choisis au moins un pari (simple, couplé, trio, 2 sur 4 ou multi).' };
  return { paris };
}

// paris → choix (pour reprendre un prono dans le formulaire)
export function choixDepuisParis(paris, chevaux) {
  const s = chevaux.map((n) => ({ n, g: paris.some((p) => p.t === 'SG' && p.c[0] === n) ? 1 : 0, p: paris.some((p) => p.t === 'SP' && p.c[0] === n) ? 1 : 0 }));
  const dans = (ts) => [...new Set(paris.filter((p) => ts.includes(p.t)).flatMap((p) => p.c))].sort((a, b) => a - b);
  // « tout ordre » : la même combinaison existe dans un autre ordre
  const tout = (t) => { const L = paris.filter((p) => p.t === t).map((p) => p.c.join('-')); const v = new Set(L); return paris.some((p) => p.t === t && v.has([...p.c].reverse().join('-')) && p.c.length > 1) ? 1 : 0; };
  return {
    s, c: { ch: dans(['CG', 'CP', 'CO']), g: paris.some((p) => p.t === 'CG') ? 1 : 0, p: paris.some((p) => p.t === 'CP') ? 1 : 0, to: tout('CO') },
    t: { ch: dans(['TR', 'TO']), to: tout('TO') }, d: { ch: dans(['DQ']) }, m: paris.some((p) => p.t === 'M4' || p.t === 'S4') ? 1 : 0, mto: paris.filter((p) => p.t === 'S4').length > 1 ? 1 : 0,
  };
}

// Résumé court du jeu, ex. « Simple G+P · Couplé G · Trio »
export function resume(paris, jeu) {
  if (!Array.isArray(paris)) return ANCIENS[jeu] || '';
  const a = (t) => paris.some((p) => p.t === t);
  const L = [];
  if (a('SG') || a('SP')) L.push('Simple ' + [a('SG') ? 'G' : '', a('SP') ? 'P' : ''].filter(Boolean).join('+'));
  if (a('CG') || a('CP')) L.push('Couplé ' + [a('CG') ? 'G' : '', a('CP') ? 'P' : ''].filter(Boolean).join('+'));
  if (a('CO')) L.push('Couplé ordre');
  if (a('TR')) L.push('Trio');
  if (a('TO')) L.push('Trio ordre');
  if (a('DQ')) L.push('2 sur 4');
  if (a('M4')) L.push('Multi en 4');
  if (a('S4')) L.push('Super 4 ordre');
  return L.join(' · ');
}

function blocs(raw, re) {
  const L = (Array.isArray(raw) ? raw : []).filter((b) => b && re.test(b.typePari || '') && !b.rembourse);
  return L.find((b) => b.audience === 'NATIONAL') || L[0] || null;
}
const memes = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const exact = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
function rapport(bloc, combo, ordre) {
  if (!bloc) return 0;
  for (const r of bloc.rapports || []) {
    const c = String(r.combinaison || '').split(/[-\s]+/).map(Number).filter(Boolean);
    if (c.length && (ordre ? exact(c, combo) : memes(c, combo))) return (Number(r.dividendePourUnEuro) || 0) / 100;
  }
  return 0;
}

// Résultat d'un prono avec les rapports définitifs : 1 € par pari.
// detail = [{t, c, r}] : r = rapport pour 1 € (0 = perdu), np = remboursé (non-partant)
export function evaluer(paris, raw, np, arrivee) {
  const B = {
    SG: blocs(raw, /^SIMPLE_GAGNANT$/), SP: blocs(raw, /^SIMPLE_PLACE$/), CG: blocs(raw, /^COUPLE_GAGNANT$/),
    CP: blocs(raw, /^COUPLE_PLACE$/), TR: blocs(raw, /^TRIO$/), M4: blocs(raw, /^MULTI$|^E_MULTI$/),
    CO: blocs(raw, /^COUPLE_ORDRE$/), TO: blocs(raw, /^TRIO_ORDRE$/), S4: blocs(raw, /^SUPER_QUATRE$/), DQ: blocs(raw, /^DEUX_SUR_QUATRE$|^E_DEUX_SUR_QUATRE$/),
  };
  // Multi en 4 : le PMU ne donne pas de combinaison, on compare aux 4 premiers de l'arrivée
  const m4 = B.M4 ? ((B.M4.rapports || []).find((r) => /en\s*4$/i.test(String(r.libelle || '').trim())) || null) : null;
  const top4 = (arrivee || []).slice(0, 4);
  const out = { mise: 0, gains: 0, detail: [] };
  for (const p of paris) {
    if (p.c.some((n) => np.includes(n))) { out.detail.push({ t: p.t, c: p.c, r: 0, np: 1 }); continue; }
    out.mise += 1;
    // 2 sur 4 : gagnant si les 2 chevaux sont dans les 4 premiers ; rapport de la paire si le PMU la détaille, sinon le rapport unique
    const r = p.t === 'DQ' ? (top4.length >= 4 && p.c.every((n) => top4.includes(n)) ? (rapport(B.DQ, p.c, false) || (B.DQ && B.DQ.rapports && B.DQ.rapports[0] ? (Number(B.DQ.rapports[0].dividendePourUnEuro) || 0) / 100 : 0)) : 0) : p.t === 'M4' ? (m4 && top4.length === 4 && memes(p.c, top4) ? (Number(m4.dividendePourUnEuro) || 0) / 100 : 0) : rapport(B[p.t], p.c, EN_ORDRE.includes(p.t));
    out.gains += r;
    out.detail.push({ t: p.t, c: p.c, r: Math.round(r * 100) / 100 });
  }
  out.gains = Math.round(out.gains * 100) / 100;
  return out;
}

// ---------- Reports ----------
// Une jambe du report : le cheval est-il non partant, la course a-t-elle ses rapports définitifs, et que rapporte 1 € (gagnant ou placé)
async function jambe(db, jour, R, C, n, t) {
  const d = isoVersPmu(jour);
  const parts = await cache(db, `part-${d}-R${R}C${C}`, 600, () => get(`${BASE}/${d}/R${R}/C${C}/participants`));
  const h = ((parts && parts.participants) || []).find((x) => x.numPmu === n);
  if (h && h.statut === 'NON_PARTANT') return { np: true, fini: true, r: 0 };
  let raw = null; try { raw = await cache(db, `rapraw-${d}-R${R}C${C}`, 120, () => get(`${BASE}/${d}/R${R}/C${C}/rapports-definitifs`)); } catch (e) { raw = null; }
  if (!Array.isArray(raw) || !raw.length) return { fini: false };
  const b = t === 'P' ? blocs(raw, /^SIMPLE_PLACE$/) : blocs(raw, /^SIMPLE_GAGNANT$/);
  return { fini: true, r: rapport(b, [n], false) };
}
// Calcul d'un report : 1 € sur le 1er cheval ; s'il rapporte, tout est rejoué sur le 2e.
// 1er cheval non partant : remboursé. 2e cheval non partant : on garde ce qu'a rapporté le 1er.
export async function calculerReport(db, x) {
  const a = await jambe(db, x.jour, x.reunion, x.c1, x.n1, x.t1);
  if (a.np) return { mise: 0, gains: 0, detail: [{ t: 'RP', c: [x.n1, x.n2], r: 0, np: 1 }] };
  if (!a.fini) return null;
  if (!a.r) return { mise: 1, gains: 0, detail: [{ t: 'RP', c: [x.n1, x.n2], r: 0, r1: 0 }] };
  const b = await jambe(db, x.jour, x.reunion, x.c2, x.n2, x.t2);
  if (b.np) return { mise: 1, gains: a.r, detail: [{ t: 'RP', c: [x.n1, x.n2], r: a.r, r1: a.r, np2: 1 }] };
  if (!b.fini) return null;
  const g = Math.round(a.r * b.r * 100) / 100;
  return { mise: 1, gains: g, detail: [{ t: 'RP', c: [x.n1, x.n2], r: g, r1: a.r, r2: b.r }] };
}
export async function verifierReports(db, max = 6) {
  const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }), now = Date.now();
  const r = await db.prepare("SELECT * FROM pm_reports WHERE statut = 'attente' AND jour <= ? AND COALESCE(essai, 0) < ? ORDER BY COALESCE(essai, 0), id LIMIT ?").bind(auj, now - 120000, max).all();
  for (const x of r.results || []) {
    await db.prepare('UPDATE pm_reports SET essai = ? WHERE id = ?').bind(now, x.id).run();
    try { const e = await calculerReport(db, x); if (e) await db.prepare("UPDATE pm_reports SET statut = 'calcule', mise = ?, gains = ?, detail = ? WHERE id = ?").bind(e.mise, e.gains, JSON.stringify(e.detail), x.id).run(); } catch (e) { /* on réessaiera */ }
  }
}

// Infos PMU d'une course (heure, partants, arrivée) et calcul des pronos dès que les rapports définitifs sont là
export async function coursePm(db, jour, R, C) {
  const d = isoVersPmu(jour);
  const prog = await cache(db, 'prog-' + d, 600, () => get(`${BASE}/${d}`));
  const reu = ((prog && prog.programme && prog.programme.reunions) || []).find((r) => r.numOfficiel === R);
  const c = reu && (reu.courses || []).find((x) => x.numOrdre === C);
  if (!c) return null;
  const parts = await cache(db, `part-${d}-R${R}C${C}`, 600, () => get(`${BASE}/${d}/R${R}/C${C}/participants`));
  const partants = ((parts && parts.participants) || []).map((p) => ({ n: p.numPmu, nom: p.nom, musique: p.musique || '', np: p.statut === 'NON_PARTANT' })).sort((a, b) => a.n - b.n);
  const arrivee = Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [];
  const info = { hippo: (reu.hippodrome && (reu.hippodrome.libelleCourt || reu.hippodrome.libelleLong)) || 'R' + R, libelle: c.libelle || '', heure: c.heureDepart || null, discipline: c.discipline || '', specialite: c.specialite || '', distance: c.distance || null, allocation: c.montantPrix || null, corde: c.corde || '', conditions: c.conditions || '', partants, arrivee, definitive: false };
  if (arrivee.length) {
    const attente = await db.prepare("SELECT id, paris FROM pm_pronos WHERE jour = ? AND reunion = ? AND course = ? AND statut = 'attente'").bind(jour, R, C).all();
    let raw = null;
    try { raw = await cache(db, `rapraw-${d}-R${R}C${C}`, 120, () => get(`${BASE}/${d}/R${R}/C${C}/rapports-definitifs`)); } catch (e) { raw = null; }
    if (Array.isArray(raw) && raw.length) {
      info.definitive = true;
      const np = partants.filter((p) => p.np).map((p) => p.n);
      const q = (attente.results || []).map((p) => { const e = evaluer(JSON.parse(p.paris || '[]'), raw, np, arrivee); return db.prepare("UPDATE pm_pronos SET statut = 'calcule', mise = ?, gains = ?, detail = ? WHERE id = ?").bind(e.mise, e.gains, JSON.stringify(e.detail), p.id); });
      if (q.length) await db.batch(q);
      // Cheval du jour : 1 € gagnant + 1 € placé (non partant : remboursé), comme le cheval du jour de Bruno
      const cd = await db.prepare("SELECT id, cdj FROM pm_pronos WHERE jour = ? AND reunion = ? AND course = ? AND cdj IS NOT NULL AND cdj_mise IS NULL").bind(jour, R, C).all();
      const q2 = (cd.results || []).map((p) => { const e = evalCdj(raw, np, p.cdj); return db.prepare('UPDATE pm_pronos SET cdj_mise = ?, cdj_gains = ?, cdj_g = ?, cdj_p = ? WHERE id = ?').bind(e.mise, e.gains, e.g, e.p, p.id); });
      if (q2.length) await db.batch(q2);
    }
  }
  return info;
}
async function coursePmCdj(db, jour, R, C) {
  const d = isoVersPmu(jour);
  const parts = await cache(db, `part-${d}-R${R}C${C}`, 600, () => get(`${BASE}/${d}/R${R}/C${C}/participants`));
  const np = ((parts && parts.participants) || []).filter((p) => p.statut === 'NON_PARTANT').map((p) => p.numPmu);
  let raw = null; try { raw = await cache(db, `rapraw-${d}-R${R}C${C}`, 120, () => get(`${BASE}/${d}/R${R}/C${C}/rapports-definitifs`)); } catch (e) { raw = null; }
  if (!Array.isArray(raw) || !raw.length) return;
  const cd = await db.prepare('SELECT id, cdj FROM pm_pronos WHERE jour = ? AND reunion = ? AND course = ? AND cdj IS NOT NULL AND cdj_mise IS NULL').bind(jour, R, C).all();
  const q = (cd.results || []).map((p) => { const e = evalCdj(raw, np, p.cdj); return db.prepare('UPDATE pm_pronos SET cdj_mise = ?, cdj_gains = ?, cdj_g = ?, cdj_p = ? WHERE id = ?').bind(e.mise, e.gains, e.g, e.p, p.id); });
  if (q.length) await db.batch(q);
}
export function evalCdj(raw, np, n) {
  if (np.includes(n)) return { mise: 0, gains: 0, g: 0, p: 0 };
  const g = rapport(blocs(raw, /^SIMPLE_GAGNANT$/), [n], false), pl = rapport(blocs(raw, /^SIMPLE_PLACE$/), [n], false);
  return { mise: 2, gains: Math.round((g + pl) * 100) / 100, g, p: pl };
}

// Vérifie les pronos en attente sans attendre qu'un membre ouvre la course (quelques courses à chaque appel)
export async function verifierEnAttente(db, max = 6) {
  const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const now = Date.now();
  const r = await db.prepare(`SELECT jour, reunion, course, MIN(COALESCE(essai, 0)) AS e FROM pm_pronos WHERE statut = 'attente' AND jour <= ?
    GROUP BY jour, reunion, course HAVING e < ? ORDER BY e, jour LIMIT ?`).bind(auj, now - 120000, max).all();
  for (const x of r.results || []) {
    await db.prepare("UPDATE pm_pronos SET essai = ? WHERE jour = ? AND reunion = ? AND course = ? AND statut = 'attente'").bind(now, x.jour, x.reunion, x.course).run();
    try { await coursePm(db, x.jour, x.reunion, x.course); } catch (e) { /* on réessaiera */ }
  }
  try { await verifierReports(db); } catch (e) { /* on réessaiera */ }
  try {
    const z = await db.prepare("SELECT DISTINCT jour, reunion, course FROM pm_pronos WHERE statut = 'calcule' AND cdj IS NOT NULL AND cdj_mise IS NULL AND jour <= ? LIMIT 4").bind(auj).all();
    for (const x of z.results || []) await coursePmCdj(db, x.jour, x.reunion, x.course);
  } catch (e) { /* on réessaiera */ }
}
