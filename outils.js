// Outils N-TURF : Répartition, Champ libre, Réducteur de chevaux
(function(){
  var DATA = { quinte: null, cpc: null };
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function eur(v){ return (Math.round(v*100)/100).toFixed(2).replace('.', ',') + ' €'; }
  function eurS(v){ return (v >= 0 ? '+' : '−') + eur(Math.abs(v)); }
  function nums(t){ var out = []; String(t||'').split(/[^0-9]+/).forEach(function(x){ var n = parseInt(x,10); if (n > 0 && n < 31 && out.indexOf(n) < 0) out.push(n); }); return out; }

  // ---------- Listes du jour ----------
  function listesQuinte(){
    var q = DATA.quinte, L = [];
    if (!q) return L;
    ['TCR','ALGO','PERSO'].forEach(function(k){ if (q.approches && q.approches[k]) L.push({ nom: k, chevaux: q.approches[k].selection }); });
    if (q.synthese && q.synthese.length) L.push({ nom: 'Synthèse', chevaux: q.synthese });
    return L;
  }
  function listesCourses(){
    var d = DATA.cpc, L = [];
    if (!d || !d.reunions) return L;
    d.reunions.forEach(function(re){ re.courses.forEach(function(c){ if (c.synthese.length) L.push({ nom: re.hippodrome + ' ' + c.course, hippo: re.hippodrome, course: c.course, chevaux: c.synthese }); }); });
    return L;
  }
  // Courses du jour : d'abord la réunion (boutons), puis la course dans une liste déroulante
  function boutonsCourses(conteneur, listes, clic){
    if (!listes.length) { conteneur.innerHTML = '<span class="empty">Pas encore de liste aujourd\'hui.</span>'; return; }
    var hippos = []; listes.forEach(function(l){ if (hippos.indexOf(l.hippo) < 0) hippos.push(l.hippo); });
    conteneur.innerHTML = hippos.map(function(h, i){ return '<button type="button" class="pill" data-h="'+i+'">'+esc(h)+'</button>'; }).join('') +
      '<select class="crsSel" hidden style="margin:6px 0 0;padding:8px 10px;border-radius:8px;font:inherit;font-weight:700;min-width:180px"></select>';
    var sel = conteneur.querySelector('select');
    conteneur.querySelectorAll('[data-h]').forEach(function(b){
      b.onclick = function(){
        conteneur.querySelectorAll('[data-h]').forEach(function(x){ x.classList.toggle('on', x === b); });
        var h = hippos[+b.getAttribute('data-h')];
        sel.innerHTML = '<option value="">Choisis la course…</option>' + listes.map(function(l, i){ return l.hippo === h ? '<option value="'+i+'">'+esc(l.course)+'</option>' : ''; }).join('');
        sel.hidden = false; sel.focus();
      };
    });
    sel.onchange = function(){ if (sel.value !== '') clic(listes[+sel.value]); };
  }
  function boutons(conteneur, listes, clic){
    conteneur.innerHTML = listes.length ? listes.map(function(l, i){ return '<button type="button" class="pill" data-i="'+i+'">'+esc(l.nom)+'</button>'; }).join('') : '<span class="empty">Pas encore de liste aujourd\'hui.</span>';
    conteneur.querySelectorAll('button').forEach(function(b){
      b.onclick = function(){
        conteneur.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); });
        clic(listes[parseInt(b.getAttribute('data-i'),10)]);
      };
    });
  }

  // ---------- 1. Répartition simple gagnant ----------
  var rep = { mode: 'mise', src: null }; // src : la course d'où viennent les chevaux (pour les cotes PMU en direct)
  function aujFr(){ return new Date().toLocaleDateString('fr-FR', {timeZone:'Europe/Paris', day:'2-digit', month:'2-digit', year:'numeric'}); }
  // Va chercher au PMU la cote en direct de chaque cheval de la course choisie et la met dans le tableau
  function repCotes(){
    var m = $('repCoteMsg');
    if (!rep.src) { m.textContent = 'Choisis d\'abord une course (ou une liste du Quinté) pour avoir les cotes en direct.'; return; }
    m.textContent = 'Cotes PMU…';
    var url = rep.src.quinte ? '/api/pmu/quinte?date=' + encodeURIComponent(aujFr()) : '/api/pmu/reunion?date=' + encodeURIComponent(aujFr()) + '&hippo=' + encodeURIComponent(rep.src.hippo);
    fetch(url).then(function(r){ return r.json(); }).then(function(d){
      var parts = null;
      if (rep.src.quinte) parts = d.trouve ? d.partants : null;
      else if (d.trouve) { var num = parseInt(String(rep.src.course).replace(/\D/g, ''), 10); var c = (d.courses || []).filter(function(x){ return x.num === num; })[0]; parts = c ? c.partants : null; }
      if (!parts) { m.textContent = 'Cotes indisponibles pour cette course.'; return; }
      var C = {}; parts.forEach(function(p){ if (!p.np && p.cote) C[p.n] = p.cote; });
      var nb = 0;
      $('repRows').querySelectorAll('tr').forEach(function(r){
        var n = parseInt(r.querySelector('.rn').value, 10);
        if (n && C[n]) { r.querySelector('.rc').value = String(C[n]).replace('.', ','); nb++; }
      });
      m.textContent = nb ? '✓ Cotes PMU en direct à ' + new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) + '. Elles bougent jusqu\'au départ : actualise juste avant de jouer.' : 'Pas encore de cote ouverte pour ces chevaux.';
      repCalc();
    }).catch(function(){ m.textContent = 'Cotes indisponibles pour le moment.'; });
  }
  function repLignes(chevaux){
    var t = $('repRows'); t.innerHTML = '';
    for (var i = 0; i < 4; i++){
      var n = chevaux && chevaux[i] !== undefined ? chevaux[i] : '';
      t.insertAdjacentHTML('beforeend', '<tr><td><input class="rn" inputmode="numeric" value="'+n+'" placeholder="n°"></td><td><input class="rc" inputmode="decimal" placeholder="cote"></td><td class="rm">–</td></tr>');
    }
    t.querySelectorAll('input').forEach(function(x){ x.oninput = repCalc; });
    repCalc();
    if (chevaux && rep.src) repCotes();
  }
  function repCalc(){
    var rows = [].slice.call($('repRows').querySelectorAll('tr')), ch = [];
    rows.forEach(function(r){
      var n = r.querySelector('.rn').value.trim(), c = parseFloat(r.querySelector('.rc').value.replace(',', '.'));
      r.querySelector('.rm').textContent = '–';
      if (n && c > 1) ch.push({ n: n, c: c, td: r.querySelector('.rm') });
    });
    var res = $('repRes'), v = parseFloat($('repVal').value.replace(',', '.'));
    if (ch.length < 2 || !(v > 0)) { res.innerHTML = '<p class="empty">Entre au moins 2 chevaux avec leur cote, puis le montant.</p>'; return; }
    var inv = ch.reduce(function(s, x){ return s + 1/x.c; }, 0), K;
    if (rep.mode === 'mise') K = v / inv;
    else {
      if (inv >= 1) { res.innerHTML = '<p class="msg err">Impossible : avec ces cotes, on ne peut pas viser un bénéfice sur tous les chevaux. Retire un cheval ou attends de meilleures cotes.</p>'; return; }
      K = v / (1 - inv);
    }
    var tot = 0;
    ch.forEach(function(x){ x.m = Math.round(K / x.c * 10) / 10; tot += x.m; x.td.textContent = eur(x.m); });
    var h = '<div class="bilan"><div class="tot"><b>Mise totale</b><b>'+eur(tot)+'</b></div>';
    ch.forEach(function(x){ var enc = x.m * x.c; h += '<div><span>Si le '+esc(x.n)+' gagne : encaisse '+eur(enc)+'</span><span class="'+(enc-tot>=0?'pos':'neg')+'">'+eurS(enc - tot)+'</span></div>'; });
    h += '<div><span>Si aucun ne gagne</span><span class="neg">'+eurS(-tot)+'</span></div></div><p class="note2">Les mises sont arrondies à 0,10 €. Prends la cote du moment, juste avant la course.</p>';
    res.innerHTML = h;
  }

  // ---------- 2. Champ libre ----------
  var cl = { chevaux: [], places: {}, depart: null };
  var RAC = { 'Gagnant':[1], 'Dans les 2':[1,2], 'Dans les 3':[1,2,3], 'Dans les 4':[1,2,3,4], 'Dans les 5':[1,2,3,4,5], 'Écarté':[] };
  function compter(k){
    // nombre d'arrivées ordonnées sur les k premières places, chevaux tous différents
    var cols = []; for (var p = 1; p <= k; p++) cols.push(cl.chevaux.filter(function(n){ return cl.places[n].indexOf(p) >= 0; }));
    var used = {}, total = 0;
    (function rec(p){ if (p === k) { total++; return; } cols[p].forEach(function(n){ if (!used[n]) { used[n] = 1; rec(p+1); used[n] = 0; } }); })(0);
    return total;
  }
  function prix(){
    var t = compter(3), q = compter(4), x = compter(5);
    return { t: t, q: q, x: x, pt: t * 1, pq: q * 1.5, px: x * 2 };
  }
  function clRendu(){
    var p = prix(), h = '<div class="prix">';
    [['Tiercé', p.pt, p.t, cl.depart && cl.depart.pt], ['Quarté', p.pq, p.q, cl.depart && cl.depart.pq], ['Quinté', p.px, p.x, cl.depart && cl.depart.px]].forEach(function(a){
      h += '<div class="'+(a[3] !== undefined && a[3] !== null && a[3] !== a[1] ? 'chg' : '')+'"><small>'+a[0].toUpperCase()+'</small><b>'+eur(a[1])+'</b><small>'+a[2]+' combinaisons</small></div>';
    });
    h += '</div><div class="grille">';
    for (var c = 1; c <= 5; c++){
      h += '<div><small>'+c+(c===1?'er':'e')+'</small>'+cl.chevaux.filter(function(n){ return cl.places[n].indexOf(c) >= 0; }).map(function(n){ return '<b>'+n+'</b>'; }).join(' ')+'</div>';
    }
    h += '</div>';
    if (cl.depart && (cl.depart.pt !== p.pt || cl.depart.pq !== p.pq || cl.depart.px !== p.px)) {
      h += '<p class="gain">Tiercé '+eur(cl.depart.pt)+' → '+eur(p.pt)+'<br>Quarté '+eur(cl.depart.pq)+' → '+eur(p.pq)+'<br>Quinté '+eur(cl.depart.px)+' → '+eur(p.px)+'</p>';
    }
    $('clPrix').innerHTML = h;
    var L = '';
    cl.chevaux.forEach(function(n){
      var pl = cl.places[n], rac = 'Sur mesure';
      Object.keys(RAC).forEach(function(k){ if (RAC[k].join() === pl.join()) rac = k; });
      L += '<div class="clrow" data-n="'+n+'"><div class="clh"><b>'+n+'</b><select>'+Object.keys(RAC).concat(['Sur mesure']).map(function(k){ return '<option'+(k===rac?' selected':'')+'>'+k+'</option>'; }).join('')+'</select><button type="button" class="x" title="Retirer ce cheval">✕</button></div><div class="pls">';
      for (var c = 1; c <= 5; c++) L += '<button type="button" data-p="'+c+'" class="'+(pl.indexOf(c)>=0?'on':'')+'">'+c+(c===1?'er':'e')+'</button>';
      L += '</div></div>';
    });
    $('clChevaux').innerHTML = L || '<p class="empty">Charge une liste ou ajoute tes chevaux.</p>';
    $('clChevaux').querySelectorAll('.clrow').forEach(function(r){
      var n = parseInt(r.getAttribute('data-n'),10);
      r.querySelectorAll('.pls button').forEach(function(b){
        b.onclick = function(){ var p = parseInt(b.getAttribute('data-p'),10), a = cl.places[n], i = a.indexOf(p); if (i >= 0) a.splice(i,1); else { a.push(p); a.sort(); } clRendu(); };
      });
      r.querySelector('select').onchange = function(){ if (RAC[this.value]) { cl.places[n] = RAC[this.value].slice(); clRendu(); } };
      r.querySelector('.x').onclick = function(){ cl.chevaux = cl.chevaux.filter(function(x){ return x !== n; }); delete cl.places[n]; clRendu(); };
    });
  }
  function clCharger(liste){
    cl.chevaux = []; cl.places = {};
    liste.forEach(function(n){ if (cl.chevaux.indexOf(n) < 0) { cl.chevaux.push(n); cl.places[n] = [1,2,3,4,5]; } });
    cl.depart = prix(); clRendu();
  }

  // ---------- 3. Réducteur de chevaux — tickets de 5 ----------
  var rd = { chevaux: [], bases: [], mode: 'multi', ordre: 'fixe', tickets: [] };
  function combis(arr, k){ var out = []; (function rec(s, acc){ if (acc.length === k) { out.push(acc.slice()); return; } for (var i = s; i < arr.length; i++){ acc.push(arr[i]); rec(i+1, acc); acc.pop(); } })(0, []); return out; }
  function couvrir(autres, k, mode){
    // tickets = k chevaux parmi « autres » ; cibles à garantir selon le mode
    var cand = combis(autres, k), cibles, ok;
    if (mode === 'multi') { var t = Math.max(0, k - 1); cibles = combis(autres, t); ok = function(tk, cb){ return cb.every(function(x){ return tk.indexOf(x) >= 0; }); }; }
    else { cibles = combis(autres, k); ok = function(tk, cb){ var c = 0; cb.forEach(function(x){ if (tk.indexOf(x) >= 0) c++; }); return c >= k - 1; }; }
    if (!cibles.length || cibles[0].length === 0) return [cand[0]];
    var M = cand.map(function(tk){ var s = []; cibles.forEach(function(cb, j){ if (ok(tk, cb)) s.push(j); }); return s; });
    var best = null, fin = Date.now() + 250;
    for (var essai = 0; essai < 400 && (essai < 5 || Date.now() < fin); essai++){
      var reste = {}, nr = cibles.length, choix = [];
      cibles.forEach(function(_, j){ reste[j] = 1; });
      while (nr > 0){
        var bv = -1, bi = [];
        M.forEach(function(s, i){ var v = 0; s.forEach(function(j){ if (reste[j]) v++; }); if (v > bv) { bv = v; bi = [i]; } else if (v === bv) bi.push(i); });
        var pick = bi[essai === 0 ? 0 : Math.floor(Math.random() * bi.length)];
        choix.push(pick); M[pick].forEach(function(j){ if (reste[j]) { reste[j] = 0; nr--; } });
        if (best && choix.length >= best.length) break;
      }
      if (nr === 0 && (!best || choix.length < best.length)) best = choix.slice();
    }
    return best.map(function(i){ return cand[i]; });
  }
  function rdCalcul(mode){
    var autres = rd.chevaux.filter(function(n){ return rd.bases.indexOf(n) < 0; });
    var k = 5 - rd.bases.length;
    if (autres.length < k) return null;
    return couvrir(autres, k, mode).map(function(t){ return rd.bases.concat(t.slice().sort(function(a,b){ return a-b; })); });
  }
  function melanger(a){ for (var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i+1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function rdRendu(){
    var z = $('rdBases');
    z.innerHTML = rd.chevaux.map(function(n){ return '<button type="button" class="ch'+(rd.bases.indexOf(n)>=0?' piv':'')+'" data-n="'+n+'">'+n+'</button>'; }).join('');
    z.querySelectorAll('button').forEach(function(b){
      b.onclick = function(){
        var n = parseInt(b.getAttribute('data-n'),10), i = rd.bases.indexOf(n);
        if (i >= 0) rd.bases.splice(i,1); else if (rd.bases.length < 3) rd.bases.push(n);
        rdRendu();
      };
    });
    var ok = rd.chevaux.length >= 8 && rd.chevaux.length <= 11;
    $('rdInfo').textContent = rd.chevaux.length ? rd.chevaux.length + ' chevaux' + (ok ? '' : ' (il en faut de 8 à 11)') + (rd.bases.length ? ' · base' + (rd.bases.length>1?'s':'') + ' : ' + rd.bases.join(', ') : ' · sans base') : '';
    $('rdModes').hidden = !ok; $('rdOut').innerHTML = '';
    if (!ok) return;
    var tous = rd.chevaux.length, nb = rd.bases.length;
    var desc = {
      multi: 'Si les 4 premiers sont tous parmi tes '+tous+' chevaux'+(nb?' (et ta base dedans)':'')+', ils sont ensemble sur au moins un ticket.',
      q45: 'Si les 5 premiers sont parmi tes '+tous+' chevaux'+(nb?' (et ta base dedans)':'')+', au moins un ticket en contient 4 des 5.'
    };
    ['multi','q45'].forEach(function(m){
      var t = rdCalcul(m), el = $('rdM_'+m);
      el.classList.toggle('on', rd.mode === m);
      el.querySelector('p').textContent = desc[m];
      el.querySelector('.nb').textContent = t ? t.length + ' tickets' : '–';
      el.querySelector('.cout').textContent = t ? 'Quinté ' + eur(t.length*2) + ' · Multi ' + eur(t.length*2.5) : '';
      el._t = t;
    });
  }
  function rdFabriquer(){
    var t = $('rdM_'+rd.mode)._t; if (!t) return;
    var lignes = t.map(function(l){ return rd.ordre === 'melange' ? melanger(l.slice()) : l.slice(); });
    if (rd.ordre === 'melange') melanger(lignes);
    var h = '<h3>'+lignes.length+' tickets de 5 chevaux'+(rd.ordre==='melange'?' · mélangés':'')+'</h3><p class="note2">Quinté : '+eur(lignes.length*2)+' · Multi à 0,50 € : '+eur(lignes.length*2.5)+'</p><table class="tk"><tr><th></th><th>C1</th><th>C2</th><th>C3</th><th>C4</th><th>C5</th></tr>';
    lignes.forEach(function(l, i){ h += '<tr><td class="i">'+(i+1)+'</td>'+l.map(function(n){ return '<td class="'+(rd.bases.indexOf(n)>=0?'b':'')+'">'+n+'</td>'; }).join('')+'</tr>'; });
    h += '</table>'+(rd.bases.length?'<p class="note2">En jaune : ta base, sur chaque ticket.</p>':'');
    $('rdOut').innerHTML = h;
  }
  function rdCharger(liste){ rd.chevaux = liste.slice(0, 11); rd.bases = []; $('rdNums').value = rd.chevaux.join(' '); rdRendu(); }

  // ---------- Démarrage ----------
  function init(){
    // onglets des outils
    document.querySelectorAll('.otab').forEach(function(b){
      b.onclick = function(){
        document.querySelectorAll('.otab').forEach(function(x){ x.classList.toggle('on', x === b); });
        document.querySelectorAll('.opanel').forEach(function(p){ p.hidden = p.id !== b.getAttribute('data-p'); });
      };
    });
    // Répartition
    var srcRep = listesCourses().map(function(l){ return { nom: l.nom, hippo: l.hippo, course: l.course, chevaux: l.chevaux.slice(0,3) }; });
    boutonsCourses($('repSrcC'), srcRep, function(l){ rep.src = { hippo: l.hippo, course: l.course }; repLignes(l.chevaux); });
    boutons($('repSrcQ'), listesQuinte().map(function(l){ return { nom: l.nom, chevaux: l.chevaux.slice(0,3) }; }), function(l){ rep.src = { quinte: true }; repLignes(l.chevaux); });
    $('repMaj').onclick = repCotes;
    $('repMise').onclick = function(){ rep.mode = 'mise'; this.classList.add('on'); $('repBen').classList.remove('on'); $('repLab').textContent = 'Mise totale (€)'; repCalc(); };
    $('repBen').onclick = function(){ rep.mode = 'ben'; this.classList.add('on'); $('repMise').classList.remove('on'); $('repLab').textContent = 'Bénéfice voulu (€)'; repCalc(); };
    $('repVal').oninput = repCalc;
    repLignes([]);
    // Champ libre
    boutons($('clSrc'), listesQuinte(), function(l){ clCharger(l.chevaux); });
    boutonsCourses($('clSrcC'), listesCourses(), function(l){ clCharger(l.chevaux); });
    $('clAdd').onclick = function(){ nums($('clNum').value).forEach(function(n){ if (cl.chevaux.indexOf(n) < 0) { cl.chevaux.push(n); cl.places[n] = [1,2,3,4,5]; } }); $('clNum').value = ''; if (!cl.depart) cl.depart = prix(); clRendu(); };
    $('clVider').onclick = function(){ cl.chevaux = []; cl.places = {}; cl.depart = null; clRendu(); };
    clRendu();
    // Réducteur
    boutons($('rdSrcQ'), listesQuinte(), function(l){ rdCharger(l.chevaux); });
    boutonsCourses($('rdSrcC'), listesCourses(), function(l){ rdCharger(l.chevaux); });
    $('rdNums').oninput = function(){ rd.chevaux = nums(this.value).slice(0, 11); rd.bases = rd.bases.filter(function(b){ return rd.chevaux.indexOf(b) >= 0; }); rdRendu(); };
    ['multi','q45'].forEach(function(m){ $('rdM_'+m).onclick = function(){ rd.mode = m; rdRendu(); }; });
    $('rdFixe').onclick = function(){ rd.ordre = 'fixe'; this.classList.add('on'); $('rdMel').classList.remove('on'); rdFabriquer(); };
    $('rdMel').onclick = function(){ rd.ordre = 'melange'; this.classList.add('on'); $('rdFixe').classList.remove('on'); rdFabriquer(); };
    $('rdGo').onclick = rdFabriquer;
    rdRendu();
  }
  window.NTOutils = { demarrer: function(q, c){ DATA.quinte = q; DATA.cpc = c; init(); } };
})();
