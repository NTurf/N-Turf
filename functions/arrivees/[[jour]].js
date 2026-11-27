import { initDb, lireContenu } from '../_auth.js';

// Archive PUBLIQUE des arrivées et rapports, une page par jour (lisible par Google, sans inscription).
// /arrivees → la liste des jours ; /arrivees/2026-11-24 → les arrivées et rapports de ce jour.
// Seuls les 3 premiers de la synthèse N-TURF sont montrés (le reste est réservé aux membres).

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = (v) => { const n = Number(v); return n > 0 ? n.toFixed(2).replace('.', ',') + ' €' : esc(v); };
const iso = (d) => String(d || '').split('/').reverse().join('-');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function frLong(j) { const [a, m, d] = j.split('-').map(Number); const t = new Date(Date.UTC(a, m - 1, d, 12)); return `${JOURS[t.getUTCDay()]} ${d} ${MOIS[m - 1]} ${a}`; }
const num = (c) => parseInt(String(c).replace(/\D/g, ''), 10) || 0;

function page(titre, desc, canon, corps) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titre)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://n-turf.net${canon}">
<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://n-turf.net/banniere.png">
<meta name="theme-color" content="#0D1E3D">
<link rel="manifest" href="/manifest.webmanifest?v=2">
<link rel="icon" href="/icone-nturf-192.png">
<link rel="stylesheet" href="/style.css?v=20261124b"></head>
<body data-page="arrivees">
<main>
${corps}
<section class="card"><h2>Envie d'aller plus loin ?</h2><p>Les membres voient chaque jour la synthèse complète, les tickets, les études, les concours et le Tchat. L'inscription est gratuite.</p><p><a class="btn" href="/inscription.html">S'inscrire gratuitement</a></p></section>
</main>
<script src="/site.js?v=20261124b"></script>
</body>
</html>`;
}

async function joursDisponibles(db) {
  const arch = await lireContenu(db, 'cpc_archive');
  const s = new Set(((arch && arch.courses) || []).filter((c) => Array.isArray(c.a) && c.a.length).map((c) => iso(c.d)));
  return { arch, jours: [...s].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse() };
}

function rendreJour(jour, L) {
  const par = {};
  L.forEach((c) => { (par[c.h] = par[c.h] || []).push(c); });
  const hippos = Object.keys(par);
  let h = '';
  for (const hp of hippos) {
    h += `<section class="card"><h2>${esc(hp)}</h2>`;
    par[hp].sort((a, b) => num(a.c) - num(b.c)).forEach((c) => {
      const a = (c.a || []).slice(0, 4), top3 = (c.s || []).slice(0, 3);
      h += `<div class="crs"><h3>${esc(c.c)}${c.di ? ' <small>' + esc(c.di) + '</small>' : ''}</h3>`;
      h += `<div class="arrivee"><b>Arrivée</b> ${a.map((n) => `<span class="ch${top3.includes(n) ? ' hit' : ''}">${esc(n)}</span>`).join('')}</div>`;
      if (top3.length) h += `<div class="sel"><small>Les 3 premiers N-TURF :</small> ${top3.map((n) => `<span class="ch piv${a.includes(n) ? ' hit' : ''}">${esc(n)}</span>`).join('')}</div>`;
      const p = c.p || [];
      const r = [['Simple gagnant ' + (a[0] || ''), c.g], ['Simple placé ' + (a[0] || ''), p[0]], ['Simple placé ' + (a[1] || ''), p[1]], ['Simple placé ' + (a[2] || ''), p[2]], ['Couplé gagnant', c.cg], ['Trio', c.t], ['Multi en 4', c.m4], ['Super 4', c.s4]]
        .filter((x) => x[1] !== null && x[1] !== undefined && x[1] !== '' && Number(x[1]) !== 0);
      if (r.length) h += `<table class="rap">${r.map((x) => `<tr><td>${esc(x[0])}</td><td>${eur(x[1])}</td></tr>`).join('')}</table>`;
      h += '</div>';
    });
    h += '</section>';
  }
  return { h, hippos };
}

export async function onRequestGet({ request, env, params }) {
  const html = (s, code = 200) => new Response(s, { status: code, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  if (!env.DB) return html(page('Arrivées et rapports – N-TURF', '', '/arrivees', '<p class="empty">Indisponible pour le moment.</p>'), 503);
  await initDb(env.DB);
  const { arch, jours } = await joursDisponibles(env.DB);
  const p = Array.isArray(params.jour) ? params.jour : (params.jour ? [params.jour] : []);

  if (!p.length) {
    const corps = `<h1>Arrivées et rapports PMU</h1>
<p class="lead">Toutes les arrivées et tous les rapports des courses suivies par N-TURF, jour par jour, avec les 3 premiers de notre synthèse. Rien n'est effacé : c'est notre transparence.</p>
<section class="card">${jours.length ? '<ul class="jours">' + jours.map((j) => `<li><a href="/arrivees/${j}">Arrivées et rapports du ${frLong(j)}</a></li>`).join('') + '</ul>' : '<p class="empty">Les premières archives arrivent bientôt.</p>'}</section>`;
    return html(page('Arrivées et rapports PMU, jour par jour – N-TURF', 'Archive des arrivées et rapports PMU des courses suivies par N-TURF (trot et galop), jour par jour, avec les 3 premiers de la synthèse N-TURF.', '/arrivees', corps));
  }

  const jour = p[0];
  if (p.length > 1 || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return html(page('Page introuvable – N-TURF', '', '/arrivees', '<h1>Page introuvable</h1><p><a href="/arrivees">Voir toutes les arrivées</a></p>'), 404);
  const L = ((arch && arch.courses) || []).filter((c) => iso(c.d) === jour && Array.isArray(c.a) && c.a.length);
  if (!L.length) return html(page('Arrivées et rapports – N-TURF', '', '/arrivees', `<h1>Pas d'arrivées pour le ${esc(frLong(jour))}</h1><p><a href="/arrivees">Voir toutes les arrivées</a></p>`), 404);
  const { h, hippos } = rendreJour(jour, L);
  const i = jours.indexOf(jour), prec = jours[i + 1], suiv = jours[i - 1];
  const nav = `<p class="jourbar">${prec ? `<a class="btn ghost" href="/arrivees/${prec}">◀ Jour précédent</a>` : ''} <a class="btn ghost" href="/arrivees">Tous les jours</a> ${suiv ? `<a class="btn ghost" href="/arrivees/${suiv}">Jour suivant ▶</a>` : ''}</p>`;
  const lieux = hippos.join(', ');
  const corps = `<h1>Arrivées et rapports du ${esc(frLong(jour))}</h1>
<p class="lead">${esc(lieux)} : les arrivées officielles, les rapports PMU (simple gagnant et placé, couplé, trio, multi en 4, super 4) et les 3 premiers de la synthèse N-TURF. En rouge, nos chevaux à l'arrivée.</p>
${nav}${h}${nav}`;
  return html(page(`Arrivées et rapports PMU du ${frLong(jour)} – ${lieux} – N-TURF`, `Arrivées et rapports PMU du ${frLong(jour)} (${lieux}) et les 3 premiers de la synthèse N-TURF.`, '/arrivees/' + jour, corps));
}
