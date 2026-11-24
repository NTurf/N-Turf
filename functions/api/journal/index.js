import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { nettoyerHtml } from '../../_analyses.js';
import { prepJournal, lienBillet } from '../../_journal.js';

// Écriture du Journal : rédacteurs autorisés (leurs billets) et administrateur (tous, et la validation)
async function base(env, request) {
  if (!env.DB) return { err: noDb() };
  await initDb(env.DB); await prepJournal(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || !u.redacteur) return { err: json({ erreur: 'Réservé aux rédacteurs autorisés.' }, 403) };
  return { u, admin: u.role === 'admin' };
}

export async function onRequestGet({ request, env }) {
  const { err, u, admin } = await base(env, request); if (err) return err;
  const q = admin
    ? env.DB.prepare(`SELECT b.id, b.titre, b.texte, b.statut, b.cree, b.publie_le, u.pseudo AS auteur FROM billets b JOIN users u ON u.id = b.auteur_id ORDER BY CASE b.statut WHEN 'attente' THEN 0 ELSE 1 END, b.id DESC LIMIT 300`)
    : env.DB.prepare(`SELECT b.id, b.titre, b.texte, b.statut, b.cree, b.publie_le, u.pseudo AS auteur FROM billets b JOIN users u ON u.id = b.auteur_id WHERE b.auteur_id = ? ORDER BY b.id DESC LIMIT 300`).bind(u.id);
  const r = await q.all();
  return json({ admin, pseudo: u.pseudo, billets: (r.results || []).map((b) => ({ ...b, lien: lienBillet(b) })) });
}

export async function onRequestPost({ request, env }) {
  const { err, u, admin } = await base(env, request); if (err) return err;
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  const db = env.DB;
  const cible = b.id ? await db.prepare('SELECT id, auteur_id, statut FROM billets WHERE id = ?').bind(+b.id || 0).first() : null;
  if (b.id && (!cible || (!admin && cible.auteur_id !== u.id))) return json({ erreur: 'Billet introuvable.' }, 404);

  if (b.action === 'supprimer') { await db.prepare('DELETE FROM billets WHERE id = ?').bind(cible.id).run(); return json({ ok: true }); }
  if (b.action === 'valider' || b.action === 'refuser' || b.action === 'retirer') {
    if (!admin) return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
    if (!cible) return json({ erreur: 'Billet introuvable.' }, 404);
    if (b.action === 'valider') await db.prepare("UPDATE billets SET statut = 'publie', publie_le = COALESCE(publie_le, datetime('now')) WHERE id = ?").bind(cible.id).run();
    else await db.prepare('UPDATE billets SET statut = ? WHERE id = ?').bind(b.action === 'refuser' ? 'refuse' : 'attente', cible.id).run();
    return json({ ok: true });
  }

  const titre = String(b.titre || '').trim().slice(0, 140);
  const texte = nettoyerHtml(b.texte).trim();
  if (!titre) return json({ erreur: 'Donne un titre au billet.' }, 400);
  if (!texte || texte.length > 60000) return json({ erreur: 'Texte vide ou trop long.' }, 400);
  if (cible) {
    // un rédacteur qui modifie son billet le renvoie en validation ; l'administrateur garde le statut
    const statut = admin ? cible.statut : 'attente';
    await db.prepare("UPDATE billets SET titre = ?, texte = ?, statut = ?, modifie = datetime('now') WHERE id = ?").bind(titre, texte, statut, cible.id).run();
    return json({ ok: true, statut });
  }
  const statut = admin ? 'publie' : 'attente';
  await db.prepare(`INSERT INTO billets (titre, texte, auteur_id, statut, publie_le) VALUES (?, ?, ?, ?, ${admin ? "datetime('now')" : 'NULL'})`).bind(titre, texte, u.id, statut).run();
  return json({ ok: true, statut });
}
