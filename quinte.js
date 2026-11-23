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
    var l5 = [], l6 = [];
    for (var r = 25; r <= 34; r++){
      var a = rangee(ws, r, 'B', 'F'); if (a.length) l5.push(a);
      var b = rangee(ws, r, 'H', 'M'); if (b.length) l6.push(b);
    }
    return { selection: rangee(ws, 22, 'B', 'M'), lignes5: l5, lignes6: l6 };
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
      if (a.lignes5.length) h += '<p class="sub">Lignes de 5</p>'+a.lignes5.map(function(l){ return '<div class="lig">'+l.map(function(n){return chip(n,arr);}).join('')+'</div>'; }).join('');
      if (a.lignes6.length) h += '<p class="sub">Lignes de 6</p>'+a.lignes6.map(function(l){ return '<div class="lig">'+l.map(function(n){return chip(n,arr);}).join('')+'</div>'; }).join('');
    });
    var rk = Object.keys(q.rapports || {});
    if (rk.length){
      h += '<h3>Rapports (pour 1 €)</h3><table class="rap">'+rk.map(function(k){ return '<tr><td>'+esc(k)+'</td><td>'+euros(q.rapports[k])+'</td></tr>'; }).join('')+'</table>';
    }
    return h;
  }
  return { lire: lire, afficher: afficher };
})();
