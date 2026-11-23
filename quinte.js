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
    if (v instanceof Date) { v = new Date(v.getTime() + 12*3600*1000); return ('0'+v.getDate()).slice(-2)+'/'+('0'+(v.getMonth()+1)).slice(-2)+'/'+v.getFullYear(); }
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
    // Page Score : pour chaque place, combien de fois chaque case des lignes A-D a donné cette place
    var sc = wb.Sheets['Score'];
    if (sc) {
      d.score = [];
      for (var p = 0; p < 5; p++){
        var pl = {};
        ['A','B','C','D'].forEach(function(L, li){ var r = 2 + 5*p + li, a = []; for (var k = 0; k < 8; k++){ var v = val(sc, COLS[1+k] + r); a.push(typeof v === 'number' ? v : 0); } pl[L] = a; });
        d.score.push(pl);
      }
    }
    function txts(ligne, de, a){ var out = []; for (var i = COLS.indexOf(de); i <= COLS.indexOf(a); i++){ var v = val(s, COLS[i]+ligne); if (v !== null && v !== '') out.push(String(v).trim()); } return out; }
    d.citations = {
      une: rangee(s, 13, 'B', 'Z'),
      doublons: rangee(s, 15, 'B', 'Z'),
      plus: txts(16, 'B', 'Z').map(function(t){ var m = t.match(/^(\d+)\s*\((\d+)x\)/); return m ? { n: parseInt(m[1],10), fois: parseInt(m[2],10) } : null; }).filter(Boolean).sort(function(a,b){ return b.fois - a.fois; })
    };
    d.communs = {
      ab: rangee(s, 17, 'B', 'L'), abR4: rangee(s, 17, 'N', 'Z'),
      cd: rangee(s, 18, 'B', 'L'), cdR4: rangee(s, 18, 'N', 'Z'),
      tierce: rangee(s, 21, 'B', 'Z')
    };
    d.cotes = [];
    for (var i = 1; i < 26; i++){ var nn = num(s, COLS[i]+'23'), cv = val(s, COLS[i]+'24'); if (nn !== null && typeof cv === 'number') d.cotes.push({ n: nn, cote: cv }); }
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

  var TEINTES = [['#f3d57a','#f7e3a6','#fbf0d1'],['#a9d8b0','#c9e6cd','#e4f2e6'],['#a9c4ef','#c9d9f5','#e4ecfa'],['#f1b0b3','#f6cdcf','#fae6e7'],['#cdbbf0','#ded2f5','#efe9fa']];
  // Pour chaque place, les 3 cases des lignes A-D qui l'ont donnée le plus souvent (une case = une seule couleur)
  function meilleuresCases(q){
    var pris = {}, couleurs = {}, parPlace = [];
    if (!q.score) return { couleurs: couleurs, parPlace: parPlace };
    for (var p = 0; p < 5; p++){
      var cases = [];
      ['A','B','C','D'].forEach(function(L){ (q.lignes[L] || []).forEach(function(n, k){ cases.push({ L: L, k: k, n: n, v: q.score[p][L][k] || 0 }); }); });
      cases.sort(function(a, b){ return b.v - a.v; });
      var libres = cases.filter(function(c){ return !pris[c.L + c.k]; }), top = libres.slice(0, 3);
      top.forEach(function(c, r){ pris[c.L + c.k] = 1; couleurs[c.L + c.k] = TEINTES[p][r]; });
      var seuil = top.length ? top[top.length-1].v : 0, chev = [];
      libres.forEach(function(c){ if ((c.v >= seuil || chev.length < 3) && chev.indexOf(c.n) < 0) chev.push(c.n); });
      parPlace.push(chev);
    }
    return { couleurs: couleurs, parPlace: parPlace };
  }
  function ligneNums(titre, a){ return '<tr><th>'+titre+'</th><td>'+(a && a.length ? a.map(function(n){ return '<span class="nb">'+esc(n)+'</span>'; }).join('') : '<span class="empty">aucun</span>')+'</td></tr>'; }

  function afficher(q, live){
    if (!q) return '<p class="empty">Le Quinté du jour arrive.</p>';
    live = live && live.trouve ? live : null;
    var arr = q.arrivee || [], etat = '', raps = Object.keys(q.rapports || {}).map(function(k){ return { nom: k, euros: q.rapports[k] }; });
    if (live && live.arrivee.length && (live.definitive || !arr.length)) { arr = live.arrivee.slice(0,5); etat = live.definitive ? '' : 'provisoire'; if (live.rapports.length) raps = live.rapports; }
    var noms = {}; if (live) live.partants.forEach(function(p){ noms[p.n] = p; });
    var heure = live && live.heure ? new Date(live.heure).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}) : '';
    var h = '<p class="lead">Quinté+ du '+esc(q.date)+(live && live.libelle ? ' · '+esc(live.libelle) : '')+(heure?' · '+heure:'')+(q.partants?' · '+esc(q.partants)+' partants':'')+'</p>';
    if (arr.length){
      h += '<div class="arrivee"><b>Arrivée'+(etat?' <span class="prov">(provisoire)</span>':'')+'</b> '+arr.map(function(n){
        // rouge seulement sur un cheval cité dans nos lignes ou classements, jamais sur un cheval non cité
        var cite = ['A','B','C','D'].some(function(L){ return (q.lignes[L] || []).indexOf(n) >= 0; }) || [q.pondere, q.synthese, q.perso].some(function(t){ return (t || []).indexOf(n) >= 0; });
        return '<span class="ch'+(cite?' hit':'')+'">'+esc(n)+'</span>';
      }).join('')+'</div>';
    }
    var mc = meilleuresCases(q);
    h += '<h3>Lignes et classements</h3><table class="saisie">';
    ['A','B','C','D'].forEach(function(L){
      var a = q.lignes[L] || []; if (!a.length) return;
      h += '<tr class="lig"><th>Ligne '+L+'</th>'+a.map(function(n, k){
        var hit = arr.indexOf(n) >= 0, col = mc.couleurs[L + k];
        return '<td class="'+(hit?'arr':'')+(col?' col':'')+'"'+(col ? ' style="background:'+col+'"' : '')+'>'+esc(n)+'</td>';
      }).join('')+'</tr>';
    });
    [['Classement pondéré', q.pondere], ['Synthèse', q.synthese, 'syn'], ['Pronos Perso', q.perso]].forEach(function(r){
      if (!r[1] || !r[1].length) return;
      h += '<tr class="'+(r[2]||'bas')+'"><th>'+r[0]+'</th>'+r[1].map(function(n){ return '<td'+(arr.indexOf(n)>=0?' class="hit"':'')+'>'+esc(n)+'</td>'; }).join('')+'</tr>';
    });
    h += '</table>';
    if (mc.parPlace.length){
      h += '<p class="note2">Les cases en couleur sont les 3 qui donnent le plus souvent chaque place (la plus foncée = la meilleure) :</p><p class="legende">'+
        ['1er','2e','3e','4e','5e'].map(function(t, p){ return TEINTES[p].map(function(c){ return '<i style="background:'+c+'"></i>'; }).join('')+' le '+t; }).join(' &nbsp; ')+'</p>';
      h += '<p class="note2">Les chevaux par place, du meilleur au moins bon (3 au moins) :</p><table class="parplace">'+mc.parPlace.map(function(a, p){ return '<tr><th>'+['1er','2e','3e','4e','5e'][p]+'</th><td>'+a.map(function(n){ return '<b'+(arr.indexOf(n)>=0?' class="hit"':'')+'>'+esc(n)+'</b>'; }).join(' ')+'</td></tr>'; }).join('')+'</table>';
    }
    Object.keys(q.approches || {}).forEach(function(k){
      var a = q.approches[k];
      h += '<h3>'+k+'</h3><div class="sel">'+a.selection.map(function(n,i){ return chip(n, arr, i===0?'piv':''); }).join('')+'</div>';
    });
    if (q.citations){
      var c = q.citations;
      h += '<h3>Citations</h3><table class="infos">'+ligneNums('Cités 1 fois', c.une)+ligneNums('Doublons (2 fois)', c.doublons)+'</table>';
      if (c.plus.length) h += '<p class="sub">3 fois ou plus</p><table class="infos fois"><tr><th>Cheval</th>'+c.plus.map(function(x){ return '<td><b>'+x.n+'</b></td>'; }).join('')+'</tr><tr><th>Fois</th>'+c.plus.map(function(x){ return '<td>'+x.fois+'x</td>'; }).join('')+'</tr></table>';
    }
    if (q.communs){
      var m = q.communs;
      h += '<h3>Lignes en commun</h3><table class="infos">'+ligneNums('A et B (les 2)', m.ab)+ligneNums('A et B · Rang+4', m.abR4)+ligneNums('C et D (les 2)', m.cd)+ligneNums('C et D · Rang+4', m.cdR4)+ligneNums('Tiercé champ réduit', m.tierce)+'</table>';
    }
    if (q.cotes && q.cotes.length){
      h += '<h3>Cotes du matin</h3><table class="rap cotes">'+q.cotes.map(function(c){ var p = noms[c.n]; return '<tr'+(p && p.np ? ' class="np"' : '')+'><td><b>'+c.n+'</b> '+(p ? esc(p.nom)+(p.np?' (NP)':'') : '')+'</td><td>'+esc(c.cote)+'</td></tr>'; }).join('')+'</table>';
    }
    if (raps.length){
      h += '<h3>Rapports (pour 1 €)</h3><table class="rap">'+raps.map(function(r){ return '<tr><td>'+esc(r.nom)+'</td><td>'+euros(r.euros)+'</td></tr>'; }).join('')+'</table>';
    }
    return h;
  }
  function chargerQuinte(q, fin){
    if (!q || !q.date) return fin(null);
    fetch('/api/pmu/quinte?date='+encodeURIComponent(q.date)).then(function(r){ return r.json(); }).then(fin).catch(function(){ fin(null); });
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
    // Historique pour les statistiques : feuille « Archive Journaux »
    var archive = [], wa = wb.Sheets['Archive Journaux'];
    if (wa && wa['!ref']) {
      var rg = XLSX.utils.decode_range(wa['!ref']), col = {};
      for (var c = rg.s.c; c <= rg.e.c; c++){ var hd = wa[XLSX.utils.encode_cell({r: 0, c: c})]; if (hd && hd.v) col[String(hd.v).trim()] = c; }
      var cell = function(r, nom){ var cc = col[nom]; if (cc === undefined) return null; var x = wa[XLSX.utils.encode_cell({r: r, c: cc})]; return x ? x.v : null; };
      var nb = function(v){ return typeof v === 'number' ? Math.round(v) : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? parseInt(v, 10) : null); };
      var rap = function(v){ return typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? v.trim() : null); };
      for (var r = 1; r <= rg.e.r; r++){
        var dv = cell(r, 'Date'); if (!dv) continue;
        var syn = [], arr = [];
        for (var i = 1; i <= 8; i++){ var n1 = nb(cell(r, 'Synthèse ' + i)); if (n1) syn.push(n1); }
        for (var j = 1; j <= 4; j++){ var n2 = nb(cell(r, 'Arrivée ' + j)); if (n2) arr.push(n2); }
        if (!syn.length || arr.length < 2) continue;
        archive.push({ d: dateFr(dv), h: hippo(cell(r, 'Hippodrome')), di: cell(r, 'Discipline') || 'Autre', c: String(cell(r, 'Course') || ''), s: syn, a: arr,
          g: rap(cell(r, 'Rapport Gagnant')), p: [rap(cell(r, 'Rapport Placé 1er')), rap(cell(r, 'Rapport Placé 2e')), rap(cell(r, 'Rapport Placé 3e'))],
          cg: rap(cell(r, 'Couplé gagnant')), t: rap(cell(r, 'Trio')), m4: rap(cell(r, 'Multi 4')), s4: rap(cell(r, 'Super 4')) });
      }
    }
    var reperes = [], wr = wb.Sheets['Repérés'];
    if (wr) for (var i = 2; i <= 3000; i++){ var nm = val(wr, 'A'+i); if (nm) reperes.push(String(nm).trim()); }
    return { date: date, reunions: reunions, reperes: reperes, archive: archive };
  }
  function cle(n){ return String(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  var SEL = {}, LEG = false;
  function afficherCpc(d, onglet, live){
    if (!d || !d.reunions || !d.reunions.length) return '<p class="empty">La synthèse arrive.</p>';
    live = live || {};
    var rep = {}; (d.reperes || []).forEach(function(n){ rep[cle(n)] = 1; });
    var h = '<p class="lead">Course par course du '+esc(d.date)+'</p>';
    h += '<details class="legcpc"'+(LEG?' open':'')+'><summary>ⓘ Comment lire nos pronostics ?</summary><ul>'+
      '<li><span class="ch piv">5</span> les 3 premiers de notre synthèse, puis la suite de la synthèse en blanc</li>'+
      '<li><span class="ch">5<i class="cc">❤</i></span> coup de cœur de Bruno</li>'+
      '<li><span class="ch">5<i class="st">★</i></span> étoile rouge : cheval noté par Bruno</li>'+
      '<li><span class="ch">5<i class="rb">★</i></span> étoile bleue : cheval repéré (suivi des courses)</li>'+
      '<li><span class="ch bleu">5</span> « Hors synthèse » : coups de cœur, notes et repérés qui ne sont pas dans la synthèse</li>'+
      '<li><span class="ch hit">5</span> en rouge : cheval de notre pronostic arrivé dans les 4 premiers</li>'+
      '<li class="sans"><span class="btnex couru">3</span> course déjà courue · <span class="btnex on">4</span> course affichée</li>'+
      '<li class="sans">Partants : <b class="fer">D4</b> déferré des 4 pieds, <b class="fer">DA</b> des antérieurs, <b class="fer">DP</b> des postérieurs, <b class="fer">PA / PP / P4</b> protégé ; « Ferré » = pas de déferrage ; <b class="rec">+25 m</b> = recul</li>'+
      '</ul></details>';
    h += '<nav class="tabs inner">';
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
      // Une seule course affichée à la fois : celle choisie, sinon la prochaine à courir
      var sel = SEL[i];
      if (sel === undefined || sel >= infos.length) { sel = 0; for (var q = 0; q < infos.length; q++) { if (!infos[q].arr.length) { sel = q; break; } sel = q; } }
      h += '<div class="cbtn">'+infos.map(function(x, j){ return '<a href="#" data-r="'+i+'" data-c="'+j+'" class="'+(x.arr.length?'couru':'')+(j===sel?' on':'')+'">'+esc(x.c.course.replace('C',''))+'</a>'; }).join('')+'</div>';
      infos.forEach(function(x, j){
        var c = x.c, top = x.arr;
        function marques(n){ return (c.choix.indexOf(n)>=0?'<i class="cc">❤</i>':'') + (c.notes.indexOf(n)>=0?'<i class="st">★</i>':'') + (x.repNums.indexOf(n)>=0?'<i class="rb">★</i>':''); }
        var heure = x.lc && x.lc.heure ? new Date(x.lc.heure).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}) : '';
        var DISC = {ATTELE:'Trot attelé', MONTE:'Trot monté', PLAT:'Plat', HAIE:'Haies', STEEPLECHASE:'Steeple-chase', CROSS:'Cross'};
        var disc = x.lc && DISC[x.lc.discipline] ? DISC[x.lc.discipline] : re.discipline;
        h += '<div class="crs" id="c'+i+'-'+j+'"'+(j===sel?'':' hidden')+'><h3>'+esc(c.course)+' <small>'+esc([heure, disc].filter(Boolean).join(' · '))+'</small></h3>';
        if (!c.synthese.length) h += '<p class="empty">La synthèse arrive.</p>';
        else h += '<div class="sel">'+c.synthese.map(function(n, k){
          return '<span class="ch '+(k < 3 ? 'piv' : '')+(top.indexOf(n)>=0?' hit':'')+'">'+esc(n)+marques(n)+'</span>';
        }).join('')+'</div>';
        var hors = c.choix.concat(c.notes).concat(x.repNums).filter(function(n, k, t){ return c.synthese.indexOf(n) < 0 && t.indexOf(n) === k; });
        if (hors.length) h += '<p class="sub">Hors synthèse : '+hors.map(function(n){ return '<span class="ch bleu'+(top.indexOf(n)>=0?' hit':'')+'">'+esc(n)+marques(n)+'</span>'; }).join('')+'</p>';
        if (top.length) h += '<div class="arrivee"><b>Arrivée'+(x.etat?' <span class="prov">(provisoire)</span>':'')+'</b> '+top.map(function(n){ return '<span class="ch'+(c.synthese.indexOf(n)>=0||hors.indexOf(n)>=0?' hit':'')+'">'+esc(n)+'</span>'; }).join('')+'</div>';
        if (x.raps.length) h += '<table class="rap">'+x.raps.map(function(r){ return '<tr><td>'+esc(r.nom)+'</td><td>'+euros(r.euros)+'</td></tr>'; }).join('')+'</table>';
        if (x.parts.length) {
          var trot = /ATTELE|MONTE/.test((x.lc && x.lc.discipline) || '') || /trot/i.test(re.discipline || '');
          var dist = x.lc && x.lc.distance ? ' · ' + x.lc.distance + ' m' : '';
          h += '<details class="parts" open><summary>Partants ('+x.parts.filter(function(p){return !p.np;}).length+')'+dist+'</summary><div class="plist">'+x.parts.map(function(p){
            var inf = [];
            if (p.monte) inf.push('<b>'+esc(p.monte)+'</b>');
            if (trot) { inf.push(p.fer ? '<span class="fer">'+esc(p.fer)+'</span>' : 'Ferré'); if (p.recul) inf.push('<span class="rec">+'+p.recul+' m</span>'); }
            else { if (p.poids) inf.push(String(p.poids).replace('.', ',')+' kg'); if (p.corde) inf.push('corde '+p.corde); }
            if (p.oeil) inf.push(esc(p.oeil));
            if (p.entr) inf.push('entr. '+esc(p.entr));
            return '<div class="pt'+(p.np?' np':'')+(c.choix.indexOf(p.n)>=0?' coeur':'')+'"><div class="l1"><span class="pn">'+esc(p.n)+'</span><span class="pnom">'+(c.choix.indexOf(p.n)>=0?'<span class="pcoeur">❤</span> ':'')+(c.notes.indexOf(p.n)>=0?'<span class="pnote">★</span> ':'')+esc(p.nom)+(x.repNums.indexOf(p.n)>=0?' <span class="rbs">★</span>':'')+(p.np?' (NP)':'')+(p.age?' <small>'+esc(p.sexe)+p.age+'</small>':'')+'</span>'+(p.cote?'<span class="pc2"><small>cote </small>'+String(p.cote).replace('.', ',')+'</span>':'')+'</div>'+
              '<div class="l2">'+inf.join(' · ')+'</div>'+(p.musique?'<div class="l2 mus">'+esc(p.musique)+'</div>':'')+'</div>';
          }).join('')+'</div></details>';
        }
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
    var lg = root.querySelector('.legcpc'); if (lg) lg.addEventListener('toggle', function(){ LEG = lg.open; });
    root.querySelectorAll('.cbtn a').forEach(function(a){
      a.onclick = function(e){
        e.preventDefault();
        var r = a.getAttribute('data-r'), j = parseInt(a.getAttribute('data-c'), 10);
        SEL[r] = j;
        var reu = a.closest('.reu');
        reu.querySelectorAll('.cbtn a').forEach(function(x){ x.classList.toggle('on', x === a); });
        reu.querySelectorAll('.crs').forEach(function(x){ x.hidden = x.id !== 'c'+r+'-'+j; });
      };
    });
    root.querySelectorAll('nav.inner a').forEach(function(a){
      a.onclick = function(e){
        e.preventDefault();
        root.querySelectorAll('nav.inner a').forEach(function(x){ x.className = x === a ? 'on' : ''; });
        root.querySelectorAll('.reu').forEach(function(x){ x.hidden = x.getAttribute('data-r') !== a.getAttribute('data-r'); });
      };
    });
  }
  return { lire: lire, afficher: afficher, chargerQuinte: chargerQuinte, lireCpc: lireCpc, afficherCpc: afficherCpc, brancherOnglets: brancherOnglets, chargerLive: chargerLive };
})();
