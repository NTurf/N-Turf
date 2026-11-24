import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours, jourConcours, isoVersFr } from '../../_concours.js';

// Vue de l'administrateur (Bruno seul) : les joueurs du concours et leurs pronostics, même avant la course
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db);
  const u = await currentUser(db, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  const q = new URL(request.url).searchParams.get('date');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : await jourConcours(db);
  const j = await db.prepare('SELECT hippodrome, reunion, course, statut FROM concours_jours WHERE date = ?').bind(iso).first();
  const rows = (await db.prepare(`SELECT u.pseudo, p.chevaux, p.saisi, p.gains FROM concours_pronos p JOIN users u ON u.id = p.user_id WHERE p.date = ? ORDER BY p.saisi`).bind(iso).all()).results || [];
  const inscrits = (await db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM concours_pronos').first()).n;
  return json({ date: iso, dateFr: isoVersFr(iso), course: j || null, inscrits, joueurs: rows.map((r) => ({ pseudo: r.pseudo, chevaux: JSON.parse(r.chevaux), saisi: r.saisi, gains: r.gains })) });
}
