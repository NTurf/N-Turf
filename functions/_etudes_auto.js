// Études calculées automatiquement à partir des données publiques du PMU (aucune capture à envoyer)
import { BASE, norm, cache, get, detailReunion, detailCourse, lotCache } from './_pmu.js';
import { cpcAvecCoeurs } from './_coeurs.js';
import { lireContenu } from './_auth.js';
import { limites, classer, chevauxFormule, estTrot } from './_formule.js';

export const estQuinte = (c) => (c.paris || []).some((p) => p.codePari === 'QUINTE_PLUS');
const hippoDe = (r) => (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || ('R' + r.numOfficiel);
const ddmmyyyy = (d) => d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);

export async function programme(db, d) {
  const prog = await cache(db, 'prog-' + d, 120, () => get(`${BASE}/${d}`));
  return (prog && prog.programme && prog.programme.reunions) || [];
}

// Rapports simples d'un cheval (1 € gagnant, 1 € placé)
function simples(det, n) {
  let g = 0, p = 0;
  for (const r of det.rapports || []) {
    if (r.nom === 'Gagnant' && det.arrivee[0] === n) g = r.euros;
    const m = String(r.nom).match(/^Placé\s+(\d+)$/);
    if (m && +m[1] === n) p = r.euros;
  }
  return { g, p };
}

// OUTSIDERS : chevaux cotés de 6 à 10 au PMU, sur les réunions publiées (course par course) et le Quinté+
export async function outsiders(db, d) {
  const reunions = await programme(db, d);
  const cpc = await cpcAvecCoeurs(db, 'cpc', 'coeurs');
  const publiees = cpc && cpc.date === ddmmyyyy(d) && Array.isArray(cpc.reunions) ? cpc.reunions : [];
  const trouver = (nom) => { const h = norm(nom); return h && reunions.find((r) => { const a = norm(r.hippodrome && r.hippodrome.libelleCourt), b = norm(r.hippodrome && r.hippodrome.libelleLong); return (a && (a.includes(h) || h.includes(a))) || (b && (b.includes(h) || h.includes(b))); }); };
  const choix = [];
  for (const re of publiees) { const r = trouver(re.brut || re.hippodrome); if (r && !choix.includes(r)) choix.push(r); }
  const out = [];
  const bilan = { joues: 0, gagnants: 0, places: 0, mise: 0, retour: 0 };
  const traiter = (r, dets) => {
    const courses = [];
    for (const det of dets) {
      const vivants = det.partants.filter((p) => !p.np);
      const L = vivants.filter((p) => p.cote && p.cote >= 6 && p.cote <= 10).sort((a, b) => a.cote - b.cote);
      if (!L.length) continue;
      const nbPlaces = vivants.length >= 8 ? 3 : 2, fini = det.arrivee.length > 0 && det.definitive;
      const chevaux = L.map((p) => {
        const x = { n: p.n, nom: p.nom, cote: p.cote };
        if (fini) {
          const rang = det.arrivee.indexOf(p.n) + 1, s = simples(det, p.n);
          x.rang = rang || null; x.gagne = s.g; x.place = s.p;
          bilan.joues++; bilan.mise += 2; bilan.retour += s.g + s.p;
          if (rang === 1) bilan.gagnants++;
          if (rang && rang <= nbPlaces) bilan.places++;
        }
        return x;
      });
      courses.push({ c: det.num, nom: det.libelle, heure: det.heure, partants: vivants.length, arrivee: det.arrivee.slice(0, 5), fini, quinte: !!det.quinte, chevaux });
    }
    if (courses.length) out.push({ r: r.numOfficiel, h: hippoDe(r), courses });
  };
  for (const r of choix) {
    const dets = await detailReunion(db, d, r);
    dets.forEach((x, i) => { x.quinte = estQuinte((r.courses || [])[i] || {}); });
    traiter(r, dets);
  }
  // le Quinté+, même si sa réunion n'est pas publiée
  for (const r of reunions) {
    if (choix.includes(r)) continue;
    const c = (r.courses || []).find(estQuinte);
    if (!c) continue;
    const det = await detailCourse(db, d, r.numOfficiel, c); det.quinte = true;
    traiter(r, [det]);
  }
  bilan.retour = Math.round(bilan.retour * 100) / 100;
  bilan.net = Math.round((bilan.retour - bilan.mise) * 100) / 100;
  return { reunions: out, bilan, publiees: choix.length };
}

