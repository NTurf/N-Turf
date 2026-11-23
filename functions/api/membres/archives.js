import { json, initDb, currentUser, lireContenu, noDb } from '../../_auth.js';

// Archives : la liste des jours, ou tout ce qui a été donné un jour précis (?jour=2026-11-22)
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  const jour = new URL(request.url).searchParams.get('jour');
  const arch = await lireContenu(env.DB, 'cpc_archive');
  const courses = (arch && arch.courses) || [];
  const iso = (d) => String(d || '').split('/').reverse().join('-');
  if (!jour) {
    const r = await env.DB.prepare("SELECT cle FROM contenu WHERE cle LIKE 'tickets-____-__-__' OR cle LIKE 'quinte-____-__-__' OR cle LIKE 'cpc-____-__-__'").all();
    const s = new Set((r.results || []).map((x) => x.cle.slice(-10)));
    courses.forEach((c) => s.add(iso(c.d)));
    return json({ jours: [...s].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse() });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return json({ erreur: 'Date invalide.' }, 400);
  return json({
    jour,
    quinte: await lireContenu(env.DB, 'quinte-' + jour),
    tickets: await lireContenu(env.DB, 'tickets-' + jour),
    cpc: await lireContenu(env.DB, 'cpc-' + jour),
    courses: courses.filter((c) => iso(c.d) === jour),
  });
}
