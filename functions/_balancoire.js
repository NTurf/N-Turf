// LA BALANÇOIRE — jeu privé de l'équipe, intégré au site.
// Règles (validées par Bruno, reprises sans rien changer) :
//  - Chaque jour, 100 neurones prêtés par la banque. Jeu Simple (gagnant / placé) sur les réunions PMU en France.
//  - Le joueur joue la totalité de sa cagnotte ; si sa répartition ne fait pas le total, on complète en placé sur ses chevaux.
//  - Retour PMU (mise × rapport pour 1) arrondi au multiple de 5 inférieur.
//  - Cagnotte du lendemain = retour arrondi + 100 (tout perdu : on repart à 100). La dette = total des 100 prêtés.
//  - Palier 1, dès un retour de 1 500 : le joueur rembourse toute sa dette, puis la banque retire 100 chaque jour
//    (cagnotte du lendemain = retour − 100). Mises obligatoires : 1 200 en Simple + 200 en couplé placé sur 2 chevaux. On ne redescend pas.
//  - Palier 2, dès un retour de 2 000 : en plus, 500 en report (placé sur placé, 2 chevaux de la même réunion). Toujours − 100 par jour.
import { BASE, cache, get, preparer, lotCache } from './_pmu.js';
import { lireRapportsConcours } from './_concours.js';

export const PALIER1 = 1500, PALIER2 = 2000, PRET = 100;
const r2 = (x) => Math.round(x * 100) / 100;
export const arrondi5 = (x) => Math.floor((Number(x) || 0) / 5 + 1e-9) * 5;
export const auj = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
export const lendemainIso = (iso) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const pmuDate = (iso) => iso.split('-').reverse().join('');

let pret = false;
export async function initBal(db) {
  if (pret) return;
  await preparer(db);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS bal_joueurs (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL UNIQUE,
      user_id INTEGER UNIQUE, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bal_etat (date TEXT NOT NULL, joueur_id INTEGER NOT NULL, cagnotte REAL NOT NULL,
      palier INTEGER NOT NULL DEFAULT 0, dette REAL NOT NULL DEFAULT 0, dette_connue INTEGER NOT NULL DEFAULT 0,
      mise REAL, retour REAL, lendemain REAL, note TEXT, PRIMARY KEY (date, joueur_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bal_jeux (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, joueur_id INTEGER NOT NULL,
      type TEXT NOT NULL, r INTEGER NOT NULL, c INTEGER NOT NULL, n1 INTEGER NOT NULL, c2 INTEGER, n2 INTEGER, mise REAL NOT NULL,
      retour REAL, detail TEXT, auto INTEGER NOT NULL DEFAULT 0, saisi TEXT NOT NULL DEFAULT (datetime('now')), par INTEGER)`),
    db.prepare('CREATE INDEX IF NOT EXISTS bal_jeux_date ON bal_jeux (date, joueur_id)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS bal_jours (date TEXT PRIMARY KEY, statut TEXT NOT NULL DEFAULT 'ouvert', texte TEXT, maj TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS bal_trace (id INTEGER PRIMARY KEY AUTOINCREMENT, quand TEXT NOT NULL DEFAULT (datetime('now')), par INTEGER, action TEXT, detail TEXT)`),
    db.prepare('CREATE TABLE IF NOT EXISTS bal_meta (cle TEXT PRIMARY KEY, val TEXT)'),
  ]);
  // 27/11/2026 : Bruno remet les compteurs à zéro (l'historique d'avant le site n'est pas repris). Fait une seule fois.
  const z = await db.prepare("SELECT val FROM bal_meta WHERE cle = 'remise_a_zero'").first();
  if (!z) {
    await db.batch([
      db.prepare('DELETE FROM bal_jeux'), db.prepare('DELETE FROM bal_etat'), db.prepare('DELETE FROM bal_jours'), db.prepare('DELETE FROM bal_joueurs'),
      db.prepare("INSERT INTO bal_meta (cle, val) VALUES ('remise_a_zero', datetime('now'))"),
    ]);
  }
  pret = true;
}

// Qui a accès : l'administrateur, et les joueurs actifs reliés à un compte du site. Pour les autres, l'espace n'existe pas.
export async function acces(db, u) {
  if (!u) return null;
  await initBal(db);
  const j = await db.prepare('SELECT id, nom FROM bal_joueurs WHERE user_id = ? AND actif = 1').bind(u.id).first();
  if (u.role === 'admin') return { admin: true, joueur: j || null };
  return j ? { admin: false, joueur: j } : null;
}
export const trace = (db, par, action, detail) => db.prepare('INSERT INTO bal_trace (par, action, detail) VALUES (?, ?, ?)').bind(par, action, JSON.stringify(detail)).run();

