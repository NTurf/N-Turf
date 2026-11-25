import { json, initDb, noDb } from '../_auth.js';
import { initConcours, parisJour, bornesMois, classement } from '../_concours.js';
import { prepPm } from '../_pm.js';

// Médailles du mois : les 3 premiers membres du concours Quinté+ (Globe de Cristal)
// et les 3 premiers des Pronos des membres. Affichées à côté de leur pseudo sur tout le site.
// Les joueurs du site (TCR, ALGO…) n'ont jamais de médaille.
export async function onRequestGet({ env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  const out = { quinte: {}, pronos: {} };
  try {
    await initDb(db); await initConcours(db);
    const [m1, m2] = bornesMois(parisJour());
    const L = (await classement(db, m1, m2, true)).liste.filter((x) => !x.robot).slice(0, 3);
    L.forEach((x, i) => { out.quinte[x.pseudo] = i + 1; });
  } catch (e) {}
  try {
    await prepPm(db);
    const mois = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 7);
    const r = await db.prepare(`SELECT u.pseudo FROM pm_pronos p JOIN users u ON u.id = p.user_id
      WHERE p.statut = 'calcule' AND u.banni = 0 AND u.role != 'robot' AND substr(p.jour, 1, 7) = ?
      GROUP BY p.user_id ORDER BY (SUM(p.gains) - SUM(p.mise)) DESC, SUM(p.gains) DESC LIMIT 3`).bind(mois).all();
    (r.results || []).forEach((x, i) => { out.pronos[x.pseudo] = i + 1; });
  } catch (e) {}
  return json(out, 200, { 'cache-control': 'public, max-age=300' });
}
