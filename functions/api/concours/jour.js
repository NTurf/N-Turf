import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours, initCorrections, calculerSiPret, courseDuJour, ajouterRobots, jourConcours, isoVersFr, misesDu, miseDu, formatDu, syntheseCollective } from '../../_concours.js';

// Le concours Quinté+ d'un jour : la course, mon pronostic ; après la course, les pronostics de tous
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Réservé aux membres.' }, 401);
  const q = new URL(request.url).searchParams.get('date');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : await jourConcours(db);
  let j = null, erreurPmu = false;
  try { j = (await calculerSiPret(db, iso)) || (await courseDuJour(db, iso)); } catch (e) { erreurPmu = true; }
  if (j && j.statut !== 'calcule') { try { await ajouterRobots(db, iso, j); } catch (e) {} }
  const moi = await db.prepare('SELECT chevaux, retenu, gains, detail, saisi FROM concours_pronos WHERE date = ? AND user_id = ?').bind(iso, u.id).first();
  const out = { admin: u.role === 'admin', date: iso, dateFr: isoVersFr(iso), maintenant: Date.now(), mises: misesDu(iso), miseJour: miseDu(iso), format: formatDu(iso), erreurPmu, course: null, moi: null, tous: null };
  if (j) {
    out.course = { reunion: j.reunion, course: j.course, hippodrome: j.hippodrome, libelle: j.libelle, heure: j.heure,
      cloture: j.heure ? j.heure - 5 * 60000 : null, partants: JSON.parse(j.partants || '[]'), arrivee: JSON.parse(j.arrivee || '[]'),
      calcule: j.statut === 'calcule', rapports: j.rapports ? JSON.parse(j.rapports) : null };
  }
  if (moi) out.moi = { chevaux: JSON.parse(moi.chevaux), retenu: moi.retenu ? JSON.parse(moi.retenu) : null, gains: moi.gains, detail: moi.detail ? JSON.parse(moi.detail) : null, saisi: moi.saisi };
  // Les pronostics des autres : visibles dès que le joueur a validé le sien (et par tous une fois la course calculée)
  const calc = j && j.statut === 'calcule';
  if (j && (moi || calc || u.role === 'admin')) {
    await initCorrections(db);
    const corr = new Set(((await db.prepare('SELECT DISTINCT user_id FROM concours_corrections WHERE date = ?').bind(iso).all()).results || []).map((x) => x.user_id));
    const rows = (await db.prepare(`SELECT u.id, u.pseudo, u.role, p.chevaux, p.retenu, p.gains, p.detail, p.saisi FROM concours_pronos p JOIN users u ON u.id = p.user_id WHERE p.date = ?`).bind(iso).all()).results || [];
    out.tous = rows.map((r) => ({ pseudo: r.pseudo, robot: r.role === 'robot', chevaux: JSON.parse(r.chevaux), saisi: r.role === 'robot' ? null : r.saisi, corrige: corr.has(r.id),
      retenu: calc && r.retenu ? JSON.parse(r.retenu) : null, gains: calc ? r.gains || 0 : null, net: calc ? Math.round(((r.gains || 0) - miseDu(iso)) * 100) / 100 : null, detail: calc && r.detail ? JSON.parse(r.detail) : [] }))
      .sort((a, b) => calc ? (b.gains - a.gains || a.pseudo.localeCompare(b.pseudo)) : ((a.robot - b.robot) || String(a.saisi).localeCompare(String(b.saisi))));
    out.synthese = await syntheseCollective(db, iso);
  }
  // l'analyse des grilles : ouverte à ceux qui ont validé leur pronostic du jour (ou du lendemain), et à l'administrateur
  const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  out.grilles = u.role === 'admin' || !!(await db.prepare('SELECT 1 FROM concours_pronos WHERE user_id = ? AND date >= ? LIMIT 1').bind(u.id, auj).first());
  out.participants = (await db.prepare('SELECT COUNT(*) AS n FROM concours_pronos WHERE date = ?').bind(iso).first()).n;
  // archives : les jours du concours, du plus récent au plus ancien (le jour en cours en tête)
  const courant = await jourConcours(db);
  out.jourCourant = courant;
  out.jours = ((await db.prepare('SELECT DISTINCT date FROM concours_pronos WHERE date <= ? ORDER BY date DESC LIMIT 200').bind(courant).all()).results || []).map((x) => x.date);
  if (!out.jours.includes(courant)) out.jours.unshift(courant);
  return json(out);
}
