// Préparer la journée du lendemain : ?demain=1 dans l'adresse d'une page d'administration
(function () {
  var demain = /[?&]demain=1/.test(location.search);
  function jourFr(decalage) {
    var d = new Date(Date.now() + (decalage || 0) * 86400000);
    return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  window.NTA = {
    demain: demain,
    date: jourFr(demain ? 1 : 0),            // date de travail (aujourd'hui ou demain)
    q: demain ? '&attente=1' : '',            // à ajouter aux adresses ?cle=…
    q1: demain ? '?attente=1' : '',           // à ajouter aux adresses sans paramètre
    barre: function (el) {
      if (!el) return;
      var base = location.pathname;
      el.className = 'barrejour';
      el.innerHTML = '<span>Je prépare :</span>' +
        '<a href="' + base + '" class="' + (demain ? '' : 'on') + '">Aujourd\'hui (' + jourFr(0) + ')</a>' +
        '<a href="' + base + '?demain=1" class="' + (demain ? 'on' : '') + '">Demain (' + jourFr(1) + ')</a>' +
        (demain ? '<p class="note2">Mode « demain » : tout ce que tu publies ici est mis en attente. Rien ne change pour les membres tant que tu n\'as pas appuyé sur « Basculer » dans l\'Administration.</p>' : '');
    }
  };
})();
