import { json, initDb, currentUser, peutPublier, ecrireContenu, noDb } from '../../_auth.js';

// Réception du Quinté lu dans le fichier Excel (administrateur seulement)
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!peutPublier(u)) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  const txt = JSON.stringify(d);
  if (txt.length > 200000) return json({ erreur: 'Données trop volumineuses.' }, 400);
  if (!d || !Array.isArray(d.synthese)) return json({ erreur: 'Synthèse absente.' }, 400);
  await ecrireContenu(env.DB, 'quinte', d);
  // gardé aussi par date (arrivée, rapports) pour le bilan cumulé des tickets
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d.date || '')) {
    await ecrireContenu(env.DB, 'quinte-' + d.date.split('/').reverse().join('-'), d);
  }
  return json({ ok: true });
}
