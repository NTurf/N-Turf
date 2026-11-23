import { json, initDb, lireContenu, noDb } from '../_auth.js';
import { BASE, norm, cache, get, preparer, lireRapports } from '../_pmu.js';
import { resultatsFanny } from '../_fanny.js';
import { cpcAvecCoeurs } from '../_coeurs.js';
import { initConcours, calculerSiPret, parisJour, dernierJourCalcule, classementJour, isoVersFr } from '../_concours.js';

const eur = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' €';
const rang = (r) => (r + 1) + (r ? 'e' : 'er');
const aujourdhui = () => new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

// Les touches du jour sur le course par course, d'après les arrivées du PMU
async function touchesDuJour(db, cpc) {
  const out = [];
  if (!cpc || !Array.isArray(cpc.reunions) || cpc.date !== aujourdhui()) return out;
  const d = cpc.date.split('/').join('');
  const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
  const reunions = (prog && prog.programme && prog.programme.reunions) || [];
  let appels = 0;
  for (const re of cpc.reunions) {
    const h = norm(re.brut || re.hippodrome);
    const pr = reunions.find((r) => { const a = norm(r.hippodrome && r.hippodrome.libelleCourt), b = norm(r.hippodrome && r.hippodrome.libelleLong); return (a && (a.includes(h) || h.includes(a))) || (b && (b.includes(h) || h.includes(b))); });
    if (!pr) continue;
    for (const c of re.courses || []) {
      const num = parseInt(String(c.course).replace(/\D/g, ''), 10);
      const pc = (pr.courses || []).find((x) => x.numOrdre === num);
      if (!pc || !Array.isArray(pc.ordreArrivee) || !pc.ordreArrivee.length) continue;
      const arr = pc.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x);
      const s = c.synthese || [], w = arr[0], r = s.indexOf(w);
      const multi = arr.length >= 4 && arr.slice(0, 4).every((n) => s.includes(n));
      const coeur = (c.choix || []).includes(w);
      if (!(r >= 0 && r < 3) && !multi && !coeur) continue;
      let raps = [];
      if (appels < 8) { appels++; raps = lireRapports(await cache(db, `rap-${d}-R${pr.numOfficiel}C${num}`, 120, () => get(`${BASE}/${d}/R${pr.numOfficiel}/C${num}/rapports-definitifs`))); }
      const sg = raps.find((x) => x.nom === 'Gagnant'), m4 = raps.find((x) => /multi en 4/i.test(x.nom));
      const lieu = `${re.hippodrome} ${c.course}`;
      if (coeur) out.push(`❤ ${lieu} : le ${w}, coup de cœur de Bruno, gagne${sg ? ' (' + eur(sg.euros) + ' le gagnant)' : ''} !`);
      else if (r >= 0 && r < 3) out.push(`${lieu} : le ${w}, ${rang(r)} de notre synthèse, gagne${sg ? ' (' + eur(sg.euros) + ' le gagnant)' : ''}`);
      if (multi) out.push(`${lieu} : les 4 premiers sont dans notre synthèse, Multi en 4${m4 ? ' à ' + eur(m4.euros) : ''}`);
    }
  }
  return out;
}

// Le bilan de la veille, d'après l'historique du fichier course par course
function bilanVeille(arch) {
  const L = (arch && arch.courses) || [];
  const auj = aujourdhui().split('/').reverse().join('-');
  const iso = (x) => String(x || '').split('/').reverse().join('-');
  const veille = L.map((c) => iso(c.d)).filter((x) => x < auj).sort().pop();
  if (!veille) return [];
  const J = L.filter((c) => iso(c.d) === veille);
  const g3 = J.filter((c) => { const r = c.s.indexOf(c.a[0]); return r >= 0 && r < 3; }).length;
  const m4 = J.filter((c) => c.a.length >= 4 && c.a.slice(0, 4).every((n) => c.s.includes(n)));
  const out = [`Hier (${veille.split('-').reverse().join('/')}) : le gagnant était dans nos 3 premiers ${g3} fois sur ${J.length} courses`];
  m4.sort((a, b) => (Number(b.m4) || 0) - (Number(a.m4) || 0)).slice(0, 4).forEach((c) => {
    out.push(`Hier, ${c.h} ${c.c} : les 4 premiers dans notre synthèse${Number(c.m4) > 0 ? ', Multi en 4 à ' + eur(Number(c.m4)) : ''}`);
  });
  return out;
}

