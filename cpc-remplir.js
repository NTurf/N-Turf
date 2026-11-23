// Complète le fichier course par course (.xlsm) avec les arrivées et les rapports du PMU,
// en ne touchant qu'aux cases de valeur : macros, couleurs, formules et mise en page restent intacts.
// Utilisable dans le navigateur (avec XLSX et JSZip chargés) et dans Node pour les essais.
(function (racine) {
  var COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // 1. Repère les réunions et les lignes de chaque course dans « Saisie Journaux »
  function structure(XLSX, buf) {
    var wb = XLSX.read(buf, { type: 'array', bookVBA: false, cellFormula: false, sheets: ['Saisie Journaux'] });
    var ws = wb.Sheets['Saisie Journaux'];
    if (!ws) throw new Error("La feuille « Saisie Journaux » est introuvable : est-ce bien ton fichier course par course ?");
    var v = function (a) { var c = ws[a]; return c ? c.v : null; };
    var reunions = [], date = '';
    for (var r = 1; r <= 400; r++) {
      var a = v('A' + r);
      if (!(a && /^RÉUNION/i.test(String(a)))) continue;
      var d = ws['C' + r];
      if (!date && d) {
        if (d.t === 'n') { var x = new Date(Math.round((d.v - 25569) * 86400000) + 12 * 3600000); date = ('0' + x.getUTCDate()).slice(-2) + '/' + ('0' + (x.getUTCMonth() + 1)).slice(-2) + '/' + x.getUTCFullYear(); }
        else if (d.w || d.v) date = String(d.w || d.v);
      }
      var re = { nom: String(a), brut: String(v('G' + r) || '').trim(), courses: [] };
      for (var k = 0; k < 10; k++) {
        var b = r + 2 + k * 8, lab = v('A' + b);
        if (!lab) continue;
        var num = parseInt(String(lab).replace(/\D/g, ''), 10);
        // on ne garde que les courses saisies (au moins un cheval dans un journal)
        var saisie = false;
        for (var y = b; y <= b + 3 && !saisie; y++) for (var x = 2; x <= 9; x++) if (typeof v(COLS[x] + y) === 'number') { saisie = true; break; }
        if (num && saisie) re.courses.push({ num: num, ligneArr: b + 5, ligneRap: b + 7 });
      }
      if (re.brut && re.courses.length) reunions.push(re);
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) throw new Error('La date de la réunion 1 est illisible dans ton fichier.');
    return { date: date, reunions: reunions };
  }

  // 2. Écrit une case dans le XML de la feuille, en gardant son style
  function ecrire(xml, ref, valeur) {
    var ligne = parseInt(ref.replace(/\D/g, ''), 10), col = ref.replace(/\d/g, '');
    var cIdx = function (r) { var s = r.replace(/\d/g, ''), n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + COLS.indexOf(s[i]) + 1; return n; };
    var reRow = new RegExp('<row [^>]*?\\br="' + ligne + '"[^>]*?(/>|>)');
    var m = reRow.exec(xml);
    if (!m) throw new Error('Ligne ' + ligne + ' introuvable dans le fichier.');
    var debut = m.index, finOuv = debut + m[0].length, corps, finRow;
    if (m[1] === '/>') {
      xml = xml.slice(0, debut) + m[0].slice(0, -2) + '></row>' + xml.slice(finOuv);
      finOuv = debut + m[0].length - 1; finRow = finOuv;
    } else finRow = xml.indexOf('</row>', finOuv);
    corps = xml.slice(finOuv, finRow);
    var contenu = typeof valeur === 'number' ? '<v>' + valeur + '</v>' : '<is><t>' + String(valeur).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</t></is>';
    var typ = typeof valeur === 'number' ? '' : ' t="inlineStr"';
    var reCell = new RegExp('<c r="' + ref + '"([^>]*?)(/>|>[\\s\\S]*?</c>)');
    var mc = reCell.exec(corps), neuf;
    if (mc) {
      var attrs = mc[1].replace(/\s+t="[^"]*"/, '');
      neuf = '<c r="' + ref + '"' + attrs + typ + '>' + contenu + '</c>';
      corps = corps.slice(0, mc.index) + neuf + corps.slice(mc.index + mc[0].length);
    } else {
      neuf = '<c r="' + ref + '"' + typ + '>' + contenu + '</c>';
      var reTous = /<c r="([A-Z]+)\d+"/g, t, pos = corps.length;
      while ((t = reTous.exec(corps))) { if (cIdx(t[1]) > cIdx(col)) { pos = t.index; break; } }
      corps = corps.slice(0, pos) + neuf + corps.slice(pos);
    }
    return xml.slice(0, finOuv) + corps + xml.slice(finRow);
  }

  // 3. Ouvre le fichier, remplit les cases, recalcule à l'ouverture dans Excel
  async function completer(XLSX, JSZip, buf, donnees, plan) {
    var zip = await JSZip.loadAsync(buf);
    var wbx = await zip.file('xl/workbook.xml').async('string');
    var rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    var ms = /<sheet [^>]*name="Saisie Journaux"[^>]*r:id="([^"]+)"/.exec(wbx);
    if (!ms) throw new Error('Feuille « Saisie Journaux » introuvable.');
    var mr = new RegExp('<Relationship [^>]*Id="' + ms[1] + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + ms[1] + '"').exec(rels);
    var chemin = 'xl/' + mr[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    var xml = await zip.file(chemin).async('string');
    var bilan = [];
    plan.reunions.forEach(function (re, i) {
      var dr = (donnees.reunions || [])[i] || { courses: [] };
      re.courses.forEach(function (c) {
        var dc = (dr.courses || []).filter(function (x) { return x.num === c.num; })[0];
        if (!dc || dc.etat !== 'ok') { bilan.push({ reunion: re.brut, course: c.num, etat: dc ? dc.etat : (dr.trouve === false ? 'hippodrome introuvable au PMU' : 'pas au programme du PMU') }); return; }
        dc.arrivee.slice(0, 4).forEach(function (n, k) { xml = ecrire(xml, COLS[2 + k] + c.ligneArr, n); });
        dc.rapports.forEach(function (v, k) { if (v !== null && v !== undefined) xml = ecrire(xml, COLS[2 + k] + c.ligneRap, v); });
        bilan.push({ reunion: re.brut, course: c.num, etat: 'ok', arrivee: dc.arrivee.slice(0, 4) });
      });
    });
    zip.file(chemin, xml);
    // Excel recalcule toutes les formules à l'ouverture (synthèses, bilans…)
    if (/<calcPr[^>]*fullCalcOnLoad=/.test(wbx)) wbx = wbx.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"');
    else if (/<calcPr/.test(wbx)) wbx = wbx.replace(/<calcPr/, '<calcPr fullCalcOnLoad="1"');
    else wbx = wbx.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/workbook.xml', wbx);
    var sortie = await zip.generateAsync({ type: typeof window === 'undefined' ? 'nodebuffer' : 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
    return { fichier: sortie, bilan: bilan };
  }

  var api = { structure: structure, completer: completer, ecrire: ecrire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else racine.CPCR = api;
})(this);
