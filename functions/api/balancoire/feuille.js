import { entrer, json } from './_commun.js';
import { auj, programme, controler, depart, trace } from '../../_balancoire.js';

// Poser (ou reposer) sa feuille de jeux du jour. Elle se verrouille au départ de sa première course.
// L'administrateur peut poser la feuille de n'importe quel joueur (jeux dictés), même après un départ : c'est tracé.
export async function onRequestPost({ request, env }) {
  const x = await entrer(request, env); if (x.refus) return x.refus;
  const { db, u, a } = x;
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  const iso = a.admin && /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : auj();
  const jid = a.admin && b.joueur ? parseInt(b.joueur, 10) : (a.joueur && a.joueur.id);
  if (!jid) return json({ erreur: 'Aucun joueur.' }, 400);
  const jr = await db.prepare('SELECT statut FROM bal_jours WHERE date = ?').bind(iso).first();
  if (jr && jr.statut === 'clos') return json({ erreur: 'Cette journée est close.' }, 400);
  const e = await db.prepare('SELECT * FROM bal_etat WHERE date = ? AND joueur_id = ?').bind(iso, jid).first();
  if (!e) return json({ erreur: "La cagnotte de ce joueur n'est pas encore établie pour ce jour." }, 400);
  let P; try { P = await programme(db, iso); } catch (err) { return json({ erreur: 'Le programme du PMU ne répond pas, réessaie dans un instant.' }, 502); }
  const vieux = (await db.prepare('SELECT * FROM bal_jeux WHERE date = ? AND joueur_id = ?').bind(iso, jid).all()).results || [];
  const now = Date.now();
  if (!a.admin && vieux.some((j) => { const h = depart(P, j); return h && h <= now; })) return json({ erreur: 'Ta feuille est verrouillée : ta première course est partie.' }, 400);
  if (vieux.some((j) => j.retour !== null) && !a.admin) return json({ erreur: 'Ta feuille est déjà en partie calculée.' }, 400);
  const v = controler(b.jeux, e, P, a.admin);
  if (v.erreur) return json({ erreur: v.erreur }, 400);
  const L = v.jeux;
  const q = [db.prepare('DELETE FROM bal_jeux WHERE date = ? AND joueur_id = ?').bind(iso, jid)];
  for (let i = 0; i < L.length; i += 9) {
    const lot = L.slice(i, i + 9);
    q.push(db.prepare(`INSERT INTO bal_jeux (date, joueur_id, type, r, c, n1, c2, n2, mise, auto, par) VALUES ${lot.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...lot.flatMap((j) => [iso, jid, j.type, j.r, j.c, j.n1, j.c2, j.n2, j.mise, j.auto ? 1 : 0, u.id])));
  }
  await db.batch(q);
  if (a.admin && (!a.joueur || a.joueur.id !== jid)) await trace(db, u.id, 'feuille', { date: iso, joueur: jid, avant: vieux.map((j) => [j.type, j.r, j.c, j.n1, j.c2, j.n2, j.mise]), apres: L.map((j) => [j.type, j.r, j.c, j.n1, j.c2, j.n2, j.mise]) });
  return json({ ok: true, ajout: v.ajout });
}