// ---------- Programme du jour (réunions en France) ----------
export async function programme(db, iso) {
  const d = pmuDate(iso);
  const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
  return ((prog && prog.programme && prog.programme.reunions) || [])
    .filter((r) => !r.pays || !r.pays.code || r.pays.code === 'FRA')
    .map((r) => ({ r: r.numOfficiel, h: (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || ('R' + r.numOfficiel),
      courses: (r.courses || []).map((c) => ({ c: c.numOrdre, heure: Number(c.heureDepart) || 0, libelle: c.libelle || '', partants: c.nombreDeclaresPartants || 0,
        arrivee: Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [] })) }));
}
const trouver = (P, r, c) => { const R = P.find((x) => x.r === r); return R && R.courses.find((x) => x.c === c); };
// Heure à partir de laquelle un jeu ne peut plus être posé ni changé : départ de sa (première) course
export const depart = (P, j) => { const c = trouver(P, j.r, j.c); return c ? c.heure : 0; };

// ---------- Calcul d'un jeu ----------
// R : rapports (lireRapportsConcours) ; np : non-partants. Rapports pour 1 €, appliqués tels quels aux neurones.
function evaluer(j, C) {
  const A = C[`${j.r}-${j.c}`];
  if (!A) return null; // rapports pas encore là
  const lib = (x) => String(x).replace('.', ',');
  if (j.type === 'G' || j.type === 'P') {
    if (A.np.includes(j.n1)) return { retour: j.mise, detail: `le ${j.n1} non-partant : mise rendue` };
    const rap = j.type === 'G' ? A.R.g[j.n1] : A.R.p[j.n1];
    return rap ? { retour: r2(j.mise * rap), detail: `${j.type === 'G' ? 'gagnant' : 'placé'} à ${lib(rap)}` } : { retour: 0, detail: 'perdu' };
  }
  if (j.type === 'CP') {
    if (A.np.includes(j.n1) || A.np.includes(j.n2)) return { retour: j.mise, detail: 'non-partant : mise rendue' };
    if (!A.aCP) return { retour: j.mise, detail: 'pas de couplé placé sur cette course : mise rendue' };
    const k = [j.n1, j.n2].sort((a, b) => a - b).join('-'), rap = A.R.cp[k];
    return rap ? { retour: r2(j.mise * rap), detail: `couplé placé ${k} à ${lib(rap)}` } : { retour: 0, detail: 'perdu' };
  }
  if (j.type === 'REP') {
    if (A.np.includes(j.n1)) return { retour: j.mise, detail: `le ${j.n1} non-partant : mise rendue` };
    const p1 = A.R.p[j.n1];
    if (!p1) return { retour: 0, detail: `le ${j.n1} non placé en C${j.c}` };
    const B = C[`${j.r}-${j.c2}`];
    if (!B) return null;
    const m2 = r2(j.mise * p1);
    if (B.np.includes(j.n2)) return { retour: m2, detail: `placé à ${lib(p1)}, le ${j.n2} non-partant : report rendu` };
    const p2 = B.R.p[j.n2];
    return p2 ? { retour: r2(m2 * p2), detail: `placé à ${lib(p1)} puis placé à ${lib(p2)}` } : { retour: 0, detail: `placé à ${lib(p1)}, mais le ${j.n2} non placé en C${j.c2}` };
  }
  return { retour: 0, detail: '?' };
}

// Calcule les jeux d'un jour dont les rapports définitifs sont publiés, puis, si tout est calculé, la journée (cagnottes du lendemain)
export async function calculerJour(db, iso, P) {
  const jour = await db.prepare('SELECT statut FROM bal_jours WHERE date = ?').bind(iso).first();
  if (jour && jour.statut === 'clos') return;
  const att = (await db.prepare('SELECT * FROM bal_jeux WHERE date = ? AND retour IS NULL').bind(iso).all()).results || [];
  if (att.length) {
    const now = Date.now(), d = pmuDate(iso), besoin = new Set();
    for (const j of att) { besoin.add(`${j.r}-${j.c}`); if (j.type === 'REP') besoin.add(`${j.r}-${j.c2}`); }
    // seulement les courses déjà parties
    const cles = [...besoin].filter((k) => { const [r, c] = k.split('-').map(Number), x = trouver(P, r, c); return x && x.heure && x.heure < now; });
    const items = [];
    for (const k of cles) {
      const [r, c] = k.split('-');
      items.push({ cle: `balrap-${d}-R${r}C${c}`, url: `${BASE}/${d}/R${r}/C${c}/rapports-definitifs`, ttl: (x) => (Array.isArray(x) && x.some((b) => b.typePari === 'SIMPLE_PLACE') ? 86400 : 0) });
      items.push({ cle: `balpart-${d}-R${r}C${c}`, url: `${BASE}/${d}/R${r}/C${c}/participants`, ttl: () => 600 });
    }
    const L = items.length ? await lotCache(db, items) : new Map();
    const C = {};
    for (const k of cles) {
      const [r, c] = k.split('-');
      const blocs = L.get(`balrap-${d}-R${r}C${c}`);
      if (!Array.isArray(blocs) || !blocs.some((b) => b.typePari === 'SIMPLE_PLACE')) continue;
      const parts = L.get(`balpart-${d}-R${r}C${c}`);
      C[k] = { R: lireRapportsConcours(blocs), aCP: blocs.some((b) => b.typePari === 'COUPLE_PLACE'),
        np: ((parts && parts.participants) || []).filter((p) => p.statut === 'NON_PARTANT').map((p) => p.numPmu) };
    }
    const faits = [];
    for (const j of att) { const e = evaluer(j, C); if (e) faits.push({ id: j.id, ...e }); }
    // une seule requête par lot de 20 jeux
    for (let i = 0; i < faits.length; i += 20) {
      const lot = faits.slice(i, i + 20);
      await db.prepare(`UPDATE bal_jeux SET retour = CASE id ${lot.map(() => 'WHEN ? THEN ?').join(' ')} END, detail = CASE id ${lot.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${lot.map(() => '?').join(',')})`)
        .bind(...lot.flatMap((x) => [x.id, x.retour]), ...lot.flatMap((x) => [x.id, x.detail]), ...lot.map((x) => x.id)).run();
    }
    if (faits.length < att.length) return; // il reste des courses à attendre
  }
  await cloreSiPret(db, iso);
}

// La journée se clôt quand tous les jeux posés sont calculés et que chaque joueur actif a joué
// (ou, pour un jour passé, dès que tout ce qui a été posé est calculé).
export async function cloreSiPret(db, iso) {
  const etats = (await db.prepare('SELECT e.*, j.actif FROM bal_etat e JOIN bal_joueurs j ON j.id = e.joueur_id WHERE e.date = ?').bind(iso).all()).results || [];
  if (!etats.length) return;
  const jeux = (await db.prepare('SELECT joueur_id, mise, retour FROM bal_jeux WHERE date = ?').bind(iso).all()).results || [];
  if (!jeux.length || jeux.some((x) => x.retour === null)) return;
  const ont = new Set(jeux.map((x) => x.joueur_id));
  const passe = iso < auj();
  if (!passe && etats.some((e) => e.actif && !ont.has(e.joueur_id))) return;
  const demain = lendemainIso(iso), maj = [], suite = [];
  for (const e of etats) {
    const J = jeux.filter((x) => x.joueur_id === e.joueur_id);
    let palier = e.palier, dette = e.dette, note = '', lend, retour, mise;
    if (!J.length) { retour = null; mise = 0; lend = e.cagnotte; note = "n'a pas joué : cagnotte reportée telle quelle"; }
    else {
      mise = r2(J.reduce((s, x) => s + x.mise, 0));
      retour = arrondi5(J.reduce((s, x) => s + (x.retour || 0), 0));
      if (palier === 0 && retour >= PALIER1) {
        palier = retour >= PALIER2 ? 2 : 1;
        lend = retour - dette; note = `palier ${palier} atteint : rembourse sa dette de ${dette} à la banque` + (e.dette_connue ? '' : ' (dette de départ non renseignée : à vérifier)');
        dette = 0;
      } else if (palier >= 1) {
        if (palier === 1 && retour >= PALIER2) { palier = 2; note = 'palier 2 atteint'; }
        lend = retour - PRET; // la banque retire 100 chaque jour
        if (lend < 0) { lend = 0; note = (note ? note + ' · ' : '') + 'retour inférieur à 100 : cagnotte à 0, à trancher par l\'administrateur'; }
      } else { lend = retour + PRET; dette += PRET; }
    }
    if (!e.actif) continue;
    maj.push([e.joueur_id, mise, retour, lend, note]);
    suite.push([demain, e.joueur_id, lend, palier, dette, e.dette_connue]);
  }
  const q = [];
  for (const m of maj) q.push(db.prepare('UPDATE bal_etat SET mise = ?, retour = ?, lendemain = ?, note = ? WHERE date = ? AND joueur_id = ?').bind(m[1], m[2], m[3], m[4] || null, iso, m[0]));
  if (suite.length) q.push(db.prepare(`INSERT INTO bal_etat (date, joueur_id, cagnotte, palier, dette, dette_connue) VALUES ${suite.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}
    ON CONFLICT(date, joueur_id) DO UPDATE SET cagnotte = excluded.cagnotte, palier = excluded.palier, dette = excluded.dette, dette_connue = excluded.dette_connue`).bind(...suite.flat()));
  q.push(db.prepare(`INSERT INTO bal_jours (date, statut, maj) VALUES (?, 'clos', datetime('now')) ON CONFLICT(date) DO UPDATE SET statut = 'clos', maj = excluded.maj`).bind(iso));
  q.push(db.prepare(`INSERT OR IGNORE INTO bal_jours (date, statut, maj) VALUES (?, 'ouvert', datetime('now'))`).bind(demain));
  await db.batch(q);
}

// ---------- Contrôle d'une feuille de jeux ----------
// jeux : [{ type: G|P|CP|REP, r, c, n1, c2?, n2?, mise }] ; renvoie { jeux, ajout } ou { erreur }
export function controler(jeux, e, P, admin) {
  const now = Date.now(), out = [];
  if (!Array.isArray(jeux) || !jeux.length) return { erreur: 'Aucun jeu.' };
  for (const x of jeux) {
    const j = { type: String(x.type || ''), r: +x.r, c: +x.c, n1: +x.n1, c2: x.c2 ? +x.c2 : null, n2: x.n2 ? +x.n2 : null, mise: Math.round(Number(x.mise) * 100) / 100 };
    if (!['G', 'P', 'CP', 'REP'].includes(j.type)) return { erreur: 'Type de jeu inconnu.' };
    if (!(j.mise > 0)) return { erreur: 'Chaque jeu doit avoir une mise.' };
    const c = trouver(P, j.r, j.c);
    if (!c) return { erreur: `R${j.r}C${j.c} : course introuvable dans les réunions en France du jour.` };
    if (!(j.n1 >= 1 && (!c.partants || j.n1 <= c.partants))) return { erreur: `R${j.r}C${j.c} : numéro ${x.n1} invalide.` };
    if (j.type === 'CP' && (!(j.n2 >= 1) || j.n2 === j.n1 || (c.partants && j.n2 > c.partants))) return { erreur: `R${j.r}C${j.c} : il faut 2 chevaux différents pour le couplé placé.` };
    if (j.type === 'REP') {
      const c2 = trouver(P, j.r, j.c2);
      if (!c2 || j.c2 === j.c) return { erreur: 'Report : il faut une 2e course de la même réunion.' };
      if (c2.heure && c.heure && c2.heure < c.heure) return { erreur: 'Report : la 2e course doit partir après la 1re.' };
      if (!(j.n2 >= 1 && (!c2.partants || j.n2 <= c2.partants))) return { erreur: `Report : numéro ${x.n2} invalide en C${j.c2}.` };
    }
    if (!['G', 'P', 'CP', 'REP'].includes(j.type) || (j.type !== 'CP' && j.type !== 'REP' && j.n2)) j.n2 = null;
    if (j.type !== 'REP') j.c2 = null;
    if (!admin && c.heure && c.heure <= now) return { erreur: `R${j.r}C${j.c} est déjà partie : on ne peut plus la jouer.` };
    out.push(j);
  }
  // Sans palier : Simple uniquement. Le couplé placé s'ouvre au palier 1, le report au palier 2.
  if (out.some((j) => j.type === 'CP') && e.palier < 1) return { erreur: 'Le couplé placé n\'est ouvert qu\'à partir du palier 1 : sans palier, on joue en Simple uniquement.' };
  if (out.some((j) => j.type === 'REP') && e.palier < 2) return { erreur: 'Le report n\'est ouvert qu\'au palier 2 : sans palier, on joue en Simple uniquement.' };
  const tot = r2(out.reduce((s, j) => s + j.mise, 0));
  if (tot > e.cagnotte + 1e-9) return { erreur: `Tes jeux font ${tot} neurones, plus que ta cagnotte (${e.cagnotte}).` };
  // Paliers : mises obligatoires
  const somme = (t) => out.filter((j) => t.includes(j.type)).reduce((s, j) => s + j.mise, 0);
  if (e.palier >= 1 && somme(['CP']) !== 200) return { erreur: 'Palier ' + e.palier + ' : il faut 200 neurones en couplé placé sur 2 chevaux, chaque jour.' };
  if (e.palier >= 2 && somme(['REP']) !== 500) return { erreur: 'Palier 2 : il faut 500 neurones en report (placé sur placé, même réunion), chaque jour.' };
  // Toute la cagnotte doit être jouée : le reste est complété en placé sur ses chevaux joués en Simple
  let ajout = 0;
  const reste = r2(e.cagnotte - tot);
  if (reste > 0) {
    const vus = [];
    out.filter((j) => j.type === 'G' || j.type === 'P').forEach((j) => { if (!vus.some((v) => v.r === j.r && v.c === j.c && v.n1 === j.n1)) vus.push(j); });
    if (!vus.length) return { erreur: `Il manque ${reste} neurones pour jouer toute ta cagnotte, et aucun cheval en Simple pour les compléter en placé.` };
    const part = Math.floor(reste / vus.length / 5) * 5;
    vus.forEach((v, i) => {
      const m = i === vus.length - 1 ? r2(reste - part * (vus.length - 1)) : part;
      if (m <= 0) return;
      const p = out.find((j) => j.type === 'P' && j.r === v.r && j.c === v.c && j.n1 === v.n1);
      if (p) { p.mise = r2(p.mise + m); p.auto = (p.auto || 0) + m; } else out.push({ type: 'P', r: v.r, c: v.c, n1: v.n1, c2: null, n2: null, mise: m, auto: m });
    });
    ajout = reste;
  }
  if (e.palier >= 1 && somme(['G', 'P']) < 1200) return { erreur: `Palier ${e.palier} : il faut au moins 1 200 neurones en Simple.` };
  return { jeux: out, ajout };
}

// ---------- Accès donné par l'administrateur (Administration > Membres) ----------
// Activer un membre : il devient joueur (son nom = son pseudo) et démarre à 100 neurones prêtés par la banque.
export async function activer(db, user, oui) {
  await initBal(db);
  const j = await db.prepare('SELECT * FROM bal_joueurs WHERE user_id = ?').bind(user.id).first();
  if (!oui) { if (j) await db.prepare('UPDATE bal_joueurs SET actif = 0 WHERE id = ?').bind(j.id).run(); return; }
  let id = j && j.id;
  if (j) await db.prepare('UPDATE bal_joueurs SET actif = 1, nom = ? WHERE id = ?').bind(user.pseudo, j.id).run();
  else { const r = await db.prepare('INSERT INTO bal_joueurs (nom, user_id) VALUES (?, ?)').bind(user.pseudo, user.id).run(); id = r.meta.last_row_id; }
  await completerJour(db, auj());
}
// Chaque joueur actif doit avoir sa cagnotte du jour : celle du lendemain de sa dernière journée,
// ou sa dernière cagnotte s'il n'a pas joué, ou 100 s'il débute (100 prêtés par la banque).
export async function completerJour(db, iso) {
  const jr = await db.prepare('SELECT statut FROM bal_jours WHERE date = ?').bind(iso).first();
  if (jr && jr.statut === 'clos') return;
  const manque = (await db.prepare(`SELECT j.id FROM bal_joueurs j WHERE j.actif = 1 AND NOT EXISTS (SELECT 1 FROM bal_etat e WHERE e.date = ? AND e.joueur_id = j.id)`).bind(iso).all()).results || [];
  if (!manque.length) return;
  const q = [];
  for (const m of manque) {
    const der = await db.prepare('SELECT * FROM bal_etat WHERE joueur_id = ? AND date < ? ORDER BY date DESC LIMIT 1').bind(m.id, iso).first();
    const cag = der ? (der.lendemain != null ? der.lendemain : der.cagnotte) : PRET;
    q.push(db.prepare('INSERT OR IGNORE INTO bal_etat (date, joueur_id, cagnotte, palier, dette, dette_connue) VALUES (?, ?, ?, ?, ?, 1)')
      .bind(iso, m.id, cag, der ? der.palier : 0, der ? der.dette : PRET));
  }
  q.push(db.prepare("INSERT OR IGNORE INTO bal_jours (date, statut) VALUES (?, 'ouvert')").bind(iso));
  await db.batch(q);
}
