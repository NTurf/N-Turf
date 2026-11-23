// En-tête et pied de page communs à toutes les pages
(function(){
  var page = document.body.getAttribute('data-page') || '';
  // Barre de navigation principale
  var tabs = [
    ['/', 'Accueil'],
    ['/pronostics.html#quinte', 'Pronos Quinté+'],
    ['/tickets.html', 'Tickets'],
    ['/pronostics.html#cpc', 'Pronos course par course'],
    ['/pronostics.html#fanny', 'Repérés de Fanny'],
    ['/hippodrome.html', 'Pronos Hippodrome'],
    ['/outils.html', 'Outils'],
    ['/concours.html', 'Concours Quinté+'],
    ['/stats.html', 'Statistiques'],
    ['/archives.html', 'Archives'],
    ['/chat.html', 'Chat'],
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
    '<div class="bar"><button type="button" class="burger" id="burger" aria-label="Menu">☰</button><a class="logo" href="/"><img class="banniere" src="/banniere.png" alt="N-TURF Pronostics hippiques"></a><span class="sp"></span>' +
    '<span class="compte"><a class="btn" href="/inscription.html">S\'inscrire</a></span></div>' +
    '<a class="devise" href="/rejoindre.html"><b>Le collectif des passionnés de courses</b><span>Pronostiqueurs indépendants réunis par la même passion</span></a>' +
    '<div class="ticker" id="ticker" hidden><span id="tickerText"></span></div>';
  document.body.insertBefore(h, document.body.firstChild);
  // Menu en barre latérale à gauche (toujours visible sur ordinateur, tiroir sur téléphone)
  var side = document.createElement('aside');
  side.className = 'sidenav'; side.id = 'sidenav';
  side.innerHTML = '<nav class="mainnav">' + tabs.map(function(t){ return '<a href="'+t[0]+'">'+t[1]+'</a>'; }).join('') + '</nav>';
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
    document.getElementById('tickerText').innerHTML = d.bandeau.map(e).join(' &nbsp;<b>•</b>&nbsp; ');
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
        if (!/\/chat(\.html)?$/.test(location.pathname)) { var cs = document.createElement('script'); cs.src = '/chatflot.js'; document.body.appendChild(cs); }
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
      }
      return m;
    });
})();
