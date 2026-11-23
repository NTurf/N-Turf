import { json, initDb, currentUser, peutPublier, lireContenu, ecrireContenu, noDb } from '../../_auth.js';

// Journée préparée à l'avance : voir ce qui attend (GET) et basculer quand Bruno le décide (POST)
async function droit(env, request) {
  if (!env.DB) return false;
  await initDb(env.DB);
  return peutPublier(await currentUser(env.DB, request));
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  if (!(await droit(env, request))) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  const q = await lireContenu(env.DB, 'quinte_attente'), c = await lireContenu(env.DB, 'cpc_attente');
  return json({ quinte: q ? q.date || '?' : null, cpc: c ? c.date || '?' : null, cpcReunions: c && c.reunions ? c.reunions.map((r) => r.hippodrome) : [] });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  if (!(await droit(env, request))) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  const db = env.DB, fait = [];
  for (const cle of ['quinte', 'cpc']) {
    const d = await lireContenu(db, cle + '_attente');
    if (!d) continue;
    await ecrireContenu(db, cle, d);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d.date || '')) await ecrireContenu(db, cle + '-' + d.date.split('/').reverse().join('-'), d);
    await db.prepare('DELETE FROM contenu WHERE cle = ?').bind(cle + '_attente').run();
    fait.push(cle);
  }
  if (!fait.length) return json({ erreur: 'Aucune journée en attente.' }, 400);
  return json({ ok: true, fait });
}
