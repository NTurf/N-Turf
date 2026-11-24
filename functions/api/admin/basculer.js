import { json, initDb, currentUser, peutPublier, lireContenu, ecrireContenu, noDb } from '../../_auth.js';

// Journée préparée à l'avance : voir ce qui attend (GET) et basculer quand Bruno le décide (POST)
const LISTE = ['quinte', 'cpc', 'tickets', 'tickets_brouillon', 'coeurs', 'fanny', 'hippo_quinte', 'hippo_pick5', 'hippo_etquinte', 'hippo_etr1', 'hippo_etout', 'hippo_ettrot'];
const NOMS = { quinte: 'Quinté+', cpc: 'Course par course', tickets: 'Tickets', coeurs: 'Coups de cœur', fanny: 'Repérés de Fanny', hippo_quinte: 'Hippodrome Quinté+', hippo_pick5: 'Hippodrome Super Pick 5', hippo_etquinte: 'Études Quinté+', hippo_etr1: 'Études Réunion 1', hippo_etout: 'Études outsiders', hippo_ettrot: 'Études trotteurs' };
const isoDe = (d) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d || '') ? d.split('/').reverse().join('-') : null);

async function droit(env, request) {
  if (!env.DB) return false;
  await initDb(env.DB);
  return peutPublier(await currentUser(env.DB, request));
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  if (!(await droit(env, request))) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  const out = [];
  for (const k of LISTE) {
    if (k === 'tickets_brouillon') continue;
    const d = await lireContenu(env.DB, k + '_attente');
    if (!d) continue;
    let detail = d.date || '';
    if (k === 'cpc' && d.reunions) detail += ' (' + d.reunions.map((r) => r.hippodrome).join(', ') + ')';
    if (k === 'tickets' && d.tickets) detail += ' · ' + d.tickets.length + ' ticket' + (d.tickets.length > 1 ? 's' : '');
    if ((k === 'coeurs' || k === 'fanny') && d.lignes) detail += ' · ' + d.lignes.length + ' course' + (d.lignes.length > 1 ? 's' : '');
    if (k.startsWith('hippo_')) detail = (d.titre || '') + ' · ' + (d.n || 0) + ' image' + (d.n > 1 ? 's' : '');
    out.push({ cle: k, nom: NOMS[k], detail: detail.trim() });
  }
  // compatibilité avec l'écran existant
  const q = out.find((x) => x.cle === 'quinte'), c = out.find((x) => x.cle === 'cpc');
  return json({ elements: out, quinte: q ? q.detail : null, cpc: c ? c.detail : null, cpcReunions: [] });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  if (!(await droit(env, request))) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  const db = env.DB, fait = [];
  const qa = await lireContenu(db, 'quinte_attente');
  for (const k of LISTE) {
    const d = await lireContenu(db, k + '_attente');
    if (!d) continue;
    if (k.startsWith('hippo_')) {
      // les images préparées remplacent celles du jour
      const g = k.slice(6);
      for (let i = 0; i < (d.n || 0); i++) {
        const img = await lireContenu(db, `hippo-img-att-${g}-${i}`);
        if (img) await ecrireContenu(db, `hippo-img-${g}-${i}`, img);
      }
      await db.prepare("DELETE FROM contenu WHERE cle LIKE ?").bind(`hippo-img-att-${g}-%`).run();
    }
    if (/^hippo_et/.test(k) && !d.date && qa && qa.date) d.date = qa.date;
    await ecrireContenu(db, k, d);
    const iso = isoDe(d.date);
    if (iso && ['quinte', 'cpc', 'tickets', 'coeurs', 'fanny'].includes(k)) await ecrireContenu(db, k + '-' + iso, d);
    await db.prepare('DELETE FROM contenu WHERE cle = ?').bind(k + '_attente').run();
    fait.push(k);
  }
  if (!fait.length) return json({ erreur: 'Aucune journée en attente.' }, 400);
  return json({ ok: true, fait });
}
