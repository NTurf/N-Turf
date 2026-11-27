import { json, initDb, currentUser } from '../../_auth.js';
import { BASE, norm, cache, get, preparer } from '../../_pmu.js';
import { cpcAvecCoeurs } from '../../_coeurs.js';

// Alertes de départ : les courses du jour encore à courir, avec l'heure de départ à jour du PMU
// (le programme est relu chaque minute : une course retardée ou décalée garde sa nouvelle heure).
// Courses concernées : celles des réunions publiées sur N-TURF (course par course) et le Quinté+.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ courses: [] });
  const db = env.DB;
  await initDb(db); await preparer(db);
  const u = await currentUser(db, request);
  if (!u) return json({ courses: [] }, 401);
  const auj = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
  const d = auj.split('/').join('');
  let prog;
  try { prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`)); } catch (e) { return json({ erreur: 'PMU indisponible.' }, 502); }
  const reunions = (prog && prog.programme && prog.programme.reunions) || [];
  const cpc = await cpcAvecCoeurs(db, 'cpc', 'coeurs');
  const publiees = cpc && cpc.date === auj && Array.isArray(cpc.reunions) ? cpc.reunions : [];
  const trouver = (nom) => { const h = norm(nom); return h && reunions.find((r) => { const a = norm(r.hippodrome && r.hippodrome.libelleCourt), b = norm(r.hippodrome && r.hippodrome.libelleLong); return (a && (a.includes(h) || h.includes(a))) || (b && (b.includes(h) || h.includes(b))); }); };
  const now = Date.now(), out = [], vus = new Set();
  const ajouter = (r, c, hippodrome, lien) => {
    const cle = `R${r.numOfficiel}C${c.numOrdre}`;
    if (vus.has(cle)) return; vus.add(cle);
    const fini = (Array.isArray(c.ordreArrivee) && c.ordreArrivee.length) || /ANNUL|ARRIVEE/i.test(String(c.statut || '') + ' ' + String(c.categorieStatut || ''));
    const h = Number(c.heureDepart) || 0;
    if (fini || !h || h < now - 60000) return;
    out.push({ cle, reunion: r.numOfficiel, course: c.numOrdre, hippodrome, libelle: c.libelle || '', heure: h, quinte: (c.paris || []).some((p) => p.codePari === 'QUINTE_PLUS'), lien });
  };
  for (const re of publiees) {
    const r = trouver(re.brut || re.hippodrome); if (!r) continue;
    for (const c of r.courses || []) ajouter(r, c, re.hippodrome || (r.hippodrome && r.hippodrome.libelleCourt) || '', '/pronostics.html#cpc');
  }
  for (const r of reunions) for (const c of r.courses || []) {
    if ((c.paris || []).some((p) => p.codePari === 'QUINTE_PLUS')) ajouter(r, c, (r.hippodrome && r.hippodrome.libelleCourt) || '', '/pronostics.html#quinte');
  }
  out.sort((a, b) => a.heure - b.heure);
  return json({ jour: auj, maintenant: now, courses: out });
}
