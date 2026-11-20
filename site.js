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
    '<p><a href="/plan.html">Plan du site</a>·<a href="/confidentialite.html">Confidentialité</a></p>' +
    '<p>© N-TURF</p>';
  document.body.appendChild(f);
})();
