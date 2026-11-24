// Pronos des membres : 4 chevaux maximum. Le membre choisit lui-même chaque pari, 1 € par pari :
//  - Simple : pour chaque cheval, gagnant, placé, les deux ou rien
//  - Couplé : 2 à 4 de ses chevaux (toutes les paires), en gagnant, en placé ou les deux
//  - Trio : 3 ou 4 de ses chevaux (toutes les combinaisons de 3)
//  - Multi en 4 : ses 4 chevaux
// Chaque pari est stocké un par un (colonne paris) et vérifié après l'arrivée avec les rapports définitifs PMU.
import { BASE, cache, get } from './_pmu.js';

export const TYPES = { SG: 'Simple gagnant', SP: 'Simple placé', CG: 'Couplé gagnant', CP: 'Couplé placé', TR: 'Trio', M4: 'Multi en 4' };
export const ORDRE_TYPES = ['SG', 'SP', 'CG', 'CP', 'TR', 'M4'];
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
  ]);
  for (const col of ['paris TEXT', 'essai INTEGER']) {
    try { await db.prepare('ALTER TABLE pm_pronos ADD COLUMN ' + col).run(); } catch (e) { /* déjà là */ }
  }
  // Conversion des pronos déjà publiés (ancien format « un jeu ») en paris un par un, puis nouveau calcul
  const vieux = await db.prepare('SELECT id, chevaux, jeu FROM pm_pronos WHERE paris IS NULL LIMIT 300').all();
  const q = (vieux.results || []).map((p) => db.prepare("UPDATE pm_pronos SET paris = ?, statut = 'attente', essai = NULL WHERE id = ?").bind(JSON.stringify(convertirAncien(p)), p.id));
  if (q.length) await db.batch(q);
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
// choix = { s: [{n, g, p}], c: {ch:[..], g, p}, t: {ch:[..]}, m: 0|1 }
export function construire(choix, chevaux) {
  const mes = new Set(chevaux);
  const paris = [];
  const s = Array.isArray(choix && choix.s) ? choix.s : [];
  for (const x of s) {
    const n = +x.n; if (!mes.has(n)) continue;
    if (x.g) paris.push({ t: 'SG', c: [n] });
    if (x.p) paris.push({ t: 'SP', c: [n] });
  }
  const pris = (L) => [...new Set((Array.isArray(L) ? L : []).map(Number).filter((n) => mes.has(n)))].sort((a, b) => a - b);
  const c = (choix && choix.c) || {};
  if (c.g || c.p) {
    const ch = pris(c.ch);
    if (ch.length < 2) return { erreur: 'Pour le couplé, choisis au moins 2 de tes chevaux.' };
    for (const paire of combis(ch, 2)) { if (c.g) paris.push({ t: 'CG', c: paire }); if (c.p) paris.push({ t: 'CP', c: paire }); }
  }
  const t = (choix && choix.t) || {};
  const tch = pris(t.ch);
  if (tch.length) {
    if (tch.length < 3) return { erreur: 'Pour le trio, choisis 3 ou 4 de tes chevaux.' };
    for (const tr of combis(tch, 3)) paris.push({ t: 'TR', c: tr });
  }
  if (choix && choix.m) {
    if (chevaux.length !== 4) return { erreur: 'Le Multi en 4 se joue avec tes 4 chevaux.' };
    paris.push({ t: 'M4', c: [...chevaux].sort((a, b) => a - b) });
  }
  if (!paris.length) return { erreur: 'Choisis au moins un pari (simple, couplé, trio ou multi).' };
  return { paris };
}

// paris → choix (pour reprendre un prono dans le formulaire)
export function choixDepuisParis(paris, chevaux) {
  const s = chevaux.map((n) => ({ n, g: paris.some((p) => p.t === 'SG' && p.c[0] === n) ? 1 : 0, p: paris.some((p) => p.t === 'SP' && p.c[0] === n) ? 1 : 0 }));
  const dans = (ts) => [...new Set(paris.filter((p) => ts.includes(p.t)).flatMap((p) => p.c))].sort((a, b) => a - b);
  return { s, c: { ch: dans(['CG', 'CP']), g: paris.some((p) => p.t === 'CG') ? 1 : 0, p: paris.some((p) => p.t === 'CP') ? 1 : 0 }, t: { ch: dans(['TR']) }, m: paris.some((p) => p.t === 'M4') ? 1 : 0 };
}

// Résumé court du jeu, ex. « Simple G+P · Couplé G · Trio »
export function resume(paris, jeu) {
  if (!Array.isArray(paris)) return ANCIENS[jeu] || '';
  const a = (t) => paris.some((p) => p.t === t);
  const L = [];
  if (a('SG') || a('SP')) L.push('Simple ' + [a('SG') ? 'G' : '', a('SP') ? 'P' : ''].filter(Boolean).join('+'));
  if (a('CG') || a('CP')) L.push('Couplé ' + [a('CG') ? 'G' : '', a('CP') ? 'P' : ''].filter(Boolean).join('+'));
  if (a('TR')) L.push('Trio');
  if (a('M4')) L.push('Multi en 4');
  return L.join(' · ');
}

function blocs(raw, re) {
  const L = (Array.isArray(raw) ? raw : []).filter((b) => b && re.test(b.typePari || '') && !b.rembourse);
  return L.find((b) => b.audience === 'NATIONAL') || L[0] || null;
}
const memes = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
function rapport(bloc, combo) {
  if (!bloc) return 0;
  for (const r of bloc.rapports || []) {
    const c = String(r.combinaison || '').split(/[-\s]+/).map(Number).filter(Boolean);
    if (c.length && memes(c, combo)) return (Number(r.dividendePourUnEuro) || 0) / 100;
  }
  return 0;
}

// Résultat d'un prono avec les rapports définitifs : 1 € par pari.
// detail = [{t, c, r}] : r = rapport pour 1 € (0 = perdu), np = remboursé (non-partant)
export function evaluer(paris, raw, np, arrivee) {
  const B = {
    SG: blocs(raw, /^SIMPLE_GAGNANT$/), SP: blocs(raw, /^SIMPLE_PLACE$/), CG: blocs(raw, /^COUPLE_GAGNANT$/),
    CP: blocs(raw, /^COUPLE_PLACE$/), TR: blocs(raw, /^TRIO$/), M4: blocs(raw, /^MULTI$|^E_MULTI$/),
  };
  // Multi en 4 : le PMU ne donne pas de combinaison, on compare aux 4 premiers de l'arrivée
  const m4 = B.M4 ? ((B.M4.rapports || []).find((r) => /en\s*4$/i.test(String(r.libelle || '').trim())) || null) : null;
  const top4 = (arrivee || []).slice(0, 4);
  const out = { mise: 0, gains: 0, detail: [] };
  for (const p of paris) {
    if (p.c.some((n) => np.includes(n))) { out.detail.push({ t: p.t, c: p.c, r: 0, np: 1 }); continue; }
    out.mise += 1;
    const r = p.t === 'M4' ? (m4 && top4.length === 4 && memes(p.c, top4) ? (Number(m4.dividendePourUnEuro) || 0) / 100 : 0) : rapport(B[p.t], p.c);
    out.gains += r;
    out.detail.push({ t: p.t, c: p.c, r: Math.round(r * 100) / 100 });
  }
  out.gains = Math.round(out.gains * 100) / 100;
  return out;
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
    }
  }
  return info;
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
}
