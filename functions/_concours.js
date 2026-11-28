// Concours Quinté+ N-TURF : règles validées par Bruno le 23/11/2026
// Monnaie : fers à cheval. Gain = rapport PMU pour 1 € × mise d'une combinaison.
import { BASE, cache, get, preparer } from './_pmu.js';
import { lireContenu } from './_auth.js';
import { limites, classer, chevauxFormule, estTrot } from './_formule.js';
import ETUDES from './_etude_liste.js';

// Deux formats, l'historique de l'ancien est gardé tel quel :
//  - jusqu'au 27/11/2026 : 7 chevaux + 1 complément (Quinté+ sur les 7 : 21 combinaisons, 42 fers) → 171,50 fers par jour
//  - à partir du 28/11/2026 : 8 chevaux, pas de complément ; Tiercé, Quarté+ et Quinté+ combinés sur les 8 (demande des membres)
//    Tiercé 56 combinaisons à 1 fer (56), Quarté+ 70 à 1,50 (105), Quinté+ 56 à 2 (112) → 370 fers par jour
export const DEBUT_8 = '2026-11-28';
export const formatDu = (iso) => (String(iso) >= DEBUT_8 ? 8 : 7);
export const misesDu = (iso) => formatDu(iso) === 8
  ? { sgp: 40, couple: 12, tierce: 56, quarte: 105, multi: 45, quinte: 112 }
  : { sgp: 40, couple: 12, tierce: 10, quarte: 22.5, multi: 45, quinte: 42 };
export const miseDu = (iso) => formatDu(iso) === 8 ? 370 : 171.5;
export const MISE = misesDu(DEBUT_8);
export const MISE_JOUR = 171.5; // ancien format (gardé pour l'historique)
const r2 = (x) => Math.round(x * 100) / 100;

