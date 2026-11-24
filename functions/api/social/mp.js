import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { prepSocial, membreParPseudo, contact, paire } from '../../_social.js';

// Messages privés. Le premier message est une demande de contact : l'autre accepte ou refuse.
// GET : mes conversations, demandes reçues et nombre de non-lus ; GET ?avec=pseudo : la conversation (et la marque lue)
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await prepSocial(db);
  const moi = await currentUser(db, request);
  if (!moi) return json({ erreur: 'Connecte-toi d\'abord.' }, 401);
  const avec = new URL(request.url).searchParams.get('avec');
  if (avec) {
    const m = await membreParPseudo(db, avec);
    if (!m) return json({ erreur: 'Membre introuvable.' }, 404);
    const c = await contact(db, moi.id, m.id);
    const r = await db.prepare('SELECT id, de, texte, cree FROM mp WHERE (de = ? AND a = ?) OR (de = ? AND a = ?) ORDER BY id DESC LIMIT 200').bind(moi.id, m.id, m.id, moi.id).all();
    if (!c || c.statut === 'accepte') await db.prepare('UPDATE mp SET lu = 1 WHERE a = ? AND de = ? AND lu = 0').bind(moi.id, m.id).run();
    return json({ pseudo: m.pseudo, contact: c ? { statut: c.statut, parMoi: c.demandeur === moi.id } : null,
      messages: (r.results || []).reverse().map((x) => ({ moi: x.de === moi.id, texte: x.texte, cree: x.cree })) });
  }
  const conv = await db.prepare(`SELECT c.a, c.b, c.demandeur, c.statut, u.pseudo,
      (SELECT COUNT(*) FROM mp WHERE a = ? AND de = u.id AND lu = 0) AS nonlus,
      (SELECT MAX(id) FROM mp WHERE (de = c.a AND a = c.b) OR (de = c.b AND a = c.a)) AS dernier
    FROM contacts c JOIN users u ON u.id = CASE WHEN c.a = ? THEN c.b ELSE c.a END
    WHERE (c.a = ? OR c.b = ?) AND c.statut != 'refuse' AND u.banni = 0 ORDER BY dernier DESC`).bind(moi.id, moi.id, moi.id, moi.id).all();
  const L = (conv.results || []).map((x) => ({ pseudo: x.pseudo, statut: x.statut, parMoi: x.demandeur === moi.id, nonlus: x.nonlus }));
  return json({ conversations: L, nonlus: L.reduce((s, x) => s + (x.statut === 'accepte' || !x.parMoi ? x.nonlus : 0), 0), demandes: L.filter((x) => x.statut === 'attente' && !x.parMoi).length });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await prepSocial(db);
  const moi = await currentUser(db, request);
  if (!moi) return json({ erreur: 'Connecte-toi d\'abord.' }, 401);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  const m = await membreParPseudo(db, b.pseudo);
  if (!m || m.id === moi.id) return json({ erreur: 'Membre introuvable.' }, 404);
  const [a, bb] = paire(moi.id, m.id);
  const c = await contact(db, moi.id, m.id);
  const texte = String(b.texte || '').trim().slice(0, 2000);
  if (b.action === 'repondre') {
    if (!c || c.statut !== 'attente' || c.demandeur === moi.id) return json({ erreur: 'Pas de demande à traiter.' }, 400);
    await db.prepare('UPDATE contacts SET statut = ? WHERE a = ? AND b = ?').bind(b.accepte ? 'accepte' : 'refuse', a, bb).run();
    if (!b.accepte) await db.prepare('UPDATE mp SET lu = 1 WHERE a = ? AND de = ?').bind(moi.id, m.id).run();
    return json({ ok: true });
  }
  if (!texte) return json({ erreur: 'Message vide.' }, 400);
  if (!c) {
    // première prise de contact : un seul message, en attente de réponse
    await db.batch([
      db.prepare("INSERT INTO contacts (a, b, demandeur, statut) VALUES (?, ?, ?, 'attente')").bind(a, bb, moi.id),
      db.prepare('INSERT INTO mp (de, a, texte) VALUES (?, ?, ?)').bind(moi.id, m.id, texte),
    ]);
    return json({ ok: true, demande: true });
  }
  if (c.statut === 'refuse') return json({ erreur: 'Ce membre ne souhaite pas recevoir de messages de ta part.' }, 403);
  if (c.statut === 'attente') {
    if (c.demandeur === moi.id) return json({ erreur: 'Ta demande de contact attend sa réponse.' }, 403);
    // répondre à une demande vaut acceptation
    await db.prepare("UPDATE contacts SET statut = 'accepte' WHERE a = ? AND b = ?").bind(a, bb).run();
  }
  await db.prepare('INSERT INTO mp (de, a, texte) VALUES (?, ?, ?)').bind(moi.id, m.id, texte).run();
  return json({ ok: true });
}
