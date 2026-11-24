import { initDb, lireContenu } from './_auth.js';
import { prepJournal, billetsPublies, lienBillet } from './_journal.js';

// Plan du site pour Google : une adresse par jour d'arrivées publiques
export async function onRequestGet({ env }) {
  let jours = [], billets = [];
  if (env.DB) {
    await initDb(env.DB);
    const arch = await lireContenu(env.DB, 'cpc_archive');
    const s = new Set(((arch && arch.courses) || []).filter((c) => Array.isArray(c.a) && c.a.length).map((c) => String(c.d || '').split('/').reverse().join('-')));
    await prepJournal(env.DB); billets = await billetsPublies(env.DB, 1000);
    jours = [...s].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse();
  }
  const urls = ['https://n-turf.net/arrivees', 'https://n-turf.net/journal'].concat(billets.map((b) => 'https://n-turf.net' + lienBillet(b))).concat(jours.map((j) => 'https://n-turf.net/arrivees/' + j));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
