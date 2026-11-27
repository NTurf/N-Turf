// TICKET DU JOUR (cahier des charges, point 4) : le journal hippique quotidien de N-TURF.
// Plusieurs contributeurs autorisés publient leurs pronostics et leurs tickets course par course,
// sans validation préalable ; l'administrateur peut supprimer après coup (modération a posteriori).
// Tout est enregistré sous forme de données (pas d'images) pour les statistiques de chaque contributeur.
import { BASE, cache, get, preparer, lotCache, lireRapports } from './_pmu.js';
import NTT from './_ntt.js';
import { evaluer } from './_pm.js';
import { lireContenu, ecrireContenu } from './_auth.js';

export const PARIS = Object.keys(NTT.PARIS); // Tiercé, Quarté+, Quinté+, Multi, 2 sur 4, Trio, Super 4
// Codes PMU de chaque pari, pour ne proposer que ce qui existe sur la course
const CODES = { 'Tiercé': ['TIERCE'], 'Quarté+': ['QUARTE_PLUS'], 'Quinté+': ['QUINTE_PLUS'], 'Multi': ['MULTI', 'MINI_MULTI'], '2 sur 4': ['DEUX_SUR_QUATRE'], 'Trio': ['TRIO'], 'Super 4': ['SUPER_QUATRE'] };
export const CHARTE = "La rubrique Ticket du jour fonctionne sur le principe de la publication libre par les contributeurs autorisés, avec modération a posteriori. L'administrateur conserve le droit de supprimer toute publication qu'il estime inadaptée ou ne correspondant pas à l'esprit de la rubrique.";
export const auj = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
const pmuDate = (iso) => iso.split('-').reverse().join('');
const r2 = (x) => Math.round(x * 100) / 100;

