import { json, initDb, currentUser, peutPublier, noDb } from '../../_auth.js';

// Reprise de la feuille « Archive » du fichier N-Turf : chaque Quinté+ passé devient un jour des Archives du site.
// On n'ajoute QUE les jours absents : un jour déjà présent (publié le jour même) n'est jamais remplacé.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!peutPublier(u)) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  const L = (Array.isArray(b.jours) ? b.jours : []).filter((d) => d && /^\d{2}\/\d{2}\/\d{4}$/.test(d.date || '') && Array.isArray(d.lignes && d.lignes.A));
  if (!L.length) return json({ ok: true, ajoutes: 0 });
  if (JSON.stringify(L).length > 900000) return json({ erreur: 'Trop de données en une fois.' }, 400);
  const cles = L.map((d) => 'quinte-' + d.date.split('/').reverse().join('-'));
  const deja = new Set(((await env.DB.prepare(`SELECT cle FROM contenu WHERE cle IN (${cles.map(() => '?').join(',')})`).bind(...cles).all()).results || []).map((r) => r.cle));
  const neufs = L.map((d, i) => [cles[i], d]).filter((x) => !deja.has(x[0]));
  for (let i = 0; i < neufs.length; i += 40) {
    const lot = neufs.slice(i, i + 40);
    await env.DB.prepare(`INSERT OR IGNORE INTO contenu (cle, data) VALUES ${lot.map(() => '(?, ?)').join(', ')}`).bind(...lot.flatMap((x) => [x[0], JSON.stringify(x[1])])).run();
  }
  return json({ ok: true, ajoutes: neufs.length, deja: deja.size });
}
