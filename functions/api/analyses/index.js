import { json, initDb, currentUser, peutPublier, noDb } from '../../_auth.js';
import { prepAnalyses, droitsAnalyse, AUTEURS } from '../../_analyses.js';

// Écriture des analyses : administration (tous les auteurs) ou analyste autorisé (lui seul)
async function base(env, request) {
  if (!env.DB) return { err: noDb() };
  await initDb(env.DB); await prepAnalyses(env.DB);
  const d = await droitsAnalyse(env.DB, request);
  if (!d) return { err: json({ erreur: 'Réservé à l\'administration et aux analystes.' }, 403) };
  return { d };
}

export async function onRequestGet({ request, env }) {
  const { err, d } = await base(env, request); if (err) return err;
  const q = new URL(request.url).searchParams, jour = q.get('jour') || '';
  const out = { auteurs: d.auteurs, admin: d.admin, analyses: [] };
  if (/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    const r = await env.DB.prepare('SELECT id, auteur, hippo, course, texte FROM analyses WHERE jour = ? ORDER BY hippo, CAST(course AS INTEGER), id').bind(jour).all();
    out.analyses = (r.results || []).filter((a) => d.auteurs.includes(a.auteur));
  }
  if (d.admin) {
    const r = await env.DB.prepare('SELECT a.user_id, a.auteur, u.pseudo FROM analystes a JOIN users u ON u.id = a.user_id ORDER BY a.auteur').all();
    out.analystes = r.results || [];
  }
  return json(out);
}

export async function onRequestPost({ request, env }) {
  const { err, d } = await base(env, request); if (err) return err;
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  const db = env.DB;
  if (b.action === 'supprimer') {
    const a = await db.prepare('SELECT auteur FROM analyses WHERE id = ?').bind(+b.id || 0).first();
    if (!a || !d.auteurs.includes(a.auteur)) return json({ erreur: 'Analyse introuvable.' }, 404);
    await db.prepare('DELETE FROM analyses WHERE id = ?').bind(+b.id).run();
    return json({ ok: true });
  }
  if (b.action === 'analyste' || b.action === 'retirer') {
    if (!d.admin || !peutPublier(d.u)) return json({ erreur: 'Réservé à l\'administration.' }, 403);
    const u = await db.prepare('SELECT id FROM users WHERE pseudo_lc = ?').bind(String(b.pseudo || '').trim().toLowerCase()).first();
    if (!u) return json({ erreur: 'Pseudo introuvable sur le site.' }, 404);
    if (b.action === 'retirer') { await db.prepare('DELETE FROM analystes WHERE user_id = ?').bind(u.id).run(); return json({ ok: true }); }
    if (!AUTEURS.includes(b.auteur)) return json({ erreur: 'Auteur inconnu.' }, 400);
    await db.prepare('INSERT INTO analystes (user_id, auteur) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET auteur = excluded.auteur').bind(u.id, b.auteur).run();
    return json({ ok: true });
  }
  const jour = String(b.jour || ''), hippo = String(b.hippo || '').trim().slice(0, 60), course = String(b.course || '').trim().slice(0, 10), texte = String(b.texte || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return json({ erreur: 'Jour invalide.' }, 400);
  if (!d.auteurs.includes(b.auteur)) return json({ erreur: 'Auteur non autorisé.' }, 403);
  if (!hippo || !course) return json({ erreur: 'Indique l\'hippodrome et la course.' }, 400);
  if (!texte || texte.length > 20000) return json({ erreur: 'Texte vide ou trop long.' }, 400);
  if (b.id) {
    const a = await db.prepare('SELECT auteur FROM analyses WHERE id = ?').bind(+b.id).first();
    if (!a || !d.auteurs.includes(a.auteur)) return json({ erreur: 'Analyse introuvable.' }, 404);
    await db.prepare('UPDATE analyses SET jour = ?, auteur = ?, hippo = ?, course = ?, texte = ? WHERE id = ?').bind(jour, b.auteur, hippo, course, texte, +b.id).run();
  } else {
    await db.prepare('INSERT INTO analyses (jour, auteur, hippo, course, texte, par) VALUES (?, ?, ?, ?, ?, ?)').bind(jour, b.auteur, hippo, course, texte, d.u.id).run();
  }
  return json({ ok: true });
}
