// Statistiques du concours Quinté+ (cahier des charges, points 5 et 6)
// Uniquement les pronostics enregistrés avant la course (le concours ferme 5 minutes avant le départ)
// et les arrivées / rapports officiels du PMU. Monnaie : fers à cheval, jeu fictif (aucun euro joué).
import { misesDu, formatDu } from './_concours.js';

const r2 = (x) => Math.round(x * 100) / 100;
export const MIN_COURSES = 10; // en dessous, un joueur n'est pas classé par spécialité (trop peu de courses pour juger)
const CATS = ['sg', 'sp', 'couple', 'tierce', 'quarte', 'multi', 'quinte'];
const NOMS = { sg: 'Simple gagnant', sp: 'Simple placé', couple: 'Couplé', tierce: 'Tiercé', quarte: 'Quarté+', multi: 'Multi en 4', quinte: 'Quinté+' };
const vide = () => ({ courses: 0, sel: 0, reussites: 0, ordre: 0, mises: 0, gains: 0 });

export async function statsConcours(db) {
  const rows = (await db.prepare(`SELECT p.user_id, u.pseudo, u.role, p.date, p.chevaux, p.retenu, p.gains, p.detail, j.arrivee, j.partants, j.rapports
    FROM concours_pronos p JOIN concours_jours j ON j.date = p.date JOIN users u ON u.id = p.user_id
    WHERE j.statut = 'calcule' ORDER BY p.date`).all()).results || [];
  const J = new Map();
  for (const r of rows) {
    let x = J.get(r.user_id);
    if (!x) { x = { id: r.user_id, pseudo: r.pseudo, robot: r.role === 'robot', courses: 0, mises: 0, gains: 0, cat: {}, chevaux: { sg: [], sp: [] }, mois: {}, courbe: [], premier: r.date, dernier: r.date }; CATS.forEach((c) => { x.cat[c] = vide(); }); J.set(r.user_id, x); }
    const M = misesDu(r.date), fmt = formatDu(r.date);
    const misesJ = { sg: 8, sp: 32, couple: M.couple, tierce: M.tierce, quarte: M.quarte, multi: M.multi, quinte: M.quinte };
    const totJ = Object.values(misesJ).reduce((s, v) => s + v, 0);
    const arr = JSON.parse(r.arrivee || '[]'), R = r.rapports ? JSON.parse(r.rapports) : { p: {} };
    const liste = JSON.parse(r.retenu || r.chevaux || '[]');
    const noms = {}; JSON.parse(r.partants || '[]').forEach((p) => { noms[p.n] = p.nom; });
    const det = JSON.parse(r.detail || '[]');
    const gainsDe = (pari, f) => det.filter((d) => d.pari === pari && (!f || f(d))).reduce((s, d) => s + d.fers, 0);
    x.courses++; x.mises += totJ; x.gains += r.gains || 0; x.dernier = r.date;
    // Jeux simples : chevaux 1 et 2 du joueur
    const deux = liste.slice(0, 2);
    const sg = x.cat.sg, sp = x.cat.sp;
    sg.courses++; sp.courses++; sg.sel += deux.length; sp.sel += deux.length; sg.mises += 8; sp.mises += 32;
    deux.forEach((h) => {
      const gG = gainsDe('Simple', (d) => d.type === 'Gagnant du ' + h), gP = gainsDe('Simple', (d) => d.type === 'Placé du ' + h);
      if (arr[0] === h) sg.reussites++;
      if (R.p && R.p[h]) sp.reussites++;
      sg.gains += gG; sp.gains += gP;
      if (gG > 0) x.chevaux.sg.push({ date: r.date, n: h, nom: noms[h] || '', fers: r2(gG) });
      if (gP > 0) x.chevaux.sp.push({ date: r.date, n: h, nom: noms[h] || '', fers: r2(gP) });
    });
    // Jeux combinés
    const comb = { couple: 'Couplé', tierce: 'Tiercé', quarte: 'Quarté+', multi: 'Multi en 4', quinte: 'Quinté+' };
    for (const k of Object.keys(comb)) {
      const c = x.cat[k], g = gainsDe(comb[k]);
      c.courses++; c.mises += misesJ[k]; c.gains += g;
      if (g > 0) c.reussites++;
      if (det.some((d) => d.pari === comb[k] && d.type === 'Ordre')) c.ordre++;
    }
    // Évolution
    const m = r.date.slice(0, 7);
    const mo = x.mois[m] || (x.mois[m] = { courses: 0, mises: 0, gains: 0 });
    mo.courses++; mo.mises += totJ; mo.gains += r.gains || 0;
    x.courbe.push({ date: r.date, net: r2(x.gains - x.mises) });
    x.format8 = (x.format8 || 0) + (fmt === 8 ? 1 : 0);
  }
  const out = [...J.values()].map((x) => {
    const cat = {};
    CATS.forEach((k) => { const c = x.cat[k]; cat[k] = { ...c, mises: r2(c.mises), gains: r2(c.gains), net: r2(c.gains - c.mises) }; });
    const top = (L) => L.sort((a, b) => b.fers - a.fers).slice(0, 3);
    return { id: x.id, pseudo: x.pseudo, robot: x.robot, courses: x.courses, premier: x.premier, dernier: x.dernier,
      mises: r2(x.mises), gains: r2(x.gains), net: r2(x.gains - x.mises), cat, chevaux: { sg: top(x.chevaux.sg), sp: top(x.chevaux.sp) },
      mois: Object.keys(x.mois).sort().map((k) => ({ mois: k, ...x.mois[k], mises: r2(x.mois[k].mises), gains: r2(x.mois[k].gains), net: r2(x.mois[k].gains - x.mois[k].mises) })),
      courbe: x.courbe };
  });
  // Classements par spécialité : bilan net de la catégorie, seulement à partir de MIN_COURSES courses
  const specialites = {};
  CATS.forEach((k) => {
    const L = out.filter((x) => x.courses >= MIN_COURSES).map((x) => ({ pseudo: x.pseudo, robot: x.robot, courses: x.courses, reussites: x.cat[k].reussites, sel: x.cat[k].sel, net: x.cat[k].net, gains: x.cat[k].gains, mises: x.cat[k].mises }))
      .sort((a, b) => b.net - a.net || b.reussites - a.reussites);
    specialites[k] = L;
  });
  specialites.bilan = out.filter((x) => x.courses >= MIN_COURSES).map((x) => ({ pseudo: x.pseudo, robot: x.robot, courses: x.courses, net: x.net, gains: x.gains, mises: x.mises })).sort((a, b) => b.net - a.net);
  return { joueurs: out.sort((a, b) => b.courses - a.courses || a.pseudo.localeCompare(b.pseudo)), specialites, noms: NOMS, min: MIN_COURSES, courses: new Set(rows.map((r) => r.date)).size };
}
