// Lecture du fichier N-Turf (.xlsm) et affichage du Quinté — utilisé par l'administration et l'espace membres
var NT = (function(){
  function val(ws, a){ var c = ws && ws[a]; return c ? c.v : null; }
  function num(ws, a){
    var v = val(ws, a);
    if (typeof v === 'number') return Math.round(v);
    if (typeof v === 'string' && /^\s*\d{1,2}\s*$/.test(v)) return parseInt(v, 10);
    return null;
  }
  var COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function rangee(ws, ligne, de, a){
    var out = [];
    for (var i = COLS.indexOf(de); i <= COLS.indexOf(a); i++){ var n = num(ws, COLS[i] + ligne); if (n !== null) out.push(n); }
    return out;
  }
  function rapport(ws, a){
    var v = val(ws, a);
    if (v === null || v === '') return null;
    if (typeof v === 'number') return v;
    return String(v).trim();
  }
  function dateFr(v){
    if (v instanceof Date) return ('0'+v.getDate()).slice(-2)+'/'+('0'+(v.getMonth()+1)).slice(-2)+'/'+v.getFullYear();
    return v ? String(v) : '';
  }
  function lireApproche(wb, feuille){
    var ws = wb.Sheets[feuille]; if (!ws) return null;
    return { selection: rangee(ws, 22, 'B', 'M') };
  }
  function lire(wb){
    var s = wb.Sheets['Saisie'];
    if (!s) throw new Error("La feuille « Saisie » est introuvable : est-ce bien ton fichier N-Turf ?");
    var d = {
      date: dateFr(val(s, 'B1')),
      discipline: val(s, 'E1') || '',
      partants: num(s, 'E2'),
      lignes: { A: rangee(s,4,'B','I'), B: rangee(s,5,'B','I'), C: rangee(s,6,'B','I'), D: rangee(s,7,'B','I') },
      pondere: rangee(s, 9, 'B', 'I'),
      synthese: rangee(s, 10, 'B', 'I'),
      perso: rangee(s, 11, 'B', 'I'),
      arrivee: rangee(s, 3, 'N', 'R'),
      rapports: {
        'Simple gagnant': rapport(s,'N7'), 'Simple placé 1er': rapport(s,'O7'), 'Simple placé 2e': rapport(s,'P7'), 'Simple placé 3e': rapport(s,'Q7'),
        'Couplé gagnant': rapport(s,'N9'), 'Couplé placé 1-2': rapport(s,'O9'), 'Couplé placé 1-3': rapport(s,'P9'), 'Couplé placé 2-3': rapport(s,'Q9'),
        'Tiercé ordre': rapport(s,'O10'), 'Tiercé désordre': rapport(s,'Q10'),
        'Quarté ordre': rapport(s,'O11'), 'Quarté désordre': rapport(s,'Q11'), 'Quarté bonus 3': rapport(s,'S11'),
        'Quinté ordre': rapport(s,'O12'), 'Quinté désordre': rapport(s,'Q12'), 'Quinté bonus 4': rapport(s,'S12'), 'Quinté bonus 3': rapport(s,'U12'),
        '2 sur 4': rapport(s,'O13'), 'Multi': rapport(s,'Q13')
      },
      approches: {}
    };
    Object.keys(d.rapports).forEach(function(k){ if (d.rapports[k] === null) delete d.rapports[k]; });
    [['TCR','Page TCR'],['ALGO','Page ALGO'],['PERSO','Page PERSO']].forEach(function(x){
      var a = lireApproche(wb, x[1]); if (a && a.selection.length) d.approches[x[0]] = a;
    });
    if (!d.date) throw new Error('La date (case B1 de la feuille Saisie) est vide.');
    if (d.synthese.length < 3) throw new Error('La synthèse (ligne 10 de la feuille Saisie) est vide ou incomplète.');
    return d;
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function chip(n, arr, cls){
    var hit = arr.indexOf(n) >= 0;
    return '<span class="ch'+(cls?' '+cls:'')+(hit?' hit':'')+'">'+esc(n)+'</span>';
  }
  function euros(v){ return typeof v === 'number' ? v.toFixed(2).replace('.', ',') + ' €' : esc(v); }

  function afficher(q){
    if (!q) return '<p class="empty">Le Quinté du jour arrive.</p>';
    var arr = q.arrivee || [];
    var h = '<p class="lead">Quinté+ du '+esc(q.date)+(q.discipline?' · '+esc(q.discipline):'')+(q.partants?' · '+esc(q.partants)+' partants':'')+'</p>';
    if (arr.length){
      h += '<div class="arrivee"><b>Arrivée</b> '+arr.map(function(n){return '<span class="ch hit">'+esc(n)+'</span>';}).join('')+'</div>';
    }
    var rows = [['Ligne A', q.lignes.A], ['Ligne B', q.lignes.B], ['Ligne C', q.lignes.C], ['Ligne D', q.lignes.D],
                ['Pondéré', q.pondere], ['Synthèse', q.synthese, 'syn'], ['Perso', q.perso]];
    h += '<h3>Tableau de saisie</h3><table class="saisie">';
    rows.forEach(function(r){
      if (!r[1] || !r[1].length) return;
      h += '<tr class="'+(r[2]||'')+'"><th>'+r[0]+'</th>'+r[1].map(function(n){ return '<td'+(arr.indexOf(n)>=0?' class="hit"':'')+'>'+esc(n)+'</td>'; }).join('')+'</tr>';
    });
    h += '</table>';
    Object.keys(q.approches || {}).forEach(function(k){
      var a = q.approches[k];
      h += '<h3>'+k+'</h3><div class="sel">'+a.selection.map(function(n,i){ return chip(n, arr, i===0?'piv':''); }).join('')+'</div>';
    });
    var rk = Object.keys(q.rapports || {});
    if (rk.length){
      h += '<h3>Rapports (pour 1 €)</h3><table class="rap">'+rk.map(function(k){ return '<tr><td>'+esc(k)+'</td><td>'+euros(q.rapports[k])+'</td></tr>'; }).join('')+'</table>';
    }
    return h;
  }
  // ===== Course par course (feuille « Saisie Journaux ») =====
  function nums(v){
    if (v === null || v === undefined || v === '') return [];
    if (typeof v === 'number') return [Math.round(v)];
    return String(v).split(/[^0-9]+/).filter(Boolean).map(function(x){ return parseInt(x,10); });
  }
  function hippo(h){
    h = String(h||'').trim(); if (!h) return '';
    if (/^vincennes$/i.test(h)) return 'Paris-Vincennes';
    return h.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, function(m,a,b){ return a + b.toUpperCase(); });
  }
  var RAP = ['Gagnant','Placé 1er','Placé 2e','Placé 3e','Couplé gagnant','Couplé placé 1-2','Couplé placé 1-3','Couplé placé 2-3','Trio','Multi 4','Multi 5','Multi 6','Multi 7','Super 4'];
  function lireCpc(wb){
    var ws = wb.Sheets['Saisie Journaux'];
    if (!ws) throw new Error("La feuille « Saisie Journaux » est introuvable : est-ce bien ton fichier course par course ?");
    var reunions = [], date = '';
    for (var r = 1; r <= 400; r++){
      var a = val(ws, 'A'+r);
      if (!(a && /^RÉUNION/i.test(String(a)))) continue;
      var h = hippo(val(ws, 'G'+r));
      if (!date) date = dateFr(val(ws, 'C'+r));
      var re = { nom: String(a).replace(/^RÉUNION/i,'Réunion'), hippodrome: h, brut: String(val(ws, 'G'+r)||'').trim(), discipline: val(ws,'I'+r) || '', courses: [] };
      for (var k = 0; k < 10; k++){
        var b = r + 2 + k*8;
        var lab = val(ws, 'A'+b); if (!lab) continue;
        var c = {
          course: String(lab).trim(),
          synthese: rangee(ws, b+4, 'C', 'J'),
          choix: rangee(ws, b+3, 'C', 'J'),
          notes: nums(val(ws, 'L'+(b+1))).concat(nums(val(ws, 'M'+(b+1)))),
          arrivee: rangee(ws, b+5, 'C', 'G'),
          rapports: {}
        };
        RAP.forEach(function(nom, i){ var v = rapport(ws, COLS[2+i] + (b+7)); if (v !== null) c.rapports[nom] = v; });
        if (c.synthese.length || c.arrivee.length) re.courses.push(c);
      }
      if (h && re.courses.length) reunions.push(re);
    }
    if (!reunions.length) throw new Error('Aucune réunion remplie dans la feuille Saisie Journaux.');
    var reperes = [], wr = wb.Sheets['Repérés'];
    if (wr) for (var i = 2; i <= 3000; i++){ var nm = val(wr, 'A'+i); if (nm) reperes.push(String(nm).trim()); }
    return { date: date, reunions: reunions, reperes: reperes };
  }
  function cle(n){ return String(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function afficherCpc(d, onglet, live){
    if (!d || !d.reunions || !d.reunions.length) return '<p class="empty">La synthèse arrive.</p>';
    live = live || {};
    var rep = {}; (d.reperes || []).forEach(function(n){ rep[cle(n)] = 1; });
    var h = '<p class="lead">Course par course du '+esc(d.date)+'</p><nav class="tabs inner">';
    d.reunions.forEach(function(re, i){ h += '<a href="#" data-r="'+i+'" class="'+(i===(onglet||0)?'on':'')+'">'+esc(re.hippodrome)+'</a>'; });
    h += '</nav>';
    d.reunions.forEach(function(re, i){
      var L = live[i] && live[i].trouve ? live[i] : null;
      var infos = re.courses.map(function(c){
        var num = parseInt(String(c.course).replace(/\D/g,''), 10);
        var lc = L ? (L.courses || []).filter(function(x){ return x.num === num; })[0] : null;
        var arr = c.arrivee.slice(0,4), etat = '', raps = Object.keys(c.rapports).map(function(k){ return {nom:k, euros:c.rapports[k]}; });
        if (lc && lc.arrivee.length && (lc.definitive || !arr.length)) {
          arr = lc.arrivee.slice(0,4); etat = lc.definitive ? '' : 'provisoire';
          if (lc.rapports.length) raps = lc.rapports;
        }
        var parts = lc ? lc.partants : [];
        var repNums = parts.filter(function(p){ return rep[cle(p.nom)]; }).map(function(p){ return p.n; });
        return { c: c, lc: lc, arr: arr, etat: etat, raps: raps, parts: parts, repNums: repNums };
      });
      h += '<div class="reu" data-r="'+i+'"'+(i===(onglet||0)?'':' hidden')+'>';
      h += '<div class="cbtn">'+infos.map(function(x, j){ return '<a href="#c'+i+'-'+j+'" class="'+(x.arr.length?'couru':'')+'">'+esc(x.c.course.replace('C',''))+'</a>'; }).join('')+'</div>';
      infos.forEach(function(x, j){
        var c = x.c, top = x.arr;
        function marques(n){ return (c.choix.indexOf(n)>=0?'<i class="cc">❤</i>':'') + (c.notes.indexOf(n)>=0?'<i class="st">★</i>':'') + (x.repNums.indexOf(n)>=0?'<i class="rb">★</i>':''); }
        var heure = x.lc && x.lc.heure ? new Date(x.lc.heure).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}) : '';
        h += '<div class="crs" id="c'+i+'-'+j+'"><h3>'+esc(c.course)+' <small>'+esc([heure, re.discipline].filter(Boolean).join(' · '))+'</small></h3>';
        if (!c.synthese.length) h += '<p class="empty">La synthèse arrive.</p>';
        else h += '<div class="sel">'+c.synthese.map(function(n, k){
          return '<span class="ch '+(k < 3 ? 'piv' : '')+(top.indexOf(n)>=0?' hit':'')+'">'+esc(n)+marques(n)+'</span>';
        }).join('')+'</div>';
        var hors = c.choix.concat(c.notes).concat(x.repNums).filter(function(n, k, t){ return c.synthese.indexOf(n) < 0 && t.indexOf(n) === k; });
        if (hors.length) h += '<p class="sub">Hors synthèse : '+hors.map(function(n){ return '<span class="ch bleu'+(top.indexOf(n)>=0?' hit':'')+'">'+esc(n)+marques(n)+'</span>'; }).join('')+'</p>';
        if (top.length) h += '<div class="arrivee"><b>Arrivée'+(x.etat?' <span class="prov">(provisoire)</span>':'')+'</b> '+top.map(function(n){ return '<span class="ch'+(c.synthese.indexOf(n)>=0||hors.indexOf(n)>=0?' hit':'')+'">'+esc(n)+'</span>'; }).join('')+'</div>';
        if (x.raps.length) h += '<table class="rap">'+x.raps.map(function(r){ return '<tr><td>'+esc(r.nom)+'</td><td>'+euros(r.euros)+'</td></tr>'; }).join('')+'</table>';
        if (x.parts.length) h += '<details class="parts"><summary>Partants ('+x.parts.filter(function(p){return !p.np;}).length+')</summary><table>'+x.parts.map(function(p){
          return '<tr class="'+(p.np?'np':'')+'"><td>'+esc(p.n)+(x.repNums.indexOf(p.n)>=0?' <span class="rbs">★</span>':'')+'</td><td>'+esc(p.nom)+(p.np?' (NP)':'')+'</td><td class="mus">'+esc(p.musique)+'</td></tr>';
        }).join('')+'</table></details>';
        h += '</div>';
      });
      h += '</div>';
    });
    return h;
  }
  // Va chercher les données PMU de chaque réunion puis rappelle fin(live)
  function chargerLive(d, fin){
    if (!d || !d.reunions) return fin({});
    var live = {}, reste = d.reunions.length;
    d.reunions.forEach(function(re, i){
      fetch('/api/pmu/reunion?date='+encodeURIComponent(d.date)+'&hippo='+encodeURIComponent(re.brut || re.hippodrome))
        .then(function(r){ return r.json(); }).then(function(x){ live[i] = x; })
        .catch(function(){}).then(function(){ if (--reste === 0) fin(live); });
    });
  }
  function brancherOnglets(root){
    root.querySelectorAll('nav.inner a').forEach(function(a){
      a.onclick = function(e){
        e.preventDefault();
        root.querySelectorAll('nav.inner a').forEach(function(x){ x.className = x === a ? 'on' : ''; });
        root.querySelectorAll('.reu').forEach(function(x){ x.hidden = x.getAttribute('data-r') !== a.getAttribute('data-r'); });
      };
    });
  }
  return { lire: lire, afficher: afficher, lireCpc: lireCpc, afficherCpc: afficherCpc, brancherOnglets: brancherOnglets, chargerLive: chargerLive };
})();