export const parisJour = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }); // AAAA-MM-JJ
// Jour du concours : celui du Quinté+ d'aujourd'hui tant qu'il n'est pas calculé ;
// dès que ses rapports définitifs sont tombés (ou s'il n'y a pas de Quinté+ aujourd'hui), le concours passe au lendemain
export async function jourConcours(db) {
  const auj = parisJour();
  let j = null;
  try { j = await calculerSiPret(db, auj); } catch (e) {}
  if (j && j.statut !== 'calcule') return auj;
  const t = new Date(auj + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
export const isoVersPmu = (iso) => iso.split('-').reverse().join('');
export const isoVersFr = (iso) => iso.split('-').reverse().join('/');

export async function initConcours(db) {
  await preparer(db);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS concours_jours (
      date TEXT PRIMARY KEY, reunion INTEGER, course INTEGER, hippodrome TEXT, libelle TEXT, heure INTEGER,
      partants TEXT, arrivee TEXT, rapports TEXT, statut TEXT NOT NULL DEFAULT 'ouvert', maj TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS concours_pronos (
      date TEXT NOT NULL, user_id INTEGER NOT NULL, chevaux TEXT NOT NULL, saisi TEXT NOT NULL,
      retenu TEXT, gains REAL, detail TEXT, PRIMARY KEY (date, user_id))`),
  ]);
}

// ---------- Lecture des rapports PMU ----------
const n = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const val = (r) => (Number(r && r.dividendePourUnEuro) || 0) / 100;
const nums = (c) => String(c || '').split(/[^0-9]+/).filter(Boolean).map(Number);

export function lireRapportsConcours(blocs) {
  const R = { g: {}, p: {}, cg: {}, cp: {}, t: {}, qa: {}, qi: {}, m4: 0 };
  if (!Array.isArray(blocs)) return R;
  const pris = new Map();
  for (const b of blocs) {
    if (!b || !b.typePari) continue;
    const cur = pris.get(b.typePari);
    if (!cur || (cur.audience !== 'NATIONAL' && b.audience === 'NATIONAL')) pris.set(b.typePari, b);
  }
  const each = (k, f) => { const b = pris.get(k); if (b && !b.rembourse) (b.rapports || []).forEach((r) => { if (!String(r.combinaison || '').includes('NP')) f(r); }); };
  each('SIMPLE_GAGNANT', (r) => { const c = nums(r.combinaison)[0]; if (c) R.g[c] = val(r); });
  each('SIMPLE_PLACE', (r) => { const c = nums(r.combinaison)[0]; if (c) R.p[c] = val(r); });
  each('COUPLE_GAGNANT', (r) => { const c = nums(r.combinaison); if (c.length === 2) R.cg[c.sort((a, b) => a - b).join('-')] = val(r); });
  each('COUPLE_PLACE', (r) => { const c = nums(r.combinaison); if (c.length === 2) R.cp[c.sort((a, b) => a - b).join('-')] = val(r); });
  const ordreDes = (k, o) => each(k, (r) => {
    // Le PMU écrit « Quinté+ ordre », « Quarté+ désordre », « Bonus 4sur5 », « Bonus 3 », « Bonus »…
    const l = n(r.libelle), v = val(r);
    if (l.includes('bonus4sur5')) o.b45 = Math.max(o.b45 || 0, v);
    else if (l.includes('bonus4')) o.b4 = v;
    else if (l.includes('bonus3') || l.endsWith('bonus')) o.b3 = v;
    else if (l.endsWith('desordre')) o.d = v;
    else if (l.endsWith('ordre')) o.o = v;
  });
  ordreDes('TIERCE', R.t); ordreDes('QUARTE_PLUS', R.qa); ordreDes('QUINTE_PLUS', R.qi);
  each('MULTI', (r) => { if (/en4$/.test(n(r.libelle)) || n(r.libelle) === 'multien4') R.m4 = val(r); });
  return R;
}

// ---------- Non-partants ----------
// Format 8 : les non-partants sont simplement retirés (pas de complément).
// Format 7 (ancien) : le complément remplace le 1er non-partant.
export function pronoRetenu(ch, np, fmt) {
  const NP = new Set(np || []);
  if (fmt === 8) return ch.slice(0, 8).filter((x) => !NP.has(x));
  const p = ch.slice(0, 7), comp = ch[7];
  const i = p.findIndex((x) => NP.has(x));
  if (i < 0) return p;
  const out = [];
  p.forEach((x, k) => { if (k === i) { if (!NP.has(comp)) out.push(comp); } else if (!NP.has(x)) out.push(x); });
  return out;
}

function combis(a, k) {
  const out = [];
  (function rec(s, acc) { if (acc.length === k) { out.push(acc); return; } for (let i = s; i < a.length; i++) rec(i + 1, acc.concat(a[i])); })(0, []);
  return out;
}
// Ordre : les chevaux arrivés sont dans le même ordre que dans le classement du joueur
const dansLOrdre = (liste, top) => top.every((h, i) => i === 0 || liste.indexOf(top[i - 1]) < liste.indexOf(h));

// ---------- Calcul des gains d'un pronostic ----------
export function calculer(liste, arr, R, fmt) {
  const nQ = fmt === 8 ? 8 : 7; // chevaux joués au Quinté+
  const L = [], add = (pari, type, fers) => { if (fers > 0) L.push({ pari, type, fers: r2(fers) }); };
  const top = (k) => arr.slice(0, k);
  // SGP : chevaux 1 et 2, 4 fers gagnant + 16 fers placé chacun
  liste.slice(0, 2).forEach((h) => {
    if (arr[0] === h && R.g[h]) add('Simple', 'Gagnant du ' + h, R.g[h] * 4);
    if (R.p[h]) add('Simple', 'Placé du ' + h, R.p[h] * 16);
  });
  // Couplé : chevaux 1 à 3 (3 paires), 2 fers gagnant + 2 fers placé par paire
  combis(liste.slice(0, 3), 2).forEach((c) => {
    const k = c.slice().sort((a, b) => a - b).join('-');
    if (R.cg[k]) add('Couplé', 'Gagnant ' + k, R.cg[k] * 2);
    if (R.cp[k]) add('Couplé', 'Placé ' + k, R.cp[k] * 2);
  });
  const odr = (nom, sel, k, mise, o) => {
    const t = top(k);
    combis(sel, k).forEach((c) => {
      if (t.length === k && t.every((h) => c.includes(h))) {
        if (dansLOrdre(liste, t) && o.o) add(nom, 'Ordre', o.o * mise);
        else add(nom, 'Désordre', (o.d || 0) * mise);
      }
    });
  };
  // Tiercé : chevaux 1 à 5 (ancien format) ou les 8, combiné, 1 fer la combinaison
  odr('Tiercé', liste.slice(0, fmt === 8 ? 8 : 5), 3, 1, R.t);
  // Quarté+ : chevaux 1 à 6 (ancien format) ou les 8, combiné, 1,50 fer la combinaison, + bonus 3
  const s6 = liste.slice(0, 6), sQa = liste.slice(0, fmt === 8 ? 8 : 6);
  odr('Quarté+', sQa, 4, 1.5, R.qa);
  if (R.qa.b3 && arr.length >= 4) combis(sQa, 4).forEach((c) => {
    if (top(3).every((h) => c.includes(h)) && !c.includes(arr[3])) add('Quarté+', 'Bonus 3', R.qa.b3 * 1.5);
  });
  // Multi en 4 : chevaux 1 à 6, 3 fers la combinaison
  if (R.m4 && arr.length >= 4) combis(s6, 4).forEach((c) => { if (top(4).every((h) => c.includes(h))) add('Multi en 4', 'Multi en 4', R.m4 * 3); });
  // Quinté+ : chevaux 1 à 7 (ancien format) ou 1 à 8, combiné, 2 fers la combinaison, + bonus 4, 4 sur 5, 3
  odr('Quinté+', liste.slice(0, nQ), 5, 2, R.qi);
  if (arr.length >= 5) combis(liste.slice(0, nQ), 5).forEach((c) => {
    const k5 = top(5).filter((h) => c.includes(h)).length;
    if (k5 === 4) {
      if (top(4).every((h) => c.includes(h))) { if (R.qi.b4) add('Quinté+', 'Bonus 4', R.qi.b4 * 2); }
      else if (R.qi.b45) add('Quinté+', 'Bonus 4 sur 5', R.qi.b45 * 2);
    } else if (k5 === 3 && top(3).every((h) => c.includes(h)) && R.qi.b3) add('Quinté+', 'Bonus 3', R.qi.b3 * 2);
  });
  // Regroupe les lignes identiques (ex. plusieurs bonus 3)
  const g = [];
  L.forEach((x) => { const y = g.find((z) => z.pari === x.pari && z.type === x.type); if (y) { y.fers = r2(y.fers + x.fers); y.nb++; } else g.push({ ...x, nb: 1 }); });
  return { gains: r2(g.reduce((s, x) => s + x.fers, 0)), detail: g };
}

// ---------- Le Quinté+ du jour d'après le PMU ----------
export async function courseDuJour(db, iso) {
  const ligne = await db.prepare('SELECT * FROM concours_jours WHERE date = ?').bind(iso).first();
  if (ligne && ligne.statut === 'calcule') return ligne;
  const d = isoVersPmu(iso);
  const prog = await cache(db, 'prog-' + d, 60, () => get(`${BASE}/${d}`));
  for (const r of (prog && prog.programme && prog.programme.reunions) || []) {
    for (const c of r.courses || []) {
      if (!(c.paris || []).some((p) => p.codePari === 'QUINTE_PLUS')) continue;
      const parts = await cache(db, `part-${d}-R${r.numOfficiel}C${c.numOrdre}`, 600, () => get(`${BASE}/${d}/R${r.numOfficiel}/C${c.numOrdre}/participants`));
      const partants = ((parts && parts.participants) || []).map((p) => ({ n: p.numPmu, nom: p.nom, np: p.statut === 'NON_PARTANT' })).sort((a, b) => a.n - b.n);
      const arrivee = Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((x) => Array.isArray(x) ? x[0] : x) : [];
      const hippo = (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || '';
      await db.prepare(`INSERT INTO concours_jours (date, reunion, course, hippodrome, libelle, heure, partants, arrivee, maj) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(date) DO UPDATE SET reunion=excluded.reunion, course=excluded.course, hippodrome=excluded.hippodrome, libelle=excluded.libelle,
        heure=excluded.heure, partants=excluded.partants, arrivee=excluded.arrivee, maj=excluded.maj`)
        .bind(iso, r.numOfficiel, c.numOrdre, hippo, c.libelle || '', c.heureDepart || null, JSON.stringify(partants), JSON.stringify(arrivee)).run();
      return await db.prepare('SELECT * FROM concours_jours WHERE date = ?').bind(iso).first();
    }
  }
  return ligne || null;
}

// ---------- Les joueurs du site (TCR, ALGO, PERSO, Études Quinté, Formule du membre) ----------
// Ils jouent automatiquement, sont classés comme les membres, mais ne montent jamais sur le podium.
export const ROBOTS = [
  { cle: 'tcr', pseudo: 'TCR' }, { cle: 'algo', pseudo: 'ALGO' }, { cle: 'perso', pseudo: 'PERSO' },
  { cle: 'etudes', pseudo: 'Études Quinté' }, { cle: 'formule', pseudo: 'Formule du membre' },
];
async function idsRobots(db) {
  const out = {};
  for (const r of ROBOTS) {
    const mail = `robot-${r.cle}@n-turf.site`;
    let u = await db.prepare('SELECT id FROM users WHERE email = ?').bind(mail).first();
    if (!u) {
      // compte sans mot de passe utilisable : personne ne peut s'y connecter
      await db.prepare("INSERT OR IGNORE INTO users (pseudo, pseudo_lc, email, pass_hash, pass_salt, role) VALUES (?, ?, ?, '!', '!', 'robot')")
        .bind(r.pseudo, 'robot:' + r.cle, mail).run();
      u = await db.prepare('SELECT id FROM users WHERE email = ?').bind(mail).first();
    }
    if (u) out[r.cle] = u.id;
  }
  return out;
}
async function listesRobots(db, iso, j) {
  const partants = JSON.parse(j.partants || '[]').filter((p) => !p.np).map((p) => p.n);
  const huit = (L) => { const x = (L || []).map(Number).filter((n) => partants.includes(n)); return [...new Set(x)].slice(0, 8); };
  const out = {};
  const q = await lireContenu(db, 'quinte-' + iso);
  const ap = (q && q.approches) || {};
  out.tcr = huit(ap.TCR && ap.TCR.selection);
  out.algo = huit(ap.ALGO && ap.ALGO.selection);
  out.perso = huit((ap.PERSO && ap.PERSO.selection) || (q && q.perso));
  out.etudes = huit(ETUDES[iso]);
  try {
    // Formule du membre : seulement si le Quinté est au trot ; limite du recul s'il y en a un, sinon recul fictif
    const d = isoVersPmu(iso);
    const prog = await cache(db, 'prog-' + d, 600, () => get(`${BASE}/${d}`));
    const reu = ((prog && prog.programme && prog.programme.reunions) || []).find((r) => r.numOfficiel === j.reunion);
    const c = reu && (reu.courses || []).find((x) => x.numOrdre === j.course);
    if (c && estTrot(c)) {
      const parts = await cache(db, `part-${d}-R${j.reunion}C${j.course}`, 600, () => get(`${BASE}/${d}/R${j.reunion}/C${j.course}/participants`));
      const ch = chevauxFormule(parts);
      if (ch.length) {
        const lim = limites(c.conditions);
        const g = ch.map((h) => h.gains);
        const L = lim.recul ? lim.recul : Math.round((Math.min(...g) + Math.max(...g)) / 2);
        out.formule = huit(classer(ch, L).map((x) => x.n));
      }
    }
  } catch (e) {}
  return out;
}
// Inscrit (ou met à jour jusqu'à la clôture) le pronostic des joueurs du site
export async function ajouterRobots(db, iso, j) {
  if (!j) return;
  const ids = await idsRobots(db);
  const L = await listesRobots(db, iso, j);
  const ouvert = j.statut !== 'calcule' && j.heure && Date.now() < j.heure - 5 * 60000;
  const q = [];
  for (const r of ROBOTS) {
    const ch = L[r.cle];
    if (!ids[r.cle] || !ch || ch.length !== 8) continue;
    q.push(db.prepare(`INSERT INTO concours_pronos (date, user_id, chevaux, saisi) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(date, user_id) DO ${ouvert ? 'UPDATE SET chevaux = excluded.chevaux, saisi = excluded.saisi' : 'NOTHING'}`).bind(iso, ids[r.cle], JSON.stringify(ch)));
  }
  if (q.length) await db.batch(q);
}

// Calcule tous les pronostics du jour dès que les rapports définitifs sont publiés
export async function calculerSiPret(db, iso) {
  let j;
  try { j = await courseDuJour(db, iso); } catch (e) { return null; }
  if (!j || j.statut === 'calcule') return j;
  const arr = JSON.parse(j.arrivee || '[]');
  if (arr.length < 5) return j;
  const d = isoVersPmu(iso);
  // clé à part (rapq-) : jamais prolongée, on relit le PMU chaque minute jusqu'aux rapports Quinté+
  const blocs = await cache(db, `rapq-${d}-R${j.reunion}C${j.course}`, 60, () => get(`${BASE}/${d}/R${j.reunion}/C${j.course}/rapports-definitifs`));
  const R = lireRapportsConcours(blocs);
  if (!R.qi.d && !R.qi.o) return j; // rapports pas encore définitifs
  const np = JSON.parse(j.partants || '[]').filter((p) => p.np).map((p) => p.n);
  try { await ajouterRobots(db, iso, j); } catch (e) {}
  const pr = await db.prepare('SELECT user_id, chevaux FROM concours_pronos WHERE date = ?').bind(iso).all();
  const maj = [];
  for (const p of pr.results || []) {
    const ret = pronoRetenu(JSON.parse(p.chevaux), np, formatDu(iso));
    const c = calculer(ret, arr, R, formatDu(iso));
    maj.push(db.prepare('UPDATE concours_pronos SET retenu = ?, gains = ?, detail = ? WHERE date = ? AND user_id = ?')
      .bind(JSON.stringify(ret), c.gains, JSON.stringify(c.detail), iso, p.user_id));
  }
  maj.push(db.prepare("UPDATE concours_jours SET rapports = ?, statut = 'calcule', maj = datetime('now') WHERE date = ?").bind(JSON.stringify(R), iso));
  await db.batch(maj);
  try { await db.prepare("DELETE FROM pmu_cache WHERE cle = 'bandeau'").run(); } catch (e) {}
  return await db.prepare('SELECT * FROM concours_jours WHERE date = ?').bind(iso).first();
}

// ---------- Classements : gains moins mises ----------
// À partir de son premier pronostic (du mois pour le Globe), la mise du jour (171,50 ou 370 fers selon le format) est retirée chaque jour de Quinté+ calculé, joué ou non.
function ajoute(iso, k) { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); }
export function bornesSemaine(iso) { const t = new Date(iso + 'T12:00:00Z'); const j = (t.getUTCDay() + 6) % 7; return [ajoute(iso, -j), ajoute(iso, 6 - j)]; }
export function bornesMois(iso) { const [a, m] = iso.split('-').map(Number); const fin = new Date(Date.UTC(a, m, 0)).getUTCDate(); return [`${a}-${String(m).padStart(2, '0')}-01`, `${a}-${String(m).padStart(2, '0')}-${String(fin).padStart(2, '0')}`]; }

export async function classement(db, du, au, depuisDebutPeriode) {
  const jours = ((await db.prepare("SELECT date FROM concours_jours WHERE statut = 'calcule' AND date BETWEEN ? AND ? ORDER BY date").bind(du, au).all()).results || []).map((x) => x.date);
  const rows = (await db.prepare(`SELECT p.user_id, u.pseudo, u.role, p.date, p.gains FROM concours_pronos p JOIN users u ON u.id = p.user_id
    WHERE p.date BETWEEN ? AND ?`).bind(depuisDebutPeriode ? du : '0000', au).all()).results || [];
  const premiers = new Map();
  const tous = (await db.prepare('SELECT user_id, MIN(date) AS d FROM concours_pronos GROUP BY user_id').all()).results || [];
  tous.forEach((x) => premiers.set(x.user_id, x.d));
  const J = new Map();
  for (const r of rows) {
    if (r.date < du) continue;
    let x = J.get(r.user_id);
    if (!x) { x = { id: r.user_id, pseudo: r.pseudo, robot: r.role === 'robot', gains: 0, joues: 0 }; J.set(r.user_id, x); }
    if (jours.includes(r.date)) { x.gains += r.gains || 0; x.joues++; }
  }
  const out = [];
  for (const x of J.values()) {
    // premier pronostic : dans la période pour le Globe (mois), depuis toujours pour la semaine
    const debut = depuisDebutPeriode
      ? (rows.filter((r) => r.user_id === x.id && r.date >= du).map((r) => r.date).sort()[0] || du)
      : (premiers.get(x.id) || du);
    const comptes = jours.filter((d) => d >= debut);
    const compte = comptes.length;
    if (!compte) continue;
    const mises = r2(comptes.reduce((s, d) => s + miseDu(d), 0));
    out.push({ pseudo: x.pseudo, id: x.id, robot: x.robot, joues: x.joues, jours: compte, mises, gains: r2(x.gains), net: r2(x.gains - mises) });
  }
  out.sort((a, b) => b.net - a.net || b.gains - a.gains || a.pseudo.localeCompare(b.pseudo));
  return { jours, liste: out };
}

export async function classementJour(db, iso) {
  const rows = (await db.prepare(`SELECT u.id, u.pseudo, u.role, p.gains FROM concours_pronos p JOIN users u ON u.id = p.user_id WHERE p.date = ?`).bind(iso).all()).results || [];
  return rows.map((r) => ({ id: r.id, pseudo: r.pseudo, robot: r.role === 'robot', joues: 1, jours: 1, mises: miseDu(iso), gains: r2(r.gains || 0), net: r2((r.gains || 0) - miseDu(iso)) }))
    .sort((a, b) => b.net - a.net || a.pseudo.localeCompare(b.pseudo));
}

export async function dernierJourCalcule(db) {
  const r = await db.prepare("SELECT date FROM concours_jours WHERE statut = 'calcule' ORDER BY date DESC LIMIT 1").first();
  return r ? r.date : null;
}

// ---------- Corrections exceptionnelles de l'administrateur (toujours tracées) ----------
export async function initCorrections(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS concours_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, user_id INTEGER NOT NULL, ancien TEXT, nouveau TEXT NOT NULL,
    motif TEXT, par INTEGER NOT NULL, quand TEXT NOT NULL DEFAULT (datetime('now')))`).run();
}

// ---------- Synthèse collective des pronostics des membres ----------
// Brute : combien de joueurs citent chaque cheval (et à quel rang en moyenne).
// Pondérée : chaque citation vaut le « poids » du joueur, calculé sur ses courses passées du concours :
//   on compte combien de ses 8 chevaux finissent dans les 5 premiers, course après course.
//   Un nouveau joueur part à 1 (comme tout le monde) ; son poids ne bouge que petit à petit,
//   car on lui ajoute 10 courses « moyennes » fictives : il faut beaucoup de courses pour peser lourd.
//   Le poids reste entre 0,5 et 2.
export const K_FIABILITE = 10;
export async function poidsJoueurs(db, avant) {
  const rows = (await db.prepare(`SELECT p.user_id, p.chevaux, j.arrivee FROM concours_pronos p
    JOIN concours_jours j ON j.date = p.date JOIN users u ON u.id = p.user_id
    WHERE j.statut = 'calcule' AND p.date < ? AND u.role != 'robot'`).bind(avant).all()).results || [];
  const S = new Map(); let tot = 0, nb = 0;
  for (const r of rows) {
    const top5 = JSON.parse(r.arrivee || '[]').slice(0, 5), ch = JSON.parse(r.chevaux || '[]');
    const t = ch.filter((h) => top5.includes(h)).length;
    const x = S.get(r.user_id) || { courses: 0, touches: 0 }; x.courses++; x.touches += t; S.set(r.user_id, x);
    tot += t; nb++;
  }
  const moy = nb ? tot / nb : 0;
  const out = new Map();
  for (const [id, x] of S) {
    const lisse = moy ? (x.touches + K_FIABILITE * moy) / (x.courses + K_FIABILITE) : 0;
    const poids = moy ? Math.min(2, Math.max(0.5, lisse / moy)) : 1;
    out.set(id, { courses: x.courses, touches: x.touches, poids: Math.round(poids * 100) / 100 });
  }
  return { parJoueur: out, moyenne: Math.round(moy * 100) / 100, courses: nb };
}

export async function syntheseCollective(db, iso) {
  const rows = (await db.prepare(`SELECT p.user_id, u.pseudo, p.chevaux FROM concours_pronos p JOIN users u ON u.id = p.user_id
    WHERE p.date = ? AND u.role != 'robot'`).bind(iso).all()).results || [];
  const N = rows.length;
  const P = await poidsJoueurs(db, iso);
  const C = new Map();
  const joueurs = [];
  for (const r of rows) {
    const ch = JSON.parse(r.chevaux || '[]');
    const pj = P.parJoueur.get(r.user_id) || { courses: 0, touches: 0, poids: 1 };
    joueurs.push({ pseudo: r.pseudo, courses: pj.courses, touches: pj.touches, poids: pj.poids });
    ch.forEach((h, i) => {
      const x = C.get(h) || { n: h, nb: 0, rangs: 0, points: 0 };
      x.nb++; x.rangs += i + 1; x.points += pj.poids; C.set(h, x);
    });
  }
  const L = [...C.values()].map((x) => ({ n: x.n, nb: x.nb, rangMoyen: Math.round(x.rangs / x.nb * 10) / 10, points: Math.round(x.points * 10) / 10 }));
  const brute = L.slice().sort((a, b) => b.nb - a.nb || a.rangMoyen - b.rangMoyen || a.n - b.n);
  const ponderee = L.slice().sort((a, b) => b.points - a.points || a.rangMoyen - b.rangMoyen || a.n - b.n);
  const seuil = Math.ceil(N / 2);
  return {
    participants: N,
    brute, ponderee,
    consensus: N >= 2 ? brute.filter((x) => x.nb >= seuil).map((x) => x.n) : [],
    divergences: N >= 2 ? brute.filter((x) => x.nb === 1).map((x) => x.n) : [],
    joueurs: joueurs.sort((a, b) => b.poids - a.poids || b.courses - a.courses || a.pseudo.localeCompare(b.pseudo)),
    moyenne: P.moyenne, coursesHistorique: P.courses, k: K_FIABILITE,
  };
}
