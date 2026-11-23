// Repérés de Fanny : arrivées, couplé gagnant et gagnants, d'après le PMU
import { BASE, cache, get, lireRapports } from './_pmu.js';

export async function resultatsFanny(db, f) {
  if (!f || !Array.isArray(f.lignes) || !/^\d{2}\/\d{2}\/\d{4}$/.test(f.date || '')) return f;
  const d = f.date.split('/').join('');
  const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
  const reunions = (prog && prog.programme && prog.programme.reunions) || [];
  const lignes = [];
  for (const l of f.lignes) {
    const x = { ...l, arrivee: [], gagnant: null, cg: null };
    const re = reunions.find((r) => r.numOfficiel === l.r);
    const c = re && (re.courses || []).find((k) => k.numOrdre === l.c);
    if (c && Array.isArray(c.ordreArrivee) && c.ordreArrivee.length) {
      x.arrivee = c.ordreArrivee.map((a) => Array.isArray(a) ? a[0] : a).slice(0, 4);
      const w = x.arrivee[0], s = x.arrivee[1];
      if (l.ch.includes(w)) {
        const raps = lireRapports(await cache(db, `rap-${d}-R${l.r}C${l.c}`, 120, () => get(`${BASE}/${d}/R${l.r}/C${l.c}/rapports-definitifs`)));
        const g = raps.find((r) => r.nom === 'Gagnant');
        x.gagnant = { n: w, euros: g ? g.euros : null };
        if (l.ch.includes(s)) { const k = raps.find((r) => r.nom === 'Couplé gagnant'); x.cg = { euros: k ? k.euros : null }; }
      }
    }
    lignes.push(x);
  }
  return { ...f, lignes };
}
