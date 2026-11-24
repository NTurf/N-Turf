// Pronos des membres : 4 chevaux maximum (bases et associés), un jeu au choix, vérifiés automatiquement après l'arrivée
import { BASE, cache, get } from './_pmu.js';

export const JEUX = { simple: 'Simple', couple: 'Couplé placé', trio: 'Trio', multi: 'Multi en 4' };
export const MIN_CHEVAUX = { simple: 1, couple: 2, trio: 3, multi: 4 };

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
}

export const isoVersPmu = (iso) => iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4);

// toutes les combinaisons de k chevaux qui respectent les bases (toutes les bases si elles tiennent, sinon parmi les bases)
export function combinaisons(ch, k) {
  const bases = ch.filter((x) => x.b).map((x) => x.n), tous = ch.map((x) => x.n);
  const out = [];
  const rec = (deb, cur) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = deb; i < tous.length; i++) { cur.push(tous[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  if (!bases.length) return out;
  if (bases.length <= k) return out.filter((c) => bases.every((b) => c.includes(b)));
  return out.filter((c) => c.every((n) => bases.includes(n)));
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

// Résultat d'un prono avec les rapports définitifs (mise de 1 € par pari)
export function evaluer(p, raw, np, arrivee) {
  const ch = JSON.parse(p.chevaux || '[]');
  const out = { mise: 0, gains: 0, lignes: [] };
  if (p.jeu === 'simple') {
    const sg = blocs(raw, /^SIMPLE_GAGNANT$/), sp = blocs(raw, /^SIMPLE_PLACE$/);
    const cibles = ch.some((x) => x.b) ? ch.filter((x) => x.b) : ch.slice(0, 1);
    for (const x of cibles) {
      if (np.includes(x.n)) { out.lignes.push(`${x.n} non-partant, remboursé`); continue; }
      out.mise += 2;
      const g = rapport(sg, [x.n]), pl = rapport(sp, [x.n]);
      out.gains += g + pl;
      if (g || pl) out.lignes.push(`${x.n} : ${g ? 'gagnant ' + g.toFixed(2).replace('.', ',') + ' € + ' : ''}placé ${pl.toFixed(2).replace('.', ',')} €`);
    }
  } else {
    const k = { couple: 2, trio: 3, multi: 4 }[p.jeu];
    const bloc = p.jeu === 'couple' ? blocs(raw, /^COUPLE_PLACE$/) : p.jeu === 'trio' ? blocs(raw, /^TRIO$/) : blocs(raw, /^MULTI$|^E_MULTI$/);
    // Multi en 4 : le PMU ne donne pas de combinaison, on compare aux 4 premiers de l'arrivée
    const m4 = bloc && p.jeu === 'multi' ? ((bloc.rapports || []).find((r) => /en\s*4$/i.test(String(r.libelle || '').trim())) || null) : null;
    const top4 = (arrivee || []).slice(0, 4);
    for (const c of combinaisons(ch, k)) {
      if (c.some((n) => np.includes(n))) continue; // combinaison avec un non-partant : remboursée
      out.mise += 1;
      const r = p.jeu === 'multi' ? (m4 && top4.length === 4 && memes(c, top4) ? (Number(m4.dividendePourUnEuro) || 0) / 100 : 0) : rapport(bloc, c);
      if (r) { out.gains += r; out.lignes.push(`${JEUX[p.jeu]} ${c.join('-')} : ${r.toFixed(2).replace('.', ',')} €`); }
    }
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
  const info = { hippo: (reu.hippodrome && (reu.hippodrome.libelleCourt || reu.hippodrome.libelleLong)) || 'R' + R, libelle: c.libelle || '', heure: c.heureDepart || null, discipline: c.discipline || '', distance: c.distance || null, partants, arrivee, definitive: false };
  const attente = await db.prepare("SELECT id, chevaux, jeu FROM pm_pronos WHERE jour = ? AND reunion = ? AND course = ? AND statut = 'attente'").bind(jour, R, C).all();
  if (arrivee.length) {
    let raw = null;
    try { raw = await cache(db, `rapraw-${d}-R${R}C${C}`, 120, () => get(`${BASE}/${d}/R${R}/C${C}/rapports-definitifs`)); } catch (e) { raw = null; }
    if (Array.isArray(raw) && raw.length) {
      info.definitive = true;
      const np = partants.filter((p) => p.np).map((p) => p.n);
      const q = (attente.results || []).map((p) => { const e = evaluer(p, raw, np, arrivee); return db.prepare("UPDATE pm_pronos SET statut = 'calcule', mise = ?, gains = ?, detail = ? WHERE id = ?").bind(e.mise, e.gains, JSON.stringify(e.lignes), p.id); });
      if (q.length) await db.batch(q);
    }
  }
  return info;
}