// QUINTÉ+ : croisement automatique des listes N-TURF (synthèse, TCR, ALGO, PERSO), de la formule du membre (trot) et des cotes PMU
export async function etudeQuinte(db) {
  const q = await lireContenu(db, 'quinte');
  if (!q || !q.date) return { vide: true };
  const d = q.date.split('/').join('');
  const reunions = await programme(db, d);
  let reu = null, c = null;
  for (const r of reunions) { const x = (r.courses || []).find(estQuinte); if (x) { reu = r; c = x; break; } }
  if (!c) return { vide: true, date: q.date };
  const det = await detailCourse(db, d, reu.numOfficiel, c);
  const A = q.approches || {};
  const listes = [
    ['Synthèse', q.synthese], ['TCR', A.TCR && A.TCR.selection], ['ALGO', A.ALGO && A.ALGO.selection], ['PERSO', (A.PERSO && A.PERSO.selection) || q.perso],
  ].filter((x) => Array.isArray(x[1]) && x[1].length).map(([nom, L]) => ({ nom, L: L.map(Number) }));
  let trot = null;
  if (estTrot(c)) {
    const parts = await cache(db, `part-${d}-R${reu.numOfficiel}C${c.numOrdre}`, 1800, () => get(`${BASE}/${d}/R${reu.numOfficiel}/C${c.numOrdre}/participants`));
    const ch = chevauxFormule(parts);
    if (ch.length) {
      const lim = limites(c.conditions), L = lim.recul || lim.plafond, g = ch.map((h) => h.gains), fictif = Math.round((Math.min(...g) + Math.max(...g)) / 2);
      const f1 = classer(ch, L).map((x) => x.n), f2 = classer(ch, fictif).map((x) => x.n);
      if (f1.length) listes.push({ nom: 'Formule', L: f1 });
      if (f2.length) listes.push({ nom: 'Recul fictif', L: f2 });
      trot = { limite: L, fictif };
    }
  }
  const lignes = det.partants.filter((p) => !p.np).map((p) => {
    const rangs = listes.map((x) => { const i = x.L.indexOf(p.n); return i >= 0 ? i + 1 : null; });
    const cite = rangs.filter((r) => r && r <= 8).length;
    const somme = rangs.reduce((s, r) => s + (r && r <= 8 ? r : 9), 0);
    return { n: p.n, nom: p.nom, cote: p.cote, rangs, cite, somme, outsider: !!(p.cote && p.cote >= 6 && p.cote <= 10) };
  }).sort((a, b) => b.cite - a.cite || a.somme - b.somme || a.n - b.n);
  return { date: q.date, hippodrome: hippoDe(reu), libelle: det.libelle, heure: det.heure, discipline: det.discipline, partants: lignes.length, listes: listes.map((x) => x.nom), lignes, arrivee: det.arrivee.slice(0, 5), trot };
}

// TROTTEURS : formule du membre sur toutes les courses de trot françaises (lectures groupées : peu de requêtes)
export async function etudeTrot(db, d) {
  const reunions = await programme(db, d);
  const items = [];
  for (const r of reunions) {
    if (r.pays && r.pays.code && r.pays.code !== 'FRA') continue;
    for (const c of r.courses || []) if (estTrot(c)) items.push({ r, c, cle: `part-${d}-R${r.numOfficiel}C${c.numOrdre}`, url: `${BASE}/${d}/R${r.numOfficiel}/C${c.numOrdre}/participants`, ttl: () => 1800 });
  }
  const data = await lotCache(db, items.slice(0, 45)); // au plus 45 appels au PMU d'un coup
  const parR = new Map();
  for (const it of items.slice(0, 45)) {
    const chevaux = chevauxFormule(data.get(it.cle));
    if (!chevaux.length) continue;
    const c = it.c, g = chevaux.map((h) => h.gains), fictif = Math.round((Math.min(...g) + Math.max(...g)) / 2);
    const lim = limites(c.conditions), L = lim.recul || lim.plafond;
    const arrivee = Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x).slice(0, 5) : [];
    if (!parR.has(it.r)) parR.set(it.r, []);
    parR.get(it.r).push({ c: c.numOrdre, nom: c.libelle || '', heure: c.heureDepart || null, partants: chevaux.length, cotes: chevaux.some((h) => h.cote),
      limite: L, typeLimite: lim.recul ? 'recul' : (lim.plafond ? 'plafond' : null), fictif,
      conditions: classer(chevaux, L), reculFictif: classer(chevaux, fictif), noms: Object.fromEntries(chevaux.map((h) => [h.n, h.nom])), arrivee });
  }
  return { reunions: [...parR.entries()].map(([r, courses]) => ({ r: r.numOfficiel, h: hippoDe(r), courses })) };
}
