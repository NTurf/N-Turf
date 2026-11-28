// Alertes de départ : une petite fenêtre apparaît sur n'importe quelle page, quelques minutes avant chaque course.
// Une seule alerte par course et par membre (même si on la ferme, elle ne revient pas).
// Le délai (5 à 10 minutes, 5 par défaut) se règle dans « Mon compte ».
(function () {
  if (window.NTURF_ALERTES) return; window.NTURF_ALERTES = 1;
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  if (LS.get('nt_al_off', '0') === '1') return;
  var delai = Math.min(10, Math.max(5, parseInt(LS.get('nt_al_delai', '5'), 10) || 5));
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var hm = function (t) { return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h '); };
  var L = [], ecart = 0, jour = '';
  var pile = document.createElement('div'); pile.className = 'al-pile'; document.body.appendChild(pile);
  // courses déjà annoncées aujourd'hui (gardées sur l'appareil, vidées chaque jour)
  function deja() { try { var o = JSON.parse(LS.get('nt_al_vues', '{}')); return o.jour === jour ? o : { jour: jour, c: [] }; } catch (e) { return { jour: jour, c: [] }; } }
  function noter(cle) { var o = deja(); if (o.c.indexOf(cle) < 0) o.c.push(cle); LS.set('nt_al_vues', JSON.stringify(o)); }
  function montrer(c, reste) {
    var min = Math.max(1, Math.round(reste / 60000));
    var el = document.createElement('div'); el.className = 'al'; el.setAttribute('role', 'status');
    el.innerHTML = '<div class="t">ALERTE COURSE – R' + c.reunion + ' ' + esc(String(c.hippodrome).toUpperCase()) + (c.quinte ? ' · QUINTÉ+' : '') + '</div>' +
      '<div class="c">R' + c.reunion + 'C' + c.course + (c.libelle ? ' – ' + esc(c.libelle) : '') + '</div>' +
      '<div class="h">Départ prévu à ' + hm(c.heure) + '.</div><div class="d">Départ dans ' + min + ' minute' + (min > 1 ? 's' : '') + ' !</div>' +
      '<button type="button" class="x" aria-label="Fermer">×</button>';
    var fin = function () { if (el.parentNode) el.remove(); };
    el.querySelector('.x').onclick = function (e) { e.stopPropagation(); fin(); };
    el.onclick = function () { if (c.lien) location.href = c.lien; };
    pile.appendChild(el);
    setTimeout(fin, 60000); // l'alerte reste 1 minute à l'écran (on peut la fermer avant avec ×)
  }
  function verifier() {
    if (!L.length) return;
    var now = Date.now() + ecart, vues = deja().c;
    L.forEach(function (c) {
      var reste = c.heure - now;
      // dans la fenêtre choisie (au plus 10 minutes avant), et pas une course déjà partie
      if (reste <= delai * 60000 && reste > 30000 && vues.indexOf(c.cle) < 0) { noter(c.cle); montrer(c, reste); }
    });
  }
  function charger() {
    fetch('/api/pmu/departs', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.courses) return;
      jour = d.jour; L = d.courses; ecart = d.maintenant - Date.now(); // heure du serveur (si l'horloge du téléphone n'est pas à l'heure)
      verifier();
    }).catch(function () {});
  }
  charger();
  setInterval(function () { if (!document.hidden) charger(); }, 60000);
  setInterval(function () { if (!document.hidden) verifier(); }, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) charger(); });
})();
