// Tickets : coût, gains après l'arrivée, affichage — utilisé par l'administration et l'espace membres
var NTT = (function(){
  var PARIS = {
    'Tiercé':   { k: 3, mise: 1 },
    'Quarté+':  { k: 4, mise: 1.5 },
    'Quinté+':  { k: 5, mise: 2 },
    'Multi':    { k: 4, mise: 3 },
    '2 sur 4':  { k: 2, mise: 3 },
    'Trio':     { k: 3, mise: 1 },
    'Super 4':  { k: 4, mise: 3, ordre: true }
  };
  var FORMULES = { combine: 'Combiné', ligne: 'Ligne (dans l\'ordre écrit)', champ: 'Champ (X = tous les partants, à la place voulue)', positions: 'Champ réduit par place (X = associés)' };
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function eur(v){ return (Math.round(v*100)/100).toFixed(2).replace('.', ',') + ' €'; }
  function C(n, k){ if (k < 0 || n < k) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
  function F(n){ var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }
  function nums(t){ var out = []; String(t||'').split(/[^0-9]+/).forEach(function(x){ var n = parseInt(x,10); if (n > 0 && n < 31 && out.indexOf(n) < 0) out.push(n); }); return out; }

  // ensemble des chevaux possibles d'un ticket
  function pool(t, partants){
    if (t.formule === 'champ') { var p = []; for (var i = 1; i <= (partants || 0); i++) p.push(i); return p; }
    return t.chevaux || [];
  }
  // champ réduit par place : chaque place reçoit un cheval précis ou X (= la liste des associés)
  // Champ avec X placé à la main (ex. 9 X 12 13 14) : chaque place = un cheval précis, ou X = tous les autres partants
  function parPlace(t){
    if (t.formule === 'positions') return true;
    var P = PARIS[t.pari];
    return t.formule === 'champ' && !!P && !!t.spec && t.spec.indexOf('X') >= 0 && t.spec.length === P.k;
  }
  // Ce qu'on garde de la saisie d'un champ : la place du X si elle est écrite (une case par place),
  // sinon (pas de X, ou X seulement à la fin) le champ classique « bases + X »
  function specChamp(spec, pari){
    var P = PARIS[pari]; spec = spec || [];
    var ix = spec.indexOf('X');
    if (!P || ix < 0) return undefined;
    var nbX = spec.filter(function(v){ return v === 'X'; }).length;
    if (spec.length < P.k && nbX === 1 && ix === spec.length - 1) return undefined;
    return spec;
  }
  function lireSpec(txt){ return String(txt||'').split(/[\s,;.\/-]+/).filter(Boolean).map(function(x){ return /^x$/i.test(x) ? 'X' : parseInt(x,10); }).filter(function(x){ return x === 'X' || x > 0; }); }
  function tuples(t, cb, partants){
    var tous = [];
    if (t.formule === 'champ') { var fixes = (t.spec || []).filter(function(v){ return v !== 'X'; }); for (var i = 1; i <= (partants || 0); i++) if (fixes.indexOf(i) < 0) tous.push(i); }
    var cols = (t.spec || []).map(function(v){ return v === 'X' ? (t.formule === 'champ' ? tous : (t.associes || [])) : [v]; }), used = {}, acc = [];
    (function rec(i){ if (i === cols.length) { cb(acc.slice()); return; } cols[i].forEach(function(n){ if (!used[n]) { used[n] = 1; acc.push(n); rec(i+1); acc.pop(); used[n] = 0; } }); })(0);
  }
  function combinaisons(t, partants){
    var P = PARIS[t.pari]; if (!P) return 0;
    if (t.formule === 'positions' || (t.formule === 'champ' && t.spec)) { if (!parPlace(t)) return 0; var c = 0; tuples(t, function(){ c++; }, partants); return c; }
    if (t.formule === 'ligne') return (t.chevaux || []).length === P.k ? 1 : 0;
    var b = t.formule === 'champ' ? (t.bases || []).length : 0;
    var n = t.formule === 'champ' ? (partants || 0) - b : (t.chevaux || []).length;
    var c = C(n, P.k - b);
    return P.ordre ? c * F(P.k) : c;
  }
  function cout(t, partants){ return combinaisons(t, partants) * (t.mise || 0); }

  // ---- rapports : PMU en direct d'abord, sinon ceux du fichier ----
  function cle(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); }
  function chercher(raps, noms){
    for (var i = 0; i < noms.length; i++) for (var j = 0; j < raps.length; j++) if (cle(raps[j].nom) === noms[i]) return raps[j].euros;
    return undefined;
  }
  var CLES = {
    'Tiercé ordre': ['tierceordre'], 'Tiercé désordre': ['tiercedesordre'], 'Tiercé 1 NP': ['tierce1np'],
    'Quarté ordre': ['quarteordre'], 'Quarté désordre': ['quartedesordre'], 'Quarté bonus 3': ['quartebonus3', 'quartebonus'],
    'Quinté ordre': ['quinteordre'], 'Quinté désordre': ['quintedesordre'], 'Quinté bonus 4': ['quintebonus4'],
    'Quinté bonus 4 sur 5': ['quintebonus4sur5'], 'Quinté bonus 3': ['quintebonus3'],
    'Multi en 4': ['multien4', 'multi'], '2 sur 4': ['2sur4', 'deuxsurquatre'], 'Trio': ['trio'], 'Super 4': ['super4']
  };
  function rapport(nom, raps){
    var v = chercher(raps, CLES[nom] || [cle(nom)]);
    if (typeof v === 'string') { v = parseFloat(v.replace(',', '.')); if (isNaN(v)) v = 0; }
    return v;
  }

  // ---- gains d'un ticket ----
  function contient(S, T){ return T.every(function(x){ return S.indexOf(x) >= 0; }); }
  function inter(S, T){ return S.filter(function(x){ return T.indexOf(x) >= 0; }).length; }
  function sousEnsembles(arr, k, fixe, cb){
    var reste = arr.filter(function(x){ return fixe.indexOf(x) < 0; }), m = k - fixe.length;
    if (m < 0) return;
    (function rec(s, acc){ if (acc.length === m) { cb(fixe.concat(acc)); return; } for (var i = s; i < reste.length; i++){ acc.push(reste[i]); rec(i+1, acc); acc.pop(); } })(0, []);
  }
  // np = numéros des non-partants. Règlement PMU (Tiercé art. 79, Quarté+ art. 101, Quinté+ art. 124) :
  //  - 2 non-partants ou plus dans une combinaison : remboursée ;
  //  - Tiercé avec 1 non-partant : rapport « Tiercé 1 NP » si les 2 autres chevaux sont aux 2 premières places, sinon perdue ;
  //  - Quarté+ avec 1 non-partant : 2 fois le rapport Bonus si les 3 autres sont les 3 premiers (dans n'importe quel ordre), sinon perdue ;
  //  - Quinté+ avec 1 non-partant : requalifiée en Quarté+ sur les 4 autres chevaux (ordre, désordre, bonus 3).
  function gains(t, arrivee, raps, partants, np){
    var P = PARIS[t.pari]; if (!P || !arrivee || arrivee.length < Math.min(P.k, 4)) return null;
    var A = arrivee, T3 = A.slice(0,3), T4 = A.slice(0,4), T5 = A.slice(0,5), NP = np || [];
    var lignes = {}, manque = false;
    function ajoute(nom){ lignes[nom] = (lignes[nom] || 0) + 1; }
    function memeOrdre(R, T){ return R.length >= T.length && T.every(function(n, i){ return R[i] === n; }); }
    function evalue(S, ordreExact){
      var nNP = NP.length ? S.filter(function(n){ return NP.indexOf(n) >= 0; }).length : 0;
      if (nNP >= 2 && (t.pari === 'Tiercé' || t.pari === 'Quarté+' || t.pari === 'Quinté+')) { ajoute('Remboursé (non-partants)'); return; }
      if (nNP === 1) {
        var R = S.filter(function(n){ return NP.indexOf(n) < 0; }), ord = ordreExact !== false && ordreExact !== null;
        if (t.pari === 'Tiercé') { if (contient(R, A.slice(0,2))) ajoute('Tiercé 1 NP'); return; }
        if (t.pari === 'Quarté+') { if (contient(R, T3)) { ajoute('Quarté bonus 3'); ajoute('Quarté bonus 3'); } return; }
        if (t.pari === 'Quinté+') {
          if (contient(R, T4)) ajoute(ord && memeOrdre(R, T4) ? 'Quarté ordre' : 'Quarté désordre');
          else if (contient(R, T3)) ajoute('Quarté bonus 3');
          return;
        }
      }
      switch (t.pari) {
        case 'Tiercé': if (contient(S, T3)) ajoute(ordreExact === true ? 'Tiercé ordre' : 'Tiercé désordre'); break;
        case 'Quarté+': if (contient(S, T4)) ajoute(ordreExact === true ? 'Quarté ordre' : 'Quarté désordre'); else if (contient(S, T3)) ajoute('Quarté bonus 3'); break;
        case 'Quinté+':
          if (T5.length === 5 && contient(S, T5)) ajoute(ordreExact === true ? 'Quinté ordre' : 'Quinté désordre');
          else if (contient(S, T4)) ajoute('Quinté bonus 4');
          else if (T5.length === 5 && inter(S, T5) === 4) ajoute('Quinté bonus 4 sur 5');
          else if (contient(S, T3)) ajoute('Quinté bonus 3');
          break;
        case 'Multi': if (contient(S, T4)) ajoute('Multi en 4'); break;
        case '2 sur 4': if (contient(T4, S)) ajoute('2 sur 4'); break;
        case 'Trio': if (contient(S, T3)) ajoute('Trio'); break;
        case 'Super 4': if (ordreExact === true) ajoute('Super 4'); break;
      }
    }
    if (parPlace(t)) {
      tuples(t, function(L){ evalue(L, L.every(function(n, i){ return A[i] === n; }) ? true : 'rang'); }, partants);
    } else if (t.formule === 'ligne') {
      var L = t.chevaux || [];
      var exact = L.slice(0, P.k).every(function(n, i){ return A[i] === n; });
      evalue(L, exact ? true : 'rang');
    } else if (P.ordre) {
      // Super 4 combiné ou en champ : gagnant si les 4 premiers sont tous dans le jeu
      var pl = pool(t, partants), bs = t.formule === 'champ' ? (t.bases || []) : [];
      if (contient(pl, T4) && contient(T4, bs)) ajoute('Super 4');
    } else {
      sousEnsembles(pool(t, partants), P.k, t.formule === 'champ' ? (t.bases || []) : [], function(S){ evalue(S, false); });
    }
    var total = 0, detail = [];
    Object.keys(lignes).forEach(function(nom){
      if (nom === 'Remboursé (non-partants)') { var rb = (t.mise || 0) * lignes[nom]; total += rb; detail.push(lignes[nom] + ' × ' + nom + ' : ' + eur(rb)); return; }
      var r = rapport(nom, raps);
      if (r === undefined) { manque = true; detail.push(lignes[nom] + ' × ' + nom + ' (rapport en attente)'); return; }
      var g = r * (t.mise || 0) * lignes[nom];
      total += g; detail.push(lignes[nom] + ' × ' + nom + ' : ' + eur(g));
    });
    return { gagne: total, detail: detail, attente: manque };
  }

  // ---- affichage ----
  // ce qui s'écrit sur le ticket : le X reste à la place choisie
  function vue(t){
    if (t.formule === 'champ') return t.spec ? t.spec : (t.bases || []).concat(['X']);
    return t.formule === 'positions' ? (t.spec || []) : (t.chevaux || []);
  }
  function rendu(T, ctx){
    ctx = ctx || {};
    var arr = ctx.arrivee || [], raps = ctx.rapports || [], partants = ctx.partants || 0;
    if (!T || !T.tickets || !T.tickets.length) return '<p class="empty">Les tickets du jour arrivent.</p>';
    var totM = 0, totG = 0, fini = arr.length >= 3, attente = false;
    var h = '<p class="lead">Tickets du Quinté+ du '+esc(T.date || '')+'</p>';
    T.tickets.forEach(function(t, i){
      var P = PARIS[t.pari] || {}, nb = combinaisons(t, partants), c = nb * (t.mise || 0); totM += c;
      var g = fini ? gains(t, arr, raps, partants, ctx.np) : null, gagne = null;
      if (t.gainManuel !== undefined && t.gainManuel !== null && t.gainManuel !== '') gagne = parseFloat(t.gainManuel) || 0;
      else if (g) { gagne = g.gagne; if (g.attente) attente = true; }
      if (gagne !== null) totG += gagne;
      var ch = vue(t);
      h += '<div class="tkt'+(gagne > 0 ? ' gagnant' : '')+'"><div class="tkh"><b>'+esc(t.auteur || '')+'</b><span>'+esc(t.pari)+' · '+esc(FORMULES[t.formule] || '')+'</span></div>';
      h += '<div class="sel">'+ch.map(function(n){ var hit = arr.slice(0,5).indexOf(n) >= 0; return '<span class="ch'+(t.formule==='champ' && n !== 'X' ? ' piv' : '')+(n === 'X' ? ' xx' : '')+(hit?' hit':'')+'">'+esc(n)+'</span>'; }).join('')+'</div>';
      if (t.formule === 'champ' && t.spec) h += '<p class="assoc">X = tous les autres partants, à la place indiquée</p>';
      else if (t.associes && t.associes.length) h += '<p class="assoc">X = associés : '+t.associes.map(esc).join(' - ')+'</p>';
      h += '<div class="tkb"><span>'+nb+' combinaison'+(nb>1?'s':'')+' × '+eur(t.mise || 0)+'</span><b>'+eur(c)+'</b></div>';
      if (gagne !== null) {
        h += '<div class="tkb"><span>Gagné'+(t.gainManuel!==undefined && t.gainManuel!==null && t.gainManuel!=='' ? ' (saisi)' : '')+'</span><b class="'+(gagne>0?'pos':'')+'">'+eur(gagne)+'</b></div>';
        if (g && g.detail.length && (t.gainManuel === undefined || t.gainManuel === null || t.gainManuel === '')) h += '<p class="assoc">'+g.detail.map(esc).join(' · ')+'</p>';
        h += '<div class="tkb"><span>Net</span><b class="'+(gagne-c>=0?'pos':'neg')+'">'+(gagne-c>=0?'+':'−')+eur(Math.abs(gagne-c))+'</b></div>';
      }
      h += '</div>';
    });
    h += '<div class="bilan"><div class="tot"><b>Mise totale</b><b>'+eur(totM)+'</b></div>';
    if (fini) {
      h += '<div><span>Gagné</span><span class="'+(totG>0?'pos':'')+'">'+eur(totG)+'</span></div><div><span>Net</span><span class="'+(totG-totM>=0?'pos':'neg')+'">'+(totG-totM>=0?'+':'−')+eur(Math.abs(totG-totM))+'</span></div>';
      if (attente) h += '<p class="note2">Certains rapports ne sont pas encore publiés : le gagné sera complété dès leur sortie.</p>';
    } else h += '<p class="note2">Gagné et net s\'afficheront après l\'arrivée.</p>';
    h += '</div>';
    return h;
  }

  // ---- lecture d'une liste collée en texte ----
  // Une ligne par ticket, par exemple :
  //   Quinté+ | TCR | 9 12 13 14 6 1
  //   Tiercé | Choix Bruno | 9 12 | champ
  //   Multi | ALGO | 14 9 12 13 1 8 | combiné | 0,50
  function lireTexte(txt){
    var out = [], erreurs = [];
    String(txt||'').split(/\n/).forEach(function(l, i){
      l = l.trim(); if (!l) return;
      var p = l.split('|').map(function(x){ return x.trim(); });
      var pari = Object.keys(PARIS).filter(function(k){ return cle(k) === cle(p[0]) || cle(k).replace('plus','') === cle(p[0]); })[0];
      if (!pari) { erreurs.push('Ligne '+(i+1)+' : pari inconnu « '+p[0]+' »'); return; }
      var t = { id: Date.now().toString(36) + i, pari: pari, auteur: p[1] || 'Choix Bruno', formule: 'combine', chevaux: [], bases: [], mise: PARIS[pari].mise, associes: [] };
      var f = cle(p[3] || '');
      if (f.indexOf('place') === 0 || f.indexOf('reduit') === 0) { t.formule = 'positions'; t.spec = lireSpec(p[2]); }
      else if (f.indexOf('champ') === 0) { t.formule = 'champ'; t.bases = nums(p[2]); var sc = specChamp(lireSpec(p[2]), pari); if (sc) t.spec = sc; }
      else { t.chevaux = nums(p[2]); if (f.indexOf('ligne') === 0 || f.indexOf('ordre') === 0) t.formule = 'ligne'; }
      if (p[4]) { var m = parseFloat(p[4].replace(',', '.')); if (m > 0) t.mise = m; }
      out.push(t);
    });
    return { tickets: out, erreurs: erreurs };
  }

  return { PARIS: PARIS, FORMULES: FORMULES, parPlace: parPlace, specChamp: specChamp, lireSpec: lireSpec, vue: vue, combinaisons: combinaisons, cout: cout, gains: gains, rendu: rendu, lireTexte: lireTexte, nums: nums, eur: eur, esc: esc };
})();
