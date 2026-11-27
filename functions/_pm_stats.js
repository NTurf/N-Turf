// Statistiques des Pronos des membres (cahier des charges, points 5 et 6, appliqués aux pronos des membres)
// Uniquement les pronos donnés avant la course et vérifiés avec les rapports définitifs du PMU.
// Mise fictive de 1 € par pari : ce ne sont pas des gains réellement encaissés.
import { TYPES, ORDRE_TYPES } from './_pm.js';

export const MIN_PRONOS = 10; // en dessous, pas de classement par spécialité (trop peu de courses pour juger)
const r2 = (x) => Math.round(x * 100) / 100;

export async function statsPm(db) {
  const rows = (await db.prepare(`SELECT p.user_id, u.pseudo, p.jour, p.reunion, p.course, p.hippo, p.detail FROM pm_pronos p JOIN users u ON u.id = p.user_id
    WHERE p.statut = 'calcule' AND u.banni = 0 ORDER BY p.jour, p.id`).all()).results || [];
  const J = new Map();
  for (const r of rows) {
    let x = J.get(r.user_id);
    if (!x) { x = { id: r.user_id, pseudo: r.pseudo, pronos: 0, mise: 0, gains: 0, types: {}, chevaux: { SG: [], SP: [] }, mois: {}, jours: {}, premier: r.jour, dernier: r.jour }; J.set(r.user_id, x); }
    let d = []; try { d = JSON.parse(r.detail || '[]'); } catch (e) { d = []; }
    if (!Array.isArray(d)) d = [];
    x.pronos++; x.dernier = r.jour;
    let mise = 0, gains = 0;
    for (const p of d) {
      if (!p || !p.t || p.np) continue;
      const T = x.types[p.t] || (x.types[p.t] = { t: p.t, nom: TYPES[p.t] || p.t, paris: 0, gagnes: 0, mise: 0, gains: 0 });
      const g = Number(p.r) || 0;
      T.paris++; T.mise += 1; T.gains += g; if (g > 0) T.gagnes++;
      mise += 1; gains += g;
      if ((p.t === 'SG' || p.t === 'SP') && g > 0) x.chevaux[p.t].push({ n: p.c[0], lieu: (r.hippo || 'R' + r.reunion) + ' C' + r.course, jour: r.jour, euros: r2(g) });
    }
    x.mise += mise; x.gains += gains;
    const m = r.jour.slice(0, 7), mo = x.mois[m] || (x.mois[m] = { pronos: 0, mise: 0, gains: 0 });
    mo.pronos++; mo.mise += mise; mo.gains += gains;
    const jj = x.jours[r.jour] || (x.jours[r.jour] = { mise: 0, gains: 0 }); jj.mise += mise; jj.gains += gains;
  }
  const out = [...J.values()].map((x) => {
    let cum = 0;
    const courbe = Object.keys(x.jours).sort().map((j) => { cum += x.jours[j].gains - x.jours[j].mise; return { date: j, net: r2(cum) }; });
    return {
      id: x.id, pseudo: x.pseudo, pronos: x.pronos, premier: x.premier, dernier: x.dernier,
      mise: r2(x.mise), gains: r2(x.gains), net: r2(x.gains - x.mise),
      types: ORDRE_TYPES.filter((t) => x.types[t]).map((t) => { const T = x.types[t]; return { ...T, mise: r2(T.mise), gains: r2(T.gains), net: r2(T.gains - T.mise) }; }),
      chevaux: { SG: x.chevaux.SG.sort((a, b) => b.euros - a.euros).slice(0, 3), SP: x.chevaux.SP.sort((a, b) => b.euros - a.euros).slice(0, 3) },
      mois: Object.keys(x.mois).sort().map((k) => ({ mois: k, ...x.mois[k], mise: r2(x.mois[k].mise), gains: r2(x.mois[k].gains), net: r2(x.mois[k].gains - x.mois[k].mise) })),
      courbe,
    };
  });
  // Classements par spécialité : net du jeu, à partir de MIN_PRONOS pronos
  const specialites = {};
  ORDRE_TYPES.forEach((t) => {
    specialites[t] = out.filter((x) => x.pronos >= MIN_PRONOS).map((x) => { const T = x.types.find((y) => y.t === t); return T ? { pseudo: x.pseudo, pronos: x.pronos, paris: T.paris, gagnes: T.gagnes, mise: T.mise, net: T.net } : null; })
      .filter(Boolean).sort((a, b) => b.net - a.net || b.gagnes - a.gagnes);
  });
  specialites.bilan = out.filter((x) => x.pronos >= MIN_PRONOS).map((x) => ({ pseudo: x.pseudo, pronos: x.pronos, mise: x.mise, net: x.net })).sort((a, b) => b.net - a.net);
  return { membres: out.sort((a, b) => b.pronos - a.pronos || a.pseudo.localeCompare(b.pseudo)), specialites, types: TYPES, ordre: ORDRE_TYPES, min: MIN_PRONOS };
}
