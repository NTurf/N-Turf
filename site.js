// En-tête et pied de page communs à toutes les pages
(function(){
  var page = document.body.getAttribute('data-page') || '';
  // Barre de navigation principale
  var tabs = [
    ['/', 'Accueil'],
    ['/journal', 'Le Journal N-TURF'],
    null,
    ['/pronostics.html#quinte', 'Pronos Quinté+'],
    ['/tickets.html', 'Tickets'],
    ['/etudes.html', 'Études'],
    ['/concours.html', 'Concours Quinté+'],
    null,
    ['/pronostics.html#cpc', 'Pronos course par course'],
    ['/hippodrome.html', 'Pronos Hippodrome'],
    ['/pronos-membres.html', 'Pronos des membres'],
    ['/pronostics.html#fanny', 'Repérés de Fanny'],
    ['/analyses.html', 'Analyses'],
    null,
    ['/chat.html', 'Tchat'],
    ['/lives.html', 'Nos lives'],
    ['/outils.html', 'Outils'],
    null,
    ['/stats.html', 'Statistiques'],
    ['/arrivees', 'Arrivées et rapports'],
    ['/archives.html', 'Archives'],
    ['/rejoindre.html', 'Rejoindre N-TURF'],
    ['/membres.html', 'Espace membres']
  ];
  function actif(u){
    var n = function(z){ return (z || '/').replace(/\/index(\.html)?$/, '/').replace(/\.html$/, ''); };
    var p = n(location.pathname), x = u.split('#');
    if (n(x[0]) !== p) return false;
    if (x[1] === 'quinte') return location.hash !== '#cpc' && location.hash !== '#fanny';
    if (x[1] === 'fanny') return location.hash === '#fanny';
    if (x[1] === 'cpc') return location.hash === '#cpc';
    return true;
  }
  var h = document.createElement('header');
  h.innerHTML =
    '<div class="bar"><button type="button" class="burger" id="burger" aria-label="Menu"><span class="bico">☰</span><span class="blab">Menu</span></button><a class="logo" href="/"><img class="banniere" src="/banniere.png" alt="N-TURF Pronostics hippiques"></a><span class="sp"></span>' +
    '<span class="compte"><a class="btn" href="/inscription.html">S\'inscrire</a></span></div>' +
    '<a class="devise" href="/rejoindre.html"><b>Le collectif des passionnés de courses hippiques</b><span>Réunis par la même passion</span></a>' +
    '<div class="ticker" id="ticker" hidden><span id="tickerText"></span></div>';
  document.body.insertBefore(h, document.body.firstChild);
  // Menu en barre latérale à gauche (toujours visible sur ordinateur, tiroir sur téléphone)
  var side = document.createElement('aside');
  side.className = 'sidenav'; side.id = 'sidenav';
  side.innerHTML = '<nav class="mainnav">' + tabs.map(function(t){ return t ? '<a href="'+t[0]+'">'+t[1]+'</a>' : '<hr class="navsep">'; }).join('') + '</nav>';
  document.body.insertBefore(side, h.nextSibling);
  var voile = document.createElement('div'); voile.className = 'voile'; document.body.appendChild(voile);
  document.body.classList.add('avec-side');
  function fermer(){ document.body.classList.remove('menu-ouvert'); }
  h.querySelector('#burger').onclick = function(){ document.body.classList.toggle('menu-ouvert'); };
  voile.onclick = fermer;
  side.addEventListener('click', function(e){ if (e.target.tagName === 'A') fermer(); });
  function marquer(){ side.querySelectorAll('.mainnav a').forEach(function(a){ a.classList.toggle('on', actif(a.getAttribute('href'))); }); }
  marquer(); window.addEventListener('hashchange', marquer);

  // Bandeau défilant, le même sur toutes les pages
  fetch('/api/public', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(d){
    if (!d.bandeau || !d.bandeau.length) return;
    var e = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
    document.getElementById('tickerText').innerHTML = d.bandeau.map(function(t){ t = String(t); return t.indexOf('!!') === 0 ? '<a href="/concours.html" style="color:#e5243b;font-weight:800;text-decoration:none">' + e(t.slice(2)) + '</a>' : e(t); }).join(' &nbsp;<b>•</b>&nbsp; ');
    document.getElementById('ticker').hidden = false;
    // vitesse constante, quelle que soit la longueur du texte : environ 55 pixels par seconde
    var sp = document.getElementById('tickerText');
    requestAnimationFrame(function(){ sp.style.animationDuration = Math.max(25, Math.round(sp.scrollWidth / 55)) + 's'; });
  }).catch(function(){});

  // Emplacements réservés aux futures publicités (vides et invisibles pour l'instant)
  var main = document.querySelector('main');
  if (main) {
    var p1 = document.createElement('div'); p1.className = 'pub'; p1.setAttribute('data-pub', 'haut'); p1.hidden = true; main.insertBefore(p1, main.firstChild);
    var p2 = document.createElement('div'); p2.className = 'pub'; p2.setAttribute('data-pub', 'bas'); p2.hidden = true; main.appendChild(p2);
  }
  var f = document.createElement('footer');
  f.innerHTML =
    '<p>Jeu responsable · Interdit aux mineurs<br>Joueurs Info Service : 09 74 75 13 13</p>' +
    '<p><a href="/installer.html">Installer l\'application</a>·<a href="/contact.html">Contactez-nous</a>·<a href="/plan.html">Plan du site</a>·<a href="/confidentialite.html">Confidentialité</a></p>' +
    '<p>© N-TURF</p>';
  document.body.appendChild(f);

  // Application : enregistrement et bouton « Installer »
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function(){});
  window.NTURF_INSTALL = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault(); window.NTURF_INSTALL = e;
    document.querySelectorAll('.btn-install').forEach(function(b){ b.hidden = false; });
  });

  // Membre connecté : afficher son pseudo à la place de « S'inscrire »
  window.NTURF_MOI = fetch('/api/moi', {credentials:'same-origin'})
    .then(function(r){ return r.ok ? r.json() : {connecte:false}; })
    .catch(function(){ return {connecte:false}; })
    .then(function(m){
      if (m.connecte) {
        // Chat flottant sur toutes les pages, sauf la page Chat elle-même
        if (!/\/chat(\.html)?$/.test(location.pathname)) { var cs = document.createElement('script'); cs.src = '/chatflot.js?v=20261127a'; document.body.appendChild(cs); }
        // La Balançoire : lien privé, seulement pour ses joueurs
        if (m.balancoire) { var nav = side.querySelector('.mainnav'); var lb = document.createElement('a'); lb.href = '/balancoire'; lb.textContent = '🔒 La Balançoire'; if (location.pathname === '/balancoire') lb.className = 'on'; nav.appendChild(lb); }
        // Alertes de départ des courses, sur toutes les pages
        var al = document.createElement('script'); al.src = '/alertes.js?v=20261127a'; document.body.appendChild(al);
        var b = h.querySelector('.compte');
        var w = document.createElement('span');
        w.className = 'who';
        w.innerHTML = '<a href="/compte.html"><b></b></a> · <a href="#" id="logout">Déconnexion</a>';
        w.querySelector('b').textContent = m.pseudo;
        b.replaceWith(w);
        w.querySelector('#logout').onclick = function(e){
          e.preventDefault();
          fetch('/api/deconnexion',{method:'POST'}).then(function(){ location.href='/'; });
        };
        // Messages privés : enveloppe avec le nombre de messages non lus et de demandes de contact
        var mpl = document.createElement('a'); mpl.href = '/messages.html'; mpl.className = 'mpbadge'; mpl.title = 'Mes messages'; mpl.textContent = '✉';
        w.insertBefore(mpl, w.firstChild); w.insertBefore(document.createTextNode(' '), mpl.nextSibling);
        var majMp = function(){ fetch('/api/social/mp', {credentials:'same-origin'}).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
          if (!d) return; var n = (d.nonlus || 0);
          mpl.innerHTML = '✉' + (n ? '<sup>' + n + '</sup>' : '');
        }).catch(function(){}); };
        majMp(); setInterval(majMp, 60000);
      }
      // Qui est en ligne : voyant vert et nombre ; la liste des pseudos (vers leur fiche) pour les membres
      var enl = document.createElement('div'); enl.className = 'enligne'; enl.hidden = true;
      enl.innerHTML = '<button type="button" id="enlB"><i></i><span></span></button><div id="enlL" hidden></div>';
      h.appendChild(enl);
      var majEnl = function(){ fetch('/api/social/enligne', {credentials:'same-origin'}).then(function(r){ return r.json(); }).then(function(d){
        enl.hidden = false;
        enl.querySelector('span').textContent = d.n + ' membre' + (d.n > 1 ? 's' : '') + ' en ligne';
        var e = function(x){ return String(x).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
        document.getElementById('enlL').innerHTML = m.connecte
          ? (d.pseudos || []).map(function(p){ return '<a href="/fiche.html?p=' + encodeURIComponent(p.pseudo) + '"' + (p.modo ? ' style="color:#d8232f"' : '') + '>' + e(p.pseudo) + '</a>'; }).join('') || '<span>Personne pour l\'instant.</span>'
          : '<span><a href="/inscription.html#connexion">Connecte-toi</a> pour voir qui est en ligne.</span>';
      }).catch(function(){}); };
      document.getElementById('enlB').onclick = function(){ var l = document.getElementById('enlL'); l.hidden = !l.hidden; };
      majEnl(); setInterval(majEnl, 60000);
      return m;
    });
})();

