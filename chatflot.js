// Chat flottant : une bulle 💬 sur toutes les pages, une fenêtre de chat qui reste ouverte d'une page à l'autre
(function () {
  if (window.NTURF_CHATFLOT) return; window.NTURF_CHATFLOT = 1;
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var S = { salon: LS.get('nt_salon', 'general'), ouvert: LS.get('nt_flot', '0') === '1', dernier: 0, msgs: {}, ordre: [], moi: null, salons: null, enCours: false };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var heure = function (t) { var d = new Date(t); return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

  var bulle = document.createElement('button');
  bulle.type = 'button'; bulle.className = 'cf-bulle'; bulle.setAttribute('aria-label', 'Ouvrir le chat');
  bulle.innerHTML = '💬<span class="cf-nb" hidden></span>';
  var fen = document.createElement('div');
  fen.className = 'cf-fen'; fen.hidden = true;
  fen.innerHTML = '<div class="cf-tete"><select class="cf-sal" aria-label="Salon"></select><a href="/chat.html" class="cf-grand" title="Ouvrir la page Chat">⤢</a><button type="button" class="cf-red" aria-label="Réduire">–</button></div>' +
    '<div class="cf-fil"><p class="empty">Chargement…</p></div>' +
    '<form class="cf-env"><textarea rows="1" maxlength="500" placeholder="Ton message…"></textarea><button type="submit" class="btn">Envoyer</button></form><p class="cf-msg"></p>';
  document.body.appendChild(fen); document.body.appendChild(bulle);
  var fil = fen.querySelector('.cf-fil'), txt = fen.querySelector('textarea'), sel = fen.querySelector('.cf-sal'), info = fen.querySelector('.cf-msg');

  function enBas() { return fil.scrollHeight - fil.scrollTop - fil.clientHeight < 60; }
  function nonLus() {
    var lu = +LS.get('nt_flot_lu_' + S.salon, '0'), n = 0;
    S.ordre.forEach(function (id) { var m = S.msgs[id]; if (id > lu && !m.supprime && (!S.moi || m.uid !== S.moi.id)) n++; });
    var b = bulle.querySelector('.cf-nb'); b.textContent = n > 9 ? '9+' : n; b.hidden = !n || S.ouvert;
  }
  function marquerLu() { if (S.dernier) LS.set('nt_flot_lu_' + S.salon, S.dernier); nonLus(); }
  function dessiner(bas) {
    var garder = bas || enBas();
    var vis = S.ordre.filter(function (id) { return !S.msgs[id].supprime; });
    fil.innerHTML = vis.length ? vis.map(function (id) {
      var m = S.msgs[id];
      return '<div class="cm' + (S.moi && m.uid === S.moi.id ? ' moi' : '') + '" data-id="' + id + '"><div class="ct"><b class="' + (m.modo ? 'modo' : '') + '">' + esc(m.pseudo) + '</b> <small>' + heure(m.cree) + '</small></div><div>' + esc(m.texte) + '</div></div>';
    }).join('') : '<p class="empty">Pas encore de message dans ce salon.</p>';
    if (garder) fil.scrollTop = fil.scrollHeight;
  }
  function charger(premier) {
    if (S.enCours) return; S.enCours = true;
    fetch('/api/chat/messages?salon=' + S.salon + '&apres=' + S.dernier, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        S.moi = d.moi;
        if (!S.salons) { S.salons = d.salons; sel.innerHTML = Object.keys(d.salons).map(function (k) { return '<option value="' + k + '"' + (k === S.salon ? ' selected' : '') + '>' + esc(d.salons[k]) + '</option>'; }).join(''); }
        var neuf = false;
        d.messages.forEach(function (m) { if (!S.msgs[m.id]) { S.ordre.push(m.id); neuf = true; } S.msgs[m.id] = m; if (m.id > S.dernier) S.dernier = m.id; });
        (d.supprimes || []).forEach(function (id) { if (S.msgs[id] && !S.msgs[id].supprime) { S.msgs[id].supprime = 1; neuf = true; } });
        if (premier && !LS.get('nt_flot_lu_' + S.salon, '')) marquerLu();
        if (S.ouvert && (neuf || premier)) { dessiner(premier); marquerLu(); } else nonLus();
      }).catch(function () {}).then(function () { S.enCours = false; });
  }
  function ouvrir(o) {
    S.ouvert = o; LS.set('nt_flot', o ? '1' : '0');
    fen.hidden = !o; bulle.hidden = o;
    if (o) { dessiner(true); marquerLu(); charger(); }
    nonLus();
  }
  bulle.onclick = function () { ouvrir(true); };
  fen.querySelector('.cf-red').onclick = function () { ouvrir(false); };
  sel.onchange = function () { S.salon = sel.value; LS.set('nt_salon', S.salon); S.dernier = 0; S.msgs = {}; S.ordre = []; fil.innerHTML = '<p class="empty">Chargement…</p>'; charger(true); };
  txt.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width:700px)').matches) { e.preventDefault(); fen.querySelector('form').requestSubmit(); } });
  fen.querySelector('form').onsubmit = function (e) {
    e.preventDefault();
    var t = txt.value.trim(); if (!t) return;
    var bt = fen.querySelector('form button'); bt.disabled = true;
    fetch('/api/chat/messages', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ salon: S.salon, texte: t }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) { if (x.ok) { txt.value = ''; info.textContent = ''; charger(); setTimeout(function () { fil.scrollTop = fil.scrollHeight; }, 400); } else info.textContent = x.d.erreur || 'Erreur.'; })
      .catch(function () { info.textContent = 'Connexion impossible, réessaie.'; })
      .then(function () { bt.disabled = false; });
  };
  // Appui sur un message : signaler, ou supprimer / bannir pour les modérateurs
  fil.addEventListener('click', function (e) {
    var el = e.target.closest('.cm'); if (!el) return;
    var id = +el.getAttribute('data-id'), m = S.msgs[id]; if (!m || !S.moi) return;
    var vieux = fen.querySelector('.cf-menu'); if (vieux) { vieux.remove(); return; }
    var b = [];
    if (m.uid !== S.moi.id) b.push(['signaler', 'Signaler']);
    if (S.moi.modo) { b.push(['supprimer', 'Supprimer']); if (m.uid !== S.moi.id) b.push(['bannir', 'Bannir ' + m.pseudo]); }
    if (!b.length) return;
    var d = document.createElement('div'); d.className = 'cf-menu cmenu';
    d.innerHTML = b.map(function (x) { return '<button type="button" data-a="' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('');
    el.appendChild(d);
    d.querySelectorAll('button').forEach(function (x) {
      x.onclick = function (ev) {
        ev.stopPropagation();
        var a = x.getAttribute('data-a');
        fetch('/api/chat/action', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: a, id: id }) })
          .then(function (r) { return r.json(); }).then(function (r) {
            info.textContent = r.ok ? (a === 'signaler' ? 'Message signalé aux modérateurs.' : 'C\'est fait.') : (r.erreur || 'Erreur.');
            if (r.ok && a !== 'signaler') { m.supprime = 1; if (a === 'bannir') S.ordre.forEach(function (i) { if (S.msgs[i].uid === m.uid) S.msgs[i].supprime = 1; }); dessiner(); }
          });
        d.remove();
      };
    });
  });

  ouvrir(S.ouvert);
  charger(true);
  setInterval(function () { if (!document.hidden && S.ouvert) charger(); }, 4000);
  setInterval(function () { if (!document.hidden && !S.ouvert) charger(); }, 20000);
})();
