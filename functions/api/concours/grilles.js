import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours } from '../../_concours.js';
import { analyseGrilles } from '../../_grilles.js';
// Analyse des grilles de 5 à 8 chevaux (point 5C), publiée sur la page du Concours Quinté+.
// Visible par les joueurs qui ont validé leur pronostic du Quinté+ du jour (ou du lendemain, une fois la course du jour courue),
// et toujours par l'administrateur.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initConcours(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Réservé aux membres.', verrou: 'membre' }, 401);
  if (u.role !== 'admin') {
    const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const a = await env.DB.prepare("SELECT 1 FROM concours_pronos WHERE user_id = ? AND date >= ? LIMIT 1").bind(u.id, auj).first();
    if (!a) return json({ erreur: 'Valide ton pronostic du Quinté+ du jour pour voir l\'analyse des grilles.', verrou: 'prono' }, 403);
  }
  return json(await analyseGrilles(env.DB));
}
