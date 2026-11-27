import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours, initCorrections, jourConcours, isoVersFr, pronoRetenu, calculer } from '../../_concours.js';

// Vue de l'administrateur (Bruno seul) : les joueurs du concours et leurs pronostics, même avant la course
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db); await initCorrections(db);
  const u = await currentUser(db, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  const q = new URL(request.url).searchParams.get('date');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : await jourConcours(db);
  const j = await db.prepare('SELECT hippodrome, reunion, course, statut FROM concours_jours WHERE date = ?').bind(iso).first();
  const rows = (await db.prepare(`SELECT u.id, u.pseudo, u.role, p.chevaux, p.saisi, p.gains FROM concours_pronos p JOIN users u ON u.id = p.user_id WHERE p.date = ? ORDER BY p.saisi`).bind(iso).all()).results || [];
  const inscrits = (await db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM concours_pronos').first()).n;
  const corr = (await db.prepare(`SELECT c.ancien, c.nouveau, c.motif, c.quand, u.pseudo FROM concours_corrections c JOIN users u ON u.id = c.user_id WHERE c.date = ? ORDER BY c.id`).bind(iso).all()).results || [];
  return json({ date: iso, dateFr: isoVersFr(iso), course: j || null, inscrits,
    joueurs: rows.map((r) => ({ id: r.id, robot: r.role === 'robot', pseudo: r.pseudo, chevaux: JSON.parse(r.chevaux), saisi: r.saisi, gains: r.gains })),
    corrections: corr.map((c) => ({ pseudo: c.pseudo, ancien: c.ancien ? JSON.parse(c.ancien) : null, nouveau: JSON.parse(c.nouveau), motif: c.motif, quand: c.quand })) });
}

// Correction exceptionnelle d'un pronostic par l'administrateur : toujours enregistrée (ancien, nouveau, motif, heure)
// et signalée à côté du pronostic du joueur. Si la course est déjà calculée, ses gains sont recalculés aussitôt.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db); await initCorrections(db);
  const u = await currentUser(db, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  const iso = String(b.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return json({ erreur: 'Date invalide.' }, 400);
  const motif = String(b.motif || '').trim().slice(0, 200);
  if (!motif) return json({ erreur: 'Indique le motif de la correction (il est gardé dans l\'historique).' }, 400);
  const j = await db.prepare('SELECT * FROM concours_jours WHERE date = ?').bind(iso).first();
  if (!j) return json({ erreur: 'Pas de concours ce jour-là.' }, 404);
  const p = await db.prepare('SELECT chevaux FROM concours_pronos WHERE date = ? AND user_id = ?').bind(iso, parseInt(b.user, 10) || 0).first();
  if (!p) return json({ erreur: 'Ce joueur n\'a pas de pronostic ce jour-là.' }, 404);
  const ch = (b.chevaux || []).map((x) => parseInt(x, 10));
  const partants = JSON.parse(j.partants || '[]').map((x) => x.n);
  if (ch.length !== 8 || new Set(ch).size !== 8 || ch.some((x) => !partants.includes(x))) return json({ erreur: 'Il faut 8 numéros différents, tous au départ de la course.' }, 400);
  const q = [
    db.prepare('INSERT INTO concours_corrections (date, user_id, ancien, nouveau, motif, par) VALUES (?, ?, ?, ?, ?, ?)').bind(iso, parseInt(b.user, 10), p.chevaux, JSON.stringify(ch), motif, u.id),
  ];
  if (j.statut === 'calcule' && j.rapports) {
    const np = JSON.parse(j.partants || '[]').filter((x) => x.np).map((x) => x.n);
    const ret = pronoRetenu(ch, np), c = calculer(ret, JSON.parse(j.arrivee || '[]'), JSON.parse(j.rapports));
    q.push(db.prepare('UPDATE concours_pronos SET chevaux = ?, retenu = ?, gains = ?, detail = ? WHERE date = ? AND user_id = ?').bind(JSON.stringify(ch), JSON.stringify(ret), c.gains, JSON.stringify(c.detail), iso, parseInt(b.user, 10)));
  } else q.push(db.prepare('UPDATE concours_pronos SET chevaux = ? WHERE date = ? AND user_id = ?').bind(JSON.stringify(ch), iso, parseInt(b.user, 10)));
  await db.batch(q);
  try { await db.prepare("DELETE FROM pmu_cache WHERE cle = 'bandeau'").run(); } catch (e) {}
  return json({ ok: true });
}
