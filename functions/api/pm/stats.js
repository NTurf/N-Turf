import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { preparer } from '../../_pmu.js';
import { prepPm, verifierEnAttente } from '../../_pm.js';
import { statsPm } from '../../_pm_stats.js';

// Statistiques des Pronos des membres. Chacun voit toujours sa propre fiche ;
// les fiches des autres, le tableau comparatif et les classements sont réservés à ceux qui donnent au moins 3 pronos par jour
// (même règle que le reste de la page ; administrateur et modérateurs toujours).
const MIN_JOUR = 3;
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await preparer(db); await prepPm(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Connectez-vous.' }, 401);
  try { await verifierEnAttente(db); } catch (e) {}
  const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM pm_pronos WHERE user_id = ? AND jour = ?').bind(u.id, auj).first()).n || 0;
  const ok = u.role === 'admin' || !!u.moderateur || n >= MIN_JOUR;
  const s = await statsPm(db);
  const moi = s.membres.find((x) => x.id === u.id) || null;
  s.membres.forEach((x) => { delete x.id; });
  if (!ok) return json({ verrou: { n, min: MIN_JOUR }, moiPseudo: u.pseudo, types: s.types, ordre: s.ordre, min: s.min, membres: moi ? [moi] : [], specialites: null });
  return json({ ...s, moiPseudo: u.pseudo });
}
