import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours, calculerSiPret, courseDuJour, ajouterRobots, parisJour, isoVersFr, MISE, MISE_JOUR, classementJour } from '../../_concours.js';

// Le concours Quinté+ d'un jour : la course, mon pronostic ; après la course, les pronostics de tous
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Réservé aux membres.' }, 401);
  const q = new URL(request.url).searchParams.get('date');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : parisJour();
  let j = null, erreurPmu = false;
  try { j = (await calculerSiPret(db, iso)) || (await courseDuJour(db, iso)); } catch (e) { erreurPmu = true; }
  if (j && j.statut !== 'calcule') { try { await ajouterRobots(db, iso, j); } catch (e) {} }
  const moi = await db.prepare('SELECT chevaux, retenu, gains, detail, saisi FROM concours_pronos WHERE date = ? AND user_id = ?').bind(iso, u.id).first();
  const out = { date: iso, dateFr: isoVersFr(iso), maintenant: Date.now(), mises: MISE, miseJour: MISE_JOUR, erreurPmu, course: null, moi: null, tous: null };
  if (j) {
    out.course = { reunion: j.reunion, course: j.course, hippodrome: j.hippodrome, libelle: j.libelle, heure: j.heure,
      cloture: j.heure ? j.heure - 5 * 60000 : null, partants: JSON.parse(j.partants || '[]'), arrivee: JSON.parse(j.arrivee || '[]'),
      calcule: j.statut === 'calcule', rapports: j.rapports ? JSON.parse(j.rapports) : null };
  }
  if (moi) out.moi = { chevaux: JSON.parse(moi.chevaux), retenu: moi.retenu ? JSON.parse(moi.retenu) : null, gains: moi.gains, detail: moi.detail ? JSON.parse(moi.detail) : null, saisi: moi.saisi };
  // Les pronostics des autres ne sont visibles qu'une fois la course validée et calculée
  if (j && j.statut === 'calcule') {
    const rows = (await db.prepare(`SELECT u.pseudo, u.role, p.chevaux, p.retenu, p.gains, p.detail FROM concours_pronos p JOIN users u ON u.id = p.user_id WHERE p.date = ?`).bind(iso).all()).results || [];
    out.tous = rows.map((r) => ({ pseudo: r.pseudo, robot: r.role === 'robot', chevaux: JSON.parse(r.chevaux), retenu: r.retenu ? JSON.parse(r.retenu) : null, gains: r.gains || 0, net: Math.round(((r.gains || 0) - MISE_JOUR) * 100) / 100, detail: r.detail ? JSON.parse(r.detail) : [] }))
      .sort((a, b) => b.gains - a.gains || a.pseudo.localeCompare(b.pseudo));
  }
  out.participants = (await db.prepare('SELECT COUNT(*) AS n FROM concours_pronos WHERE date = ?').bind(iso).first()).n;
  return json(out);
}
