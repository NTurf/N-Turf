import { initDb } from '../_auth.js';
import { prepJournal, billetsPublies, lienBillet, extrait } from '../_journal.js';

// Le Journal N-TURF, public : /journal (tous les billets) et /journal/12-titre (un billet)
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const date = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${MOIS[+m[2] - 1]} ${m[1]}` : ''; };

function page(titre, desc, canon, corps, type = 'website') {
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
<meta property="og:type" content="${type}">
<meta name="theme-color" content="#0D1E3D">
<link rel="manifest" href="/manifest.webmanifest?v=2">
<link rel="icon" href="/icone-nturf-192.png">
<link rel="stylesheet" href="/style.css">
<style>.billet .txt{line-height:1.6;overflow-wrap:anywhere}.billet .par{color:var(--soft);font-size:14px;margin:-4px 0 10px}.blist h2{margin-bottom:2px}.blist h2 a{text-decoration:none}</style>
</head>
<body data-page="journal">
<main>
${corps}
<p class="note2" id="ecrire" hidden><a href="/ecrire-billet.html">✍ Écrire un billet</a></p>
<section class="card"><h2>Vous aussi, racontez les courses</h2><p>Pronostiqueur, passionné, lad, éleveur, entraîneur : vous pouvez écrire dans le Journal N-TURF. <a href="/rejoindre.html">Contactez-nous</a>. L'inscription au site est gratuite.</p><p><a class="btn" href="/inscription.html">S'inscrire gratuitement</a></p></section>
</main>
<script src="/site.js"></script>
<script>fetch('/api/journal',{credentials:'same-origin'}).then(function(r){ if (r.ok) document.getElementById('ecrire').hidden = false; }).catch(function(){});</script>
</body>
</html>`;
}

export async function onRequestGet({ env, params }) {
  const html = (s, code = 200) => new Response(s, { status: code, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' } });
  if (!env.DB) return html(page('Le Journal N-TURF', '', '/journal', '<p class="empty">Indisponible pour le moment.</p>'), 503);
  await initDb(env.DB); await prepJournal(env.DB);
  const p = Array.isArray(params.id) ? params.id : (params.id ? [params.id] : []);
  const L = await billetsPublies(env.DB);

  if (!p.length) {
    const corps = `<h1>Le Journal N-TURF</h1>
<p class="lead">Les billets des passionnés de courses hippiques : humeur, humour, explications des jeux, vie des écuries et des hippodromes.</p>
${L.length ? L.map((b) => `<section class="card blist"><h2><a href="${lienBillet(b)}">${esc(b.titre)}</a></h2><p class="note2">Par ${esc(b.auteur)} · ${date(b.publie_le)}</p><p>${esc(extrait(b.texte))}</p><p><a href="${lienBillet(b)}">Lire la suite</a></p></section>`).join('') : '<section class="card"><p class="empty">Les premiers billets arrivent bientôt.</p></section>'}`;
    return html(page('Le Journal N-TURF – billets des passionnés de courses hippiques', 'Billets d\'humeur, d\'humour et d\'explication sur les courses hippiques, les jeux PMU et la vie des hippodromes, écrits par les passionnés du collectif N-TURF.', '/journal', corps));
  }

  const id = parseInt(String(p[0]), 10);
  const b = L.find((x) => x.id === id);
  if (!b || p.length > 1) return html(page('Billet introuvable – Le Journal N-TURF', '', '/journal', '<h1>Billet introuvable</h1><p><a href="/journal">Voir tous les billets</a></p>'), 404);
  const corps = `<article class="card billet"><h1>${esc(b.titre)}</h1><p class="par">Par ${esc(b.auteur)} · ${date(b.publie_le)}</p><div class="txt">${b.texte}</div></article>
<p><a class="btn ghost" href="/journal">Tous les billets du Journal</a></p>`;
  return html(page(`${b.titre} – Le Journal N-TURF`, extrait(b.texte, 155), lienBillet(b), corps, 'article'));
}
