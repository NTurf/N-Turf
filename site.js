// En-tête et pied de page communs à toutes les pages
(function(){
  var page = document.body.getAttribute('data-page') || '';
  var tabs = [
    ['accueil','/','Accueil'],
    ['membres','/membres.html','Espace membres'],
    ['plan','/plan.html','Plan du site']
  ];
  var h = document.createElement('header');
  h.innerHTML =
    '<div class="bar"><img src="/icon-192.png" alt=""><a class="name" href="/">N-TURF</a><span class="sp"></span>' +
    '<a class="btn" href="/inscription.html">S\'inscrire</a></div>' +
    '<nav class="tabs">' + tabs.map(function(t){
      return '<a href="'+t[1]+'"'+(t[0]===page?' class="on"':'')+'>'+t[2]+'</a>';
    }).join('') + '</nav>';
  document.body.insertBefore(h, document.body.firstChild);
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
        var b = h.querySelector('.btn');
        var w = document.createElement('span');
        w.className = 'who';
        w.innerHTML = '<b></b> · <a href="#" id="logout">Déconnexion</a>';
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
