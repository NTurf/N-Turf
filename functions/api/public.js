import { json, initDb, lireContenu, noDb } from '../_auth.js';

// Ce que voit tout le monde sur l'accueil : 3 premiers de la synthèse, arrivée, bandeau
export async function onRequestGet({ env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const q = await lireContenu(env.DB, 'quinte');
  if (!q) return json({ quinte: null, bandeau: [] });
  const top3 = (q.synthese || []).slice(0, 3);
  const bandeau = [];
  if (q.arrivee && q.arrivee.length) {
    bandeau.push(`Quinté+ du ${q.date} : arrivée ${q.arrivee.join(' - ')}`);
    const dans = top3.filter((n) => q.arrivee.includes(n));
    if (dans.length) bandeau.push(`Nos 3 premiers de la synthèse : ${dans.length} sur 3 à l'arrivée (${dans.join(', ')})`);
  }
  return json({
    quinte: { date: q.date, discipline: q.discipline, partants: q.partants, top3, arrivee: q.arrivee || [] },
    bandeau,
    maj: q.maj,
  });
}
