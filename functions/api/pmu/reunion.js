import { json, initDb } from '../../_auth.js';

// Données publiques du PMU pour une réunion : partants, musique, arrivée, rapports.
// Appel : /api/pmu/reunion?date=23/11/2026&hippo=vincennes
const BASE = 'https://online.turfinfo.api.pmu.fr/rest/client/1/programme';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/hippodrome( de| d'| du)?/g, '').replace(/[^a-z]/g, '');

async function cache(db, cle, ttlSec, fn) {
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

async function get(url) {
  const r = await fetch(url, { headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0 (N-TURF)' } });
  if (r.status === 204 || r.status === 404) return null;
  if (!r.ok) throw new Error('PMU ' + r.status);
  return r.json();
}

const LIB = {
  SIMPLE_GAGNANT: 'Gagnant', SIMPLE_PLACE: 'Placé', COUPLE_GAGNANT: 'Couplé gagnant', COUPLE_PLACE: 'Couplé placé',
  COUPLE_ORDRE: 'Couplé ordre', TRIO: 'Trio', TRIO_ORDRE: 'Trio ordre', DEUX_SUR_QUATRE: '2 sur 4', SUPER_QUATRE: 'Super 4',
};

function lireRapports(blocs) {
  const out = [];
  if (!Array.isArray(blocs)) return out;
  const choisis = new Map();
  for (const b of blocs) {
    if (!b || b.rembourse) continue;
    const k = b.typePari;
    if (!(k in LIB) && k !== 'MULTI') continue;
    const cur = choisis.get(k);
    if (!cur || (cur.audience !== 'NATIONAL' && b.audience === 'NATIONAL')) choisis.set(k, b);
  }
  const ordre = ['SIMPLE_GAGNANT', 'SIMPLE_PLACE', 'COUPLE_GAGNANT', 'COUPLE_PLACE', 'COUPLE_ORDRE', 'TRIO', 'TRIO_ORDRE', 'DEUX_SUR_QUATRE', 'MULTI', 'SUPER_QUATRE'];
  for (const k of ordre) {
    const b = choisis.get(k); if (!b) continue;
    for (const r of b.rapports || []) {
      const c = Number(r.dividendePourUnEuro);
      const comb = String(r.combinaison || '').trim();
      if (!comb || comb.includes('NP') || !Number.isFinite(c) || c <= 0) continue;
      const nom = k === 'MULTI' ? (String(r.libelle || 'Multi').replace(/^multi/i, 'Multi')) : LIB[k];
      const avecComb = ['SIMPLE_PLACE', 'COUPLE_PLACE'].includes(k);
      out.push({ nom: avecComb ? `${nom} ${comb}` : nom, euros: c / 100 });
    }
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ erreur: 'Base absente.' }, 503);
  const db = env.DB;
  await initDb(db);
  await db.prepare('CREATE TABLE IF NOT EXISTS pmu_cache (cle TEXT PRIMARY KEY, data TEXT NOT NULL, expire INTEGER NOT NULL)').run();
  const u = new URL(request.url);
  const m = String(u.searchParams.get('date') || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const hippo = norm(u.searchParams.get('hippo'));
  if (!m || !hippo) return json({ erreur: 'Paramètres manquants.' }, 400);
  const d = m[1] + m[2] + m[3];

  try {
    const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
    const reunions = prog && prog.programme && prog.programme.reunions || [];
    const reu = reunions.find((r) => {
      const a = norm(r.hippodrome && r.hippodrome.libelleCourt), b = norm(r.hippodrome && r.hippodrome.libelleLong);
      return (a && (a.includes(hippo) || hippo.includes(a))) || (b && (b.includes(hippo) || hippo.includes(b)));
    });
    if (!reu) return json({ trouve: false });
    const R = reu.numOfficiel;
    const courses = [];
    for (const c of reu.courses || []) {
      const C = c.numOrdre;
      const parts = await cache(db, `part-${d}-R${R}C${C}`, 1800, () => get(`${BASE}/${d}/R${R}/C${C}/participants`));
      const partants = ((parts && parts.participants) || []).map((p) => ({
        n: p.numPmu, nom: p.nom, musique: p.musique || '', np: p.statut === 'NON_PARTANT',
      })).sort((a, b) => a.n - b.n);
      const arrivee = Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [];
      let rapports = [];
      if (arrivee.length) {
        // rapports définitifs : gardés longtemps une fois publiés, sinon redemandés chaque minute
        const rap = await cache(db, `rap-${d}-R${R}C${C}`, 60, () => get(`${BASE}/${d}/R${R}/C${C}/rapports-definitifs`));
        rapports = lireRapports(rap);
        if (rapports.length) {
          await db.prepare('UPDATE pmu_cache SET expire = ? WHERE cle = ?').bind(Date.now() + 86400000, `rap-${d}-R${R}C${C}`).run();
        }
      }
      courses.push({
        num: C, libelle: c.libelle || '', heure: c.heureDepart || null, discipline: c.discipline || '',
        partants, arrivee, definitive: rapports.length > 0, rapports,
      });
    }
    return json({ trouve: true, reunion: R, hippodrome: reu.hippodrome && reu.hippodrome.libelleCourt, courses });
  } catch (e) {
    return json({ erreur: 'Données PMU indisponibles pour le moment.' }, 502);
  }
}
