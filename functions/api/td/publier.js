import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initTd, contributeur, programme, trouver, auj, NTT } from '../../_td.js';
import { BASE, get } from '../../_pmu.js';

// Publier un pronostic ou un ticket sur une course du jour. Publication libre et immédiate pour les contributeurs autorisés,
// jusqu'au départ de la course (un pronostic publié après le départ ne compterait pas dans les statistiques).
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initTd(db);
  const u = await currentUser(db, request);
  const c = await contributeur(db, u);
  if (!c) return json({ erreur: 'Publication réservée aux contributeurs autorisés.' }, 403);
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  if (b.accepter) { await db.prepare("UPDATE td_contributeurs SET accepte = datetime('now') WHERE user_id = ?").bind(u.id).run(); return json({ ok: true }); }
  if (!c.accepte) return json({ erreur: 'Lis et accepte d\'abord la règle de la rubrique.', charte: true }, 400);
  const iso = auj();
  let P; try { P = await programme(db, iso); } catch (e) { return json({ erreur: 'Le programme du PMU ne répond pas, réessaie dans un instant.' }, 502); }
  const r = parseInt(b.r, 10), cn = parseInt(b.c, 10), course = trouver(P, r, cn);
  if (!course) return json({ erreur: 'Course introuvable au programme du jour.' }, 400);
  if (course.heure && course.heure <= Date.now()) return json({ erreur: 'Cette course est déjà partie.' }, 400);
  const reu = P.find((x) => x.r === r);
  const max = course.partants || 30, num = (x) => { const n = parseInt(x, 10); return n >= 1 && n <= max ? n : null; };
  const commentaire = String(b.commentaire || '').trim().slice(0, 300) || null;
  let chevaux = null, ticket = null, cout = null, type;
  if (b.type === 'prono') {
    if (!c.droits.pronos) return json({ erreur: 'Tu n\'as pas le droit de publier des pronostics.' }, 403);
    chevaux = (b.chevaux || []).map(num);
    if (!chevaux.length || chevaux.length > 8 || chevaux.some((x) => !x) || new Set(chevaux).size !== chevaux.length) return json({ erreur: `Un pronostic = de 1 à 8 chevaux différents, numéros de 1 à ${max}.` }, 400);
    type = 'prono';
  } else if (b.type === 'coeur') {
    // Coup de cœur du jour : un seul cheval, mis à la une du journal
    if (!c.droits.pronos) return json({ erreur: 'Tu n\'as pas le droit de publier des pronostics.' }, 403);
    const n = num((b.chevaux || [])[0]);
    if (!n) return json({ erreur: `Indique le numéro de ton coup de cœur (de 1 à ${max}).` }, 400);
    chevaux = [n]; type = 'coeur';
    try { // nom du cheval, pour la une du journal
      const pmu = iso.split('-').reverse().join('');
      const parts = await get(`${BASE}/${pmu}/R${r}/C${cn}/participants`);
      const h = ((parts && parts.participants) || []).find((x) => x.numPmu === n);
      if (h && h.statut === 'NON_PARTANT') return json({ erreur: `Le ${n} est non partant.` }, 400);
      if (h) ticket = { nom: h.nom };
    } catch (e) {}
  } else if (b.type === 'jeu') {
    // Jeu simple et couplé : chaque pari à la mise choisie, payé aux rapports officiels du PMU
    if (!c.droits.pronos) return json({ erreur: 'Tu n\'as pas le droit de publier des pronostics.' }, 403);
    const j = b.jeu || {}, mise = Math.round(Number(j.mise) * 100) / 100, paris = [];
    if (!(mise > 0) || mise > 500) return json({ erreur: 'Indique la mise par pari (en euros).' }, 400);
    const petit = (course.partants || 0) > 0 && course.partants <= 7;
    const sc = [...new Set((j.simple || []).map(num))];
    if (sc.some((x) => !x)) return json({ erreur: `Numéros de 1 à ${max} pour le jeu simple.` }, 400);
    if (sc.length) { if (!j.sg && !j.sp) return json({ erreur: 'Jeu simple : coche Gagnant, Placé ou les deux.' }, 400); for (const n of sc) { if (j.sg) paris.push({ t: 'SG', c: [n] }); if (j.sp) paris.push({ t: 'SP', c: [n] }); } }
    const cc = [...new Set((j.couple || []).map(num))];
    if (cc.some((x) => !x)) return json({ erreur: `Numéros de 1 à ${max} pour le couplé.` }, 400);
    if (cc.length) {
      if (cc.length < 2 || cc.length > 5) return json({ erreur: 'Couplé : de 2 à 5 chevaux.' }, 400);
      if (petit) { for (const a of cc) for (const z of cc) if (a !== z) paris.push({ t: 'CO', c: [a, z] }); }
      else {
        if (!j.cg && !j.cp) return json({ erreur: 'Couplé : coche Gagnant, Placé ou les deux.' }, 400);
        for (let i = 0; i < cc.length; i++) for (let k = i + 1; k < cc.length; k++) { if (j.cg) paris.push({ t: 'CG', c: [cc[i], cc[k]] }); if (j.cp) paris.push({ t: 'CP', c: [cc[i], cc[k]] }); }
      }
    }
    if (!paris.length) return json({ erreur: 'Indique au moins un cheval en jeu simple ou en couplé.' }, 400);
    chevaux = [...new Set([...sc, ...cc])];
    ticket = { jeu: true, mise, paris, petit };
    cout = Math.round(paris.length * mise * 100) / 100;
    type = 'jeu';
  } else if (b.type === 'ticket') {
    const t = b.ticket || {};
    if (!NTT.PARIS[t.pari]) return json({ erreur: 'Pari inconnu.' }, 400);
    if (!(c.droits.paris || []).includes(t.pari)) return json({ erreur: `Tu n'as pas (encore) le droit de publier des tickets ${t.pari}.` }, 403);
    if (!course.paris.includes(t.pari)) return json({ erreur: `Le ${t.pari} n'est pas proposé sur cette course.` }, 400);
    if (!NTT.FORMULES[t.formule]) return json({ erreur: 'Formule inconnue.' }, 400);
    const L = (a) => (Array.isArray(a) ? a : []).map(num).filter(Boolean);
    ticket = { pari: t.pari, formule: t.formule, chevaux: L(t.chevaux), bases: L(t.bases), associes: L(t.associes), mise: Math.round(Number(t.mise) * 100) / 100, auteur: c.signature };
    if (Array.isArray(t.spec)) ticket.spec = t.spec.map((x) => (x === 'X' ? 'X' : num(x))).filter(Boolean);
    if (!(ticket.mise > 0)) return json({ erreur: 'Indique la mise par combinaison.' }, 400);
    const nb = NTT.combinaisons(ticket, course.partants);
    if (!nb) return json({ erreur: 'Ce ticket ne fait aucune combinaison : vérifie les chevaux et la formule.' }, 400);
    cout = Math.round(NTT.cout(ticket, course.partants) * 100) / 100;
    type = 'ticket';
    // champ réduit : le nom des chevaux de base, affiché sous le ticket
    const B = ticket.formule === 'reduit' ? ticket.bases : ticket.formule === 'positions' ? (ticket.spec || []).filter((x) => x !== 'X') : [];
    if (B.length) try {
      const parts = await get(`${BASE}/${iso.split('-').reverse().join('')}/R${r}/C${cn}/participants`);
      const noms = {}; for (const h of (parts && parts.participants) || []) if (B.includes(h.numPmu)) noms[h.numPmu] = h.nom;
      if (Object.keys(noms).length) ticket.noms = noms;
    } catch (e) {}
  } else return json({ erreur: 'Type inconnu.' }, 400);
  await db.prepare(`INSERT INTO td_pubs (date, r, c, hippodrome, course, auteur_id, signature, type, chevaux, ticket, cout, joue, commentaire) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(iso, r, cn, reu.h, course.libelle, u.id, c.signature, type, chevaux ? JSON.stringify(chevaux) : null, ticket ? JSON.stringify(ticket) : null, cout, b.joue ? 1 : 0, commentaire).run();
  return json({ ok: true, cout });
}
