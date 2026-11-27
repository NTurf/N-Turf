import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initTd, ticketsQuinte } from '../../_td.js';
// Contre-contrôle des calculs (administrateur) : pour chaque jour de tickets du Quinté+, les rapports reçus du PMU,
// ceux que le site a su lire, et toute combinaison gagnante dont le rapport n'a pas été trouvé.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initTd(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  const L = await ticketsQuinte(env.DB);
  return json({ jours: L.slice(-10).reverse().map((j) => ({ date: j.date, final: !!j.final, arrivee: j.arrivee || [], manque: j.manque || [], lus: j.lus || [], bruts: j.bruts || [],
    tickets: (j.tickets || []).map((t) => ({ auteur: t.auteur, pari: t.pari, mise: t.mise, gagne: t.gagne, detail: t.detail || [] })) })) });
}
