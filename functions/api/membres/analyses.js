import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { prepAnalyses } from '../../_analyses.js';

// Analyses d'un jour, pour les membres connectés. Appel : /api/membres/analyses?jour=2026-11-24
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await prepAnalyses(env.DB);
  if (!(await currentUser(env.DB, request))) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const jour = new URL(request.url).searchParams.get('jour') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return json({ erreur: 'Jour invalide.' }, 400);
  const r = await env.DB.prepare('SELECT id, auteur, hippo, course, texte, html FROM analyses WHERE jour = ? ORDER BY hippo, CAST(course AS INTEGER), id').bind(jour).all();
  return json({ analyses: r.results || [] });
}
