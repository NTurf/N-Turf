// Coups de cœur saisis depuis l'Administration : ajoutés aux choix ❤ du fichier course par course
import { norm } from './_pmu.js';
import { lireContenu } from './_auth.js';

export function fusionCoeurs(cpc, coeurs) {
  if (!cpc || !Array.isArray(cpc.reunions) || !coeurs || coeurs.date !== cpc.date || !Array.isArray(coeurs.lignes)) return cpc;
  const out = JSON.parse(JSON.stringify(cpc));
  for (const l of coeurs.lignes) {
    const h = norm(l.h);
    const re = out.reunions.find((r) => { const a = norm(r.brut || r.hippodrome), b = norm(r.hippodrome); return h && ((a && (a.includes(h) || h.includes(a))) || (b && (b.includes(h) || h.includes(b)))); });
    if (!re) continue;
    const c = (re.courses || []).find((k) => parseInt(String(k.course).replace(/\D/g, ''), 10) === l.c);
    if (!c) continue;
    c.choix = (c.choix || []).concat(l.ch.filter((n) => !(c.choix || []).includes(n)));
  }
  return out;
}

// Le course par course du jour (ou d'une date) avec les coups de cœur ajoutés
export async function cpcAvecCoeurs(db, cleCpc, cleCoeurs) {
  const cpc = await lireContenu(db, cleCpc);
  if (!cpc) return cpc;
  return fusionCoeurs(cpc, await lireContenu(db, cleCoeurs));
}
