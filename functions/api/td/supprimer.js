import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initTd, programme, trouver } from '../../_td.js';

// Supprimer une publication : l'administrateur, à tout moment (modération a posteriori) ;
// son auteur, seulement avant le départ de la course. Une publication supprimée ne compte plus dans les statistiques.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initTd(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Réservé aux membres.' }, 401);
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  const p = await db.prepare('SELECT * FROM td_pubs WHERE id = ?').bind(parseInt(b.id, 10) || 0).first();
  if (!p || p.supprime) return json({ erreur: 'Publication introuvable.' }, 404);
  const admin = u.role === 'admin';
  if (!admin) {
    if (p.auteur_id !== u.id) return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
    let P = []; try { P = await programme(db, p.date); } catch (e) {}
    const c = trouver(P, p.r, p.c);
    if (!c || !c.heure || c.heure <= Date.now()) return json({ erreur: 'La course est partie : ta publication reste (seul l\'administrateur peut la retirer).' }, 400);
  }
  await db.prepare("UPDATE td_pubs SET supprime = 1, supprime_par = ?, supprime_quand = datetime('now'), motif = ? WHERE id = ?")
    .bind(u.id, String(b.motif || '').slice(0, 200) || null, p.id).run();
  return json({ ok: true });
}