// Médailles du mois à côté des pseudos : 🥇🥈🥉 concours Quinté+ (bleu) et Pronos des membres (vert)
(function(){
  if (document.body.getAttribute('data-page') === 'admin') return;
  var M = null, RANG = ['', '🥇', '🥈', '🥉'], ORD = ['', '1er', '2e', '3e'];
  function cle(p){ return String(p || '').trim().toLowerCase(); }
  function table(o){ var t = {}; Object.keys(o || {}).forEach(function(k){ t[cle(k)] = o[k]; }); return t; }
  function badges(ps){
    var h = '', q = M.q[cle(ps)], p = M.p[cle(ps)];
    if (q) h += '<span class="med q" title="' + ORD[q] + ' du concours Quinté+ ce mois-ci (Globe de Cristal)">' + RANG[q] + '<small>Quinté+</small></span>';
    if (p) h += '<span class="med p" title="' + ORD[p] + ' des Pronos des membres ce mois-ci">' + RANG[p] + '<small>Pronos</small></span>';
    return h;
  }
  function poser(){
    if (!M) return;
    document.querySelectorAll('a[href*="fiche.html?p="]:not([data-med]), .psn:not([data-med])').forEach(function(el){
      el.setAttribute('data-med', '1');
      var ps = el.textContent;
      if (el.tagName === 'A') { try { var v = decodeURIComponent((el.getAttribute('href').split('p=')[1] || '').split('&')[0]); if (cle(v) !== cle(ps)) return; ps = v; } catch (e) { return; } }
      var b = badges(ps); if (b) el.insertAdjacentHTML('afterend', b);
    });
  }
  var attente = false;
  new MutationObserver(function(){ if (attente) return; attente = true; requestAnimationFrame(function(){ attente = false; poser(); }); }).observe(document.body, { childList: true, subtree: true });
  fetch('/api/medailles').then(function(r){ return r.json(); }).then(function(d){ M = { q: table(d.quinte), p: table(d.pronos) }; poser(); }).catch(function(){});
})();
