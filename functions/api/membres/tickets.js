import { json, initDb, currentUser, lireContenu, noDb } from '../../_auth.js';

// Les tickets du Quinté+. Ce sont toujours les derniers tickets publiés, avec le Quinté+ de LEUR jour (arrivée, rapports, partants).
// Quand le Quinté+ du lendemain est déjà en ligne mais pas encore ses tickets, ceux de la veille restent lisibles avec leur résultat
// (avant, ils disparaissaient de la page dès la publication du Quinté+ suivant).
const isoDe = (d) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d || '') ? d.split('/').reverse().join('-') : null);
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const t = await lireContenu(env.DB, 'tickets'), q = await lireContenu(env.DB, 'quinte');
  if (!t || !t.date || !q || !q.date || t.date === q.date) return json({ tickets: t, quinte: q });
  const iso = isoDe(t.date);
  const qt = (iso && (await lireContenu(env.DB, 'quinte-' + iso))) || { date: t.date };
  return json({ tickets: t, quinte: qt, veille: true, quinteDuJour: q.date });
}
