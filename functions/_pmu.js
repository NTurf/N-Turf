// Outils communs pour lire les données publiques du PMU
export const BASE = 'https://online.turfinfo.api.pmu.fr/rest/client/1/programme';

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/hippodrome( de| d'| du)?/g, '').replace(/[^a-z]/g, '');

export async function cache(db, cle, ttlSec, fn) {
  const now = Date.now();
  const r = await db.prepare('SELECT data, expire FROM pmu_cache WHERE cle = ?').bind(cle).first();
  if (r && r.expire > now) return JSON.parse(r.data);
  let data;
  try { data = await fn(); } catch (e) { if (r) return JSON.parse(r.data); throw e; }
  if (data !== undefined && data !== null) {
    await db.prepare('INSERT INTO pmu_cache (cle, data, expire) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET data = excluded.data, expire = excluded.expire')
      .bind(cle, JSON.stringify(data), now + ttlSec * 1000).run();
  }
  return data;
}

export async function get(url) {
  const r = await fetch(url, { headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0 (N-TURF)' } });
  if (r.status === 204 || r.status === 404) return null;
  if (!r.ok) throw new Error('PMU ' + r.status);
  return r.json();
}

const LIB = {
  TIERCE: 'Tiercé', QUARTE_PLUS: 'Quarté+', QUINTE_PLUS: 'Quinté+',
  SIMPLE_GAGNANT: 'Gagnant', SIMPLE_PLACE: 'Placé', COUPLE_GAGNANT: 'Couplé gagnant', COUPLE_PLACE: 'Couplé placé',
  COUPLE_ORDRE: 'Couplé ordre', TRIO: 'Trio', TRIO_ORDRE: 'Trio ordre', DEUX_SUR_QUATRE: '2 sur 4', SUPER_QUATRE: 'Super 4',
};

export function lireRapports(blocs) {
  const out = [];
  if (!Array.isArray(blocs)) return out;
  const choisis = new Map();
  for (const b of blocs) {
    if (!b || b.rembourse) continue;
    const k = b.typePari;
    if (!(k in LIB) && !/MULTI/.test(k)) continue;
    if (['TIERCE', 'QUARTE_PLUS', 'QUINTE_PLUS'].includes(k)) { if (b.audience && b.audience !== 'NATIONAL') continue; out.push(...(b.rapports || []).filter((r) => Number(r.dividendePourUnEuro) > 0 && !String(r.combinaison || '').includes('NP')).map((r) => ({ nom: LIB[k] + ' ' + String(r.libelle || '').toLowerCase(), euros: Number(r.dividendePourUnEuro) / 100 }))); continue; }
    const cur = choisis.get(k);
    if (!cur || (cur.audience !== 'NATIONAL' && b.audience === 'NATIONAL')) choisis.set(k, b);
  }
  const multis = [...choisis.keys()].filter((k) => /MULTI/.test(k));
  const ordre = ['SIMPLE_GAGNANT', 'SIMPLE_PLACE', 'COUPLE_GAGNANT', 'COUPLE_PLACE', 'COUPLE_ORDRE', 'TRIO', 'TRIO_ORDRE', 'DEUX_SUR_QUATRE', ...multis, 'SUPER_QUATRE'];
  for (const k of ordre) {
    const b = choisis.get(k); if (!b) continue;
    for (const r of b.rapports || []) {
      const c = Number(r.dividendePourUnEuro);
      const comb = String(r.combinaison || '').trim();
      const estMulti = /MULTI/.test(k);
      if ((!comb && !estMulti) || comb.includes('NP') || !Number.isFinite(c) || c <= 0) continue;
      const nom = estMulti ? (String(r.libelle || (k === 'MINI_MULTI' ? 'Mini Multi' : 'Multi')).replace(/^mini multi/i, 'Mini Multi').replace(/^multi/i, 'Multi')) : LIB[k];
      const avecComb = ['SIMPLE_PLACE', 'COUPLE_PLACE'].includes(k);
      out.push({ nom: avecComb ? `${nom} ${comb}` : nom, euros: c / 100 });
    }
  }
  const vus = new Set();
  return out.filter((r) => { const k = r.nom + '|' + r.euros; if (vus.has(k)) return false; vus.add(k); return true; });
}


export async function preparer(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS pmu_cache (cle TEXT PRIMARY KEY, data TEXT NOT NULL, expire INTEGER NOT NULL)').run();
}

export function dateParam(u) {
  const m = String(u.searchParams.get('date') || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? m[1] + m[2] + m[3] : null;
}

// Détail d'une course : partants, arrivée, rapports
export async function detailCourse(db, d, R, c) {
  const C = c.numOrdre;
  const parts = await cache(db, `part-${d}-R${R}C${C}`, 1800, () => get(`${BASE}/${d}/R${R}/C${C}/participants`));
  const FER = { DEFERRE_ANTERIEURS_POSTERIEURS: 'D4', DEFERRE_ANTERIEURS: 'DA', DEFERRE_POSTERIEURS: 'DP', PROTEGE_ANTERIEURS_POSTERIEURS: 'P4', PROTEGE_ANTERIEURS: 'PA', PROTEGE_POSTERIEURS: 'PP', PROTEGE_ANTERIEURS_DEFERRE_POSTERIEURS: 'PA DP', DEFERRE_ANTERIEURS_PROTEGE_POSTERIEURS: 'DA PP' };
  const OEIL = { OEILLERES_CLASSIQUE: 'Œillères', OEILLERES_AUSTRALIENNES: 'Œill. australiennes' };
  const dist = c.distance || 0;
  const partants = ((parts && parts.participants) || []).map((p) => ({
    n: p.numPmu, nom: p.nom, musique: p.musique || '', np: p.statut === 'NON_PARTANT',
    age: p.age || null, sexe: p.sexe ? String(p.sexe).charAt(0) : '',
    monte: (p.driver || p.jockey || '').trim(), entr: (p.entraineur || '').trim(),
    fer: p.deferre ? (FER[p.deferre] || String(p.deferre).replace(/_/g, ' ').toLowerCase()) : '',
    recul: p.handicapDistance && dist && p.handicapDistance > dist ? p.handicapDistance - dist : 0,
    poids: p.handicapPoids ? p.handicapPoids / 10 : (p.poidsConditionMonte ? p.poidsConditionMonte / 10 : null),
    corde: p.placeCorde || null, oeil: OEIL[p.oeilleres] || '',
    cote: p.dernierRapportDirect && p.dernierRapportDirect.rapport ? p.dernierRapportDirect.rapport : (p.dernierRapportReference && p.dernierRapportReference.rapport ? p.dernierRapportReference.rapport : null),
  })).sort((a, b) => a.n - b.n);
  const arrivee = Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [];
  let rapports = [];
  if (arrivee.length) {
    const cle = `rap-${d}-R${R}C${C}`;
    try {
      const rap = await cache(db, cle, 60, () => get(`${BASE}/${d}/R${R}/C${C}/rapports-definitifs`));
      rapports = lireRapports(rap);
    } catch (e) { rapports = []; } // rapports pas encore publiés : on garde l'arrivée
    // On ne garde les rapports 24 h que s'ils sont complets : pour une course Quinté+, le PMU publie le Quinté+ après les simples
    const quinte = (c.paris || []).some((p) => p.codePari === 'QUINTE_PLUS');
    if (rapports.length && (!quinte || rapports.some((x) => /quint/i.test(String(x.nom || ''))))) await db.prepare('UPDATE pmu_cache SET expire = ? WHERE cle = ?').bind(Date.now() + 86400000, cle).run();
  }
  return { num: C, libelle: c.libelle || '', heure: c.heureDepart || null, discipline: c.discipline || '', distance: dist || null, specialite: c.specialite || '', allocation: c.montantPrix || null, conditions: c.conditions || '', corde: c.corde || '', categorie: c.categorieParticularite || '', partants, arrivee, definitive: rapports.length > 0, rapports };
}
