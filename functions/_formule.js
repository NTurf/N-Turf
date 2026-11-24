// Formule du membre (trot) : |limite − gains| ÷ limite × dernière place × cote (30 max). Plus petit = meilleur.
const montant = (s) => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return n > 0 ? n : null; };

export function limites(conditions) {
  const t = String(conditions || '').replace(/\s+/g, ' ');
  const plafond = montant((t.match(/n['’]ayant pas gagn[ée]+ ([\d][\d .]*\d)/i) || [])[1]);
  const recul = montant((t.match(/recul[\s\S]{0,140}?(\d{1,3}(?:[ .]\d{3})+)/i) || [])[1]);
  return { plafond, recul };
}

export function dernierePlace(musique) {
  const m = String(musique || '').replace(/^\s*\(\d+\)\s*/, '');
  const c = m.charAt(0);
  if (/[1-9]/.test(c)) return parseInt(c, 10);
  return 10; // 0, D, A, T, Ret… ou rien
}

export function classer(chevaux, L) {
  if (!L) return [];
  return chevaux.map((h) => ({ n: h.n, note: Math.abs(L - h.gains) / L * h.place * (h.cote ? Math.min(h.cote, 30) : 1) }))
    .sort((a, b) => a.note - b.note).map((x) => ({ n: x.n, note: Math.round(x.note * 100) / 100 }));
}


// Chevaux d'une course (données PMU « participants »)
export function chevauxFormule(parts) {
  return ((parts && parts.participants) || []).filter((p) => p.statut !== 'NON_PARTANT').map((p) => ({
    n: p.numPmu, nom: p.nom,
    gains: Math.round(((p.gainsParticipant && p.gainsParticipant.gainsCarriere) || 0) / 100),
    place: dernierePlace(p.musique),
    cote: (p.dernierRapportDirect && p.dernierRapportDirect.rapport) || (p.dernierRapportReference && p.dernierRapportReference.rapport) || null,
  }));
}
export const estTrot = (c) => { const d = String(c.discipline || '') + ' ' + String(c.specialite || ''); return /ATTELE|MONTE/i.test(d) && !/PLAT|OBSTACLE|HAIE|STEEPLE|CROSS/i.test(d); };