// Ce que voit tout le monde : 3 premiers de la synthèse du Quinté+, arrivées, bandeau défilant
export async function onRequestGet({ env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await preparer(db);
  const q = await lireContenu(db, 'quinte');
  const cpc = await cpcAvecCoeurs(db, 'cpc', 'coeurs');
  const arrivees = [];
  if (cpc && Array.isArray(cpc.reunions)) {
    for (const re of cpc.reunions) for (const c of re.courses || []) {
      if (c.arrivee && c.arrivee.length) arrivees.push({ hippodrome: re.hippodrome, course: c.course, arrivee: c.arrivee.slice(0, 4) });
    }
  }
  const reunionsJour = cpc && Array.isArray(cpc.reunions) ? cpc.reunions.map((r) => ({ hippodrome: r.hippodrome, brut: r.brut || r.hippodrome })) : [];
  const dateCpc = cpc ? cpc.date : '';

  // Bandeau : calculé au plus une fois par minute
  let bandeau = [];
  try {
    bandeau = await cache(db, 'bandeau', 60, async () => {
      const b = [];
      if (q && q.arrivee && q.arrivee.length) {
        b.push(`Quinté+ du ${q.date} : arrivée ${q.arrivee.join(' - ')}`);
        const dans = (q.synthese || []).slice(0, 3).filter((n) => q.arrivee.includes(n));
        if (dans.length) b.push(`Quinté+ : ${dans.length} de nos 3 premiers à l'arrivée (${dans.join(', ')})`);
      }
      else {
        // Pas encore d'arrivée aujourd'hui : on rappelle le Quinté+ de la veille
        const auj = 'quinte-' + aujourdhui().split('/').reverse().join('-');
        const r = await db.prepare("SELECT data FROM contenu WHERE cle LIKE 'quinte-%' AND cle < ? ORDER BY cle DESC LIMIT 1").bind(auj).first();
        const v = r ? JSON.parse(r.data) : null;
        if (v && v.arrivee && v.arrivee.length) {
          b.push(`Hier, Quinté+ du ${v.date} : arrivée ${v.arrivee.join(' - ')}`);
          const dans = (v.synthese || []).slice(0, 5).filter((n) => v.arrivee.includes(n));
          if (dans.length) b.push(`Quinté+ du ${v.date} : ${dans.length} des 5 premiers de notre synthèse à l'arrivée (${dans.join(', ')})`);
        }
      }
      // Concours Quinté+ : calcul dès l'arrivée validée, puis le podium du jour dans le bandeau
      try {
        await initConcours(db); await calculerSiPret(db, parisJour());
        const dj = await dernierJourCalcule(db);
        if (dj) {
          const L = await classementJour(db, dj);
          if (L.length) b.push(`Concours Quinté+ du ${isoVersFr(dj)} : ` + L.slice(0, 3).map((x, i) => `${i + 1}${i ? 'e' : 'er'} ${x.pseudo} (${x.net >= 0 ? '+' : ''}${eur(x.net).replace(' €', ' fers')})`).join(', '));
        }
      } catch (e) {}
      // Repérés de Fanny : ses gagnants et ses couplés gagnants du jour
      try {
        const f = await resultatsFanny(db, await lireContenu(db, 'fanny'));
        if (f && f.date === aujourdhui()) for (const l of f.lignes || []) {
          if (l.gagnant) b.push(`Fanny, ${l.h} C${l.c} : le ${l.gagnant.n} gagne${l.gagnant.euros ? ' (' + eur(l.gagnant.euros) + ' le gagnant)' : ''}`);
          if (l.cg) b.push(`Fanny, ${l.h} C${l.c} : couplé gagnant${l.cg.euros ? ' à ' + eur(l.cg.euros) : ''}`);
        }
      } catch (e) {}
      let jour = [];
      try { jour = await touchesDuJour(db, cpc); } catch (e) { jour = []; }
      b.push(...jour);
      if (!jour.length) b.push(...bilanVeille(await lireContenu(db, 'cpc_archive')));
      b.push('N-TURF : pronostics Quinté+ et course par course, mises et résultats en toute transparence');
      return b;
    });
  } catch (e) { bandeau = ['N-TURF : pronostics Quinté+ et course par course, mises et résultats en toute transparence']; }

  if (!q) return json({ quinte: null, bandeau, arrivees, reunionsJour, dateCpc });
  return json({
    quinte: { date: q.date, discipline: q.discipline, partants: q.partants, top3: (q.synthese || []).slice(0, 3), arrivee: q.arrivee || [] },
    bandeau, arrivees, reunionsJour, dateCpc, maj: q.maj,
  });
}