let pret = false;
export async function initTd(db) {
  if (pret) return;
  await preparer(db);
  await db.batch([
    // droits : { pronos: bool, paris: [liste des paris permis] } — modifiables à tout moment par l'administrateur
    db.prepare(`CREATE TABLE IF NOT EXISTS td_contributeurs (user_id INTEGER PRIMARY KEY, signature TEXT NOT NULL, droits TEXT NOT NULL,
      actif INTEGER NOT NULL DEFAULT 1, accepte TEXT, cree TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS td_pubs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, r INTEGER NOT NULL, c INTEGER NOT NULL,
      hippodrome TEXT, course TEXT, auteur_id INTEGER NOT NULL, signature TEXT NOT NULL, type TEXT NOT NULL, chevaux TEXT, ticket TEXT,
      cout REAL, joue INTEGER NOT NULL DEFAULT 0, commentaire TEXT, cree TEXT NOT NULL DEFAULT (datetime('now')),
      supprime INTEGER NOT NULL DEFAULT 0, supprime_par INTEGER, supprime_quand TEXT, motif TEXT, resultat TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS td_pubs_date ON td_pubs (date, r, c)'),
  ]);
  pret = true;
}

// Le contributeur (ou null). L'administrateur est toujours contributeur : « Choix de Bruno », tous les droits.
export async function contributeur(db, u) {
  if (!u) return null;
  await initTd(db);
  let c = await db.prepare('SELECT * FROM td_contributeurs WHERE user_id = ?').bind(u.id).first();
  if (!c && u.role === 'admin') {
    await db.prepare('INSERT OR IGNORE INTO td_contributeurs (user_id, signature, droits) VALUES (?, ?, ?)').bind(u.id, 'Choix de Bruno', JSON.stringify({ pronos: true, paris: PARIS })).run();
    c = await db.prepare('SELECT * FROM td_contributeurs WHERE user_id = ?').bind(u.id).first();
  }
  if (!c || !c.actif) return null;
  return { ...c, droits: JSON.parse(c.droits || '{}') };
}

// Programme d'un jour : réunions, courses (numéro, nom, heure, paris proposés, partants, arrivée)
export async function programme(db, iso) {
  const d = pmuDate(iso);
  const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
  return ((prog && prog.programme && prog.programme.reunions) || []).map((r) => ({
    r: r.numOfficiel, h: (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || ('R' + r.numOfficiel),
    france: !r.pays || !r.pays.code || r.pays.code === 'FRA',
    courses: (r.courses || []).map((c) => {
      const codes = (c.paris || []).map((p) => p.codePari);
      return { c: c.numOrdre, libelle: c.libelle || '', heure: Number(c.heureDepart) || 0, partants: c.nombreDeclaresPartants || 0,
        discipline: c.discipline || '', distance: c.distance || null,
        quinte: codes.includes('QUINTE_PLUS'), pick5: codes.some((x) => /PICK/.test(x)),
        paris: PARIS.filter((p) => CODES[p].some((k) => codes.includes(k))),
        arrivee: Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [] };
    }),
  }));
}
export const trouver = (P, r, c) => { const R = P.find((x) => x.r === r); return R && R.courses.find((x) => x.c === c); };

// Résultat d'un pronostic (liste de chevaux dans l'ordre) face à l'arrivée officielle
export function resultatProno(L, arr) {
  const t3 = arr.slice(0, 3), t4 = arr.slice(0, 4), t5 = arr.slice(0, 5);
  const dans = (T) => T.length && T.every((h) => L.includes(h));
  return { gagnant: L[0] === arr[0], place: t3.includes(L[0]), dans3: t3.filter((h) => L.includes(h)).length,
    trio: t3.length === 3 && dans(t3), multi: t4.length === 4 && dans(t4), quinte: t5.length === 5 && dans(t5), gagnantCite: L.includes(arr[0]) };
}

// Calcule les publications dont la course est courue et les rapports définitifs publiés (une fois pour toutes)
export async function resoudre(db, iso, P) {
  const att = (await db.prepare('SELECT * FROM td_pubs WHERE date = ? AND supprime = 0 AND resultat IS NULL').bind(iso).all()).results || [];
  if (!att.length) return;
  const now = Date.now(), d = pmuDate(iso), cles = new Map();
  for (const p of att) { const c = trouver(P, p.r, p.c); if (c && c.heure < now && c.arrivee.length >= 3) cles.set(`${p.r}-${p.c}`, c); }
  if (!cles.size) return;
  const items = [];
  for (const k of cles.keys()) {
    const [r, c] = k.split('-');
    items.push({ cle: `tdrap-${d}-R${r}C${c}`, url: `${BASE}/${d}/R${r}/C${c}/rapports-definitifs`, ttl: (x) => (Array.isArray(x) && x.some((b) => b.typePari === 'SIMPLE_PLACE') ? 86400 : 0) });
    items.push({ cle: `tdpart-${d}-R${r}C${c}`, url: `${BASE}/${d}/R${r}/C${c}/participants`, ttl: () => 3600 });
  }
  const L = await lotCache(db, items), faits = [];
  for (const p of att) {
    const k = `${p.r}-${p.c}`, c = cles.get(k); if (!c) continue;
    const [r, cc] = k.split('-');
    const blocs = L.get(`tdrap-${d}-R${r}C${cc}`);
    if (!Array.isArray(blocs) || !blocs.some((b) => b.typePari === 'SIMPLE_PLACE')) continue;
    const parts = L.get(`tdpart-${d}-R${r}C${cc}`);
    const partants = ((parts && parts.participants) || []).filter((x) => x.statut !== 'NON_PARTANT').length || c.partants;
    const raps = lireRapports(blocs), arr = c.arrivee;
    let res;
    if (p.type === 'coeur') {
      // 1 € gagnant + 1 € placé sur le coup de cœur, aux rapports officiels
      const n = JSON.parse(p.chevaux || '[]')[0], rang = arr.indexOf(n) + 1;
      let g = 0, pl = 0;
      for (const x of raps) { if (x.nom === 'Gagnant' && rang === 1) g = x.euros; const m = String(x.nom).match(/^Placé\s+(\d+)$/); if (m && +m[1] === n) pl = x.euros; }
      res = { arrivee: arr.slice(0, 5), rang: rang || null, gagne: r2(g), place: r2(pl), mise: 2 };
    } else if (p.type === 'jeu') {
      const t = JSON.parse(p.ticket || '{}'), np = ((parts && parts.participants) || []).filter((x) => x.statut === 'NON_PARTANT').map((x) => x.numPmu);
      const ev = evaluer(t.paris || [], blocs, np, arr), m = t.mise || 1;
      const NOM = { SG: 'Gagnant', SP: 'Placé', CG: 'Couplé gagnant', CP: 'Couplé placé', CO: 'Couplé ordre' };
      res = { arrivee: arr.slice(0, 5), mise: r2(ev.mise * m), gagne: r2(ev.gains * m), detail: ev.detail.filter((x) => x.r > 0 || x.np).map((x) => `${NOM[x.t] || x.t} ${x.c.join('-')} : ${x.np ? 'remboursé' : (x.r * m).toFixed(2).replace('.', ',') + ' €'}`) };
    }
    else if (p.type === 'prono') res = { arrivee: arr.slice(0, 5), ...resultatProno(JSON.parse(p.chevaux || '[]'), arr) };
    else {
      const t = JSON.parse(p.ticket || '{}');
      const g = NTT.gains(t, arr, raps, partants);
      if (g && g.attente) continue; // un rapport manque encore : on réessaiera
      const mise = r2(NTT.cout(t, partants));
      res = { arrivee: arr.slice(0, 5), mise, gagne: r2(g ? g.gagne : 0), detail: g ? g.detail : [] };
    }
    faits.push([JSON.stringify(res), p.id]);
  }
  for (let i = 0; i < faits.length; i += 20) {
    const lot = faits.slice(i, i + 20);
    await db.prepare(`UPDATE td_pubs SET resultat = CASE id ${lot.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${lot.map(() => '?').join(',')})`)
      .bind(...lot.flatMap((x) => [x[1], x[0]]), ...lot.map((x) => x[1])).run();
  }
}

// Les tickets du Quinté+ publiés par le fichier N-Turf (Choix Bruno…), gardés jour par jour (« tickets-AAAA-MM-JJ ») :
// calculés une fois pour toutes avec l'arrivée et les rapports définitifs du PMU, pour les statistiques du Ticket du jour.
export async function ticketsQuinte(db) {
  const L = (await db.prepare("SELECT cle FROM contenu WHERE cle LIKE 'tickets-____-__-__' ORDER BY cle").all()).results || [];
  const out = [];
  let appelsPmu = 0;
  for (const { cle } of L) {
    const iso = cle.slice(8);
    let r = await lireContenu(db, 'tdq-' + iso);
    if (!r || !r.final) {
      if (iso > auj() || appelsPmu >= 4) continue; // pas encore couru, ou assez d'appels pour cette fois
      const T = await lireContenu(db, cle);
      if (!T || !Array.isArray(T.tickets) || !T.tickets.length) continue;
      appelsPmu++;
      try {
        const P = await programme(db, iso), now = Date.now();
        let R = null, C = null;
        for (const re of P) for (const c of re.courses) if (c.quinte) { R = re; C = c; }
        if (!C || C.heure > now || C.arrivee.length < 5) continue;
        const d = pmuDate(iso);
        const blocs = await cache(db, `tdqrap-${d}`, 600, () => get(`${BASE}/${d}/R${R.r}/C${C.c}/rapports-definitifs`));
        if (!Array.isArray(blocs) || !blocs.some((b) => b.typePari === 'SIMPLE_PLACE')) continue;
        const parts = await cache(db, `tdqpart-${d}`, 3600, () => get(`${BASE}/${d}/R${R.r}/C${C.c}/participants`));
        const partants = ((parts && parts.participants) || []).filter((x) => x.statut !== 'NON_PARTANT').length || C.partants;
        const raps = lireRapports(blocs), arr = C.arrivee;
        let attente = false;
        const tk = T.tickets.map((t) => {
          const g = NTT.gains(t, arr, raps, partants); if (g && g.attente) attente = true;
          const manuel = t.gainManuel !== undefined && t.gainManuel !== null && t.gainManuel !== '';
          return { auteur: t.auteur || 'N-TURF', pari: t.pari, mise: r2(NTT.cout(t, partants)), gagne: r2(manuel ? parseFloat(t.gainManuel) || 0 : (g ? g.gagne : 0)), detail: g ? g.detail : [] };
        });
        r = { final: !attente, date: iso, arrivee: arr.slice(0, 5), tickets: tk };
        if (r.final) await ecrireContenu(db, 'tdq-' + iso, r);
      } catch (e) { continue; }
    }
    out.push(r);
  }
  return out;
}

// Statistiques de chaque contributeur : seulement les publications non supprimées, faites avant la course, et calculées
export async function statsContributeurs(db) {
  const rows = (await db.prepare(`SELECT signature, auteur_id, type, joue, resultat FROM td_pubs WHERE supprime = 0 AND resultat IS NOT NULL`).all()).results || [];
  const S = new Map();
  for (const p of rows) {
    const k = p.auteur_id;
    const x = S.get(k) || { signature: p.signature, pronos: 0, gagnant: 0, place: 0, gagnantCite: 0, trio: 0, multi: 0, quinte: 0,
      coeurs: { n: 0, gagnants: 0, places: 0, mises: 0, gains: 0 }, tickets: { reel: { n: 0, gagnants: 0, mises: 0, gains: 0 }, theorique: { n: 0, gagnants: 0, mises: 0, gains: 0 } } };
    x.signature = p.signature;
    const r = JSON.parse(p.resultat);
    if (p.type === 'coeur') {
      const k2 = x.coeurs; k2.n++; if (r.rang === 1) k2.gagnants++; if (r.place > 0) k2.places++; k2.mises = r2(k2.mises + 2); k2.gains = r2(k2.gains + (r.gagne || 0) + (r.place || 0));
    } else if (p.type === 'prono') {
      x.pronos++; if (r.gagnant) x.gagnant++; if (r.place) x.place++; if (r.gagnantCite) x.gagnantCite++;
      if (r.trio) x.trio++; if (r.multi) x.multi++; if (r.quinte) x.quinte++;
    } else {
      const t = x.tickets[p.joue ? 'reel' : 'theorique'];
      t.n++; t.mises = r2(t.mises + (r.mise || 0)); t.gains = r2(t.gains + (r.gagne || 0)); if (r.gagne > 0) t.gagnants++;
    }
    S.set(k, x);
  }
  // + les tickets du Quinté+ du fichier N-Turf : ceux signés « Choix Bruno » comptent pour Choix de Bruno (l'administrateur)
  const adm = await db.prepare("SELECT c.user_id, c.signature FROM td_contributeurs c JOIN users u ON u.id = c.user_id WHERE u.role = 'admin' LIMIT 1").first();
  const vide = (sig) => ({ signature: sig, pronos: 0, gagnant: 0, place: 0, gagnantCite: 0, trio: 0, multi: 0, quinte: 0,
    coeurs: { n: 0, gagnants: 0, places: 0, mises: 0, gains: 0 }, tickets: { reel: { n: 0, gagnants: 0, mises: 0, gains: 0 }, theorique: { n: 0, gagnants: 0, mises: 0, gains: 0 } } });
  let TQ = []; try { TQ = await ticketsQuinte(db); } catch (e) { TQ = []; }
  for (const jour of TQ) for (const t of jour.tickets) {
    const k = /bruno/i.test(t.auteur) && adm ? adm.user_id : 'f-' + t.auteur;
    const x = S.get(k) || vide(/bruno/i.test(t.auteur) && adm ? adm.signature : t.auteur);
    const q = x.ticketsQuinte || (x.ticketsQuinte = { n: 0, gagnants: 0, mises: 0, gains: 0, jours: new Set() });
    q.n++; q.mises = r2(q.mises + t.mise); q.gains = r2(q.gains + t.gagne); if (t.gagne > 0) q.gagnants++; q.jours.add(jour.date);
    S.set(k, x);
  }
  for (const x of S.values()) if (x.ticketsQuinte) x.ticketsQuinte.jours = x.ticketsQuinte.jours.size;
  const nb = (a) => a.pronos + a.coeurs.n + a.tickets.reel.n + a.tickets.theorique.n + (a.ticketsQuinte ? a.ticketsQuinte.n : 0);
  return [...S.values()].sort((a, b) => nb(b) - nb(a));
}

export { NTT };
