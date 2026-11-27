import { entrer, json, introuvable } from './_commun.js';
import { trace } from '../../_balancoire.js';

// Gestion par l'administrateur : ajouter / retirer un joueur, le relier à un compte du site (ce qui lui ouvre l'accès),
// établir les cagnottes d'un jour (point de départ ou correction). Tout est tracé.
export async function onRequestPost({ request, env }) {
  const x = await entrer(request, env); if (x.refus) return x.refus;
  const { db, u, a } = x;
  if (!a.admin) return introuvable();
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  const pseudoVersId = async (p) => { if (!p) return null; const r = await db.prepare('SELECT id FROM users WHERE pseudo_lc = ?').bind(String(p).trim().toLowerCase()).first(); return r ? r.id : undefined; };
  if (b.action === 'ajouter') {
    const nom = String(b.nom || '').trim().slice(0, 40);
    if (!nom) return json({ erreur: 'Donne un nom.' }, 400);
    const uid = await pseudoVersId(b.pseudo);
    if (uid === undefined) return json({ erreur: `Aucun membre du site n'a le pseudo « ${b.pseudo} ».` }, 400);
    try { await db.prepare('INSERT INTO bal_joueurs (nom, user_id) VALUES (?, ?)').bind(nom, uid).run(); }
    catch (e) { return json({ erreur: 'Ce nom (ou ce compte) est déjà dans La Balançoire.' }, 400); }
    await trace(db, u.id, 'ajouter', { nom, pseudo: b.pseudo || null });
    return json({ ok: true });
  }
  const j = await db.prepare('SELECT * FROM bal_joueurs WHERE id = ?').bind(parseInt(b.joueur, 10) || 0).first();
  if (['lier', 'retirer', 'reprendre'].includes(b.action) && !j) return json({ erreur: 'Joueur introuvable.' }, 404);
  if (b.action === 'lier') {
    const uid = await pseudoVersId(b.pseudo);
    if (uid === undefined) return json({ erreur: `Aucun membre du site n'a le pseudo « ${b.pseudo} ».` }, 400);
    try { await db.prepare('UPDATE bal_joueurs SET user_id = ? WHERE id = ?').bind(uid, j.id).run(); }
    catch (e) { return json({ erreur: 'Ce compte est déjà relié à un autre joueur.' }, 400); }
    await trace(db, u.id, 'lier', { joueur: j.nom, pseudo: b.pseudo || null });
    return json({ ok: true });
  }
  if (b.action === 'retirer' || b.action === 'reprendre') {
    await db.prepare('UPDATE bal_joueurs SET actif = ? WHERE id = ?').bind(b.action === 'reprendre' ? 1 : 0, j.id).run();
    await trace(db, u.id, b.action, { joueur: j.nom });
    return json({ ok: true });
  }
  if (b.action === 'cagnottes') {
    const iso = String(b.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return json({ erreur: 'Date invalide.' }, 400);
    const L = (b.lignes || []).map((l) => ({ id: parseInt(l.joueur, 10), cag: Number(l.cagnotte), pal: [0, 1, 2].includes(+l.palier) ? +l.palier : 0, dette: l.dette === '' || l.dette == null ? null : Number(l.dette) }))
      .filter((l) => l.id && Number.isFinite(l.cag) && l.cag >= 0);
    if (!L.length) return json({ erreur: 'Aucune cagnotte.' }, 400);
    const q = L.map((l) => db.prepare(`INSERT INTO bal_etat (date, joueur_id, cagnotte, palier, dette, dette_connue) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, joueur_id) DO UPDATE SET cagnotte = excluded.cagnotte, palier = excluded.palier,
      dette = CASE WHEN ? IS NULL THEN bal_etat.dette ELSE excluded.dette END, dette_connue = CASE WHEN ? IS NULL THEN bal_etat.dette_connue ELSE 1 END`)
      .bind(iso, l.id, l.cag, l.pal, l.dette ?? 0, l.dette == null ? 0 : 1, l.dette, l.dette));
    q.push(db.prepare(`INSERT INTO bal_jours (date, statut) VALUES (?, 'ouvert') ON CONFLICT(date) DO UPDATE SET statut = 'ouvert'`).bind(iso));
    await db.batch(q);
    await trace(db, u.id, 'cagnottes', { date: iso, lignes: L });
    return json({ ok: true });
  }
  return json({ erreur: 'Action inconnue.' }, 400);
}
