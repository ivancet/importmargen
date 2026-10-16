/* ImportMargen UI – vanilla JS, state in localStorage + shareable URL hash. */
(function () {
  'use strict';
  var C = window.IMCalc;
  var LS_KEY = 'importmargen.deals.v1';
  var FREE_LIMIT = 5;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var form = $('#form');
  var eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  var eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

  var TESLA_ADJ = [
    { id: 'sc01', label: 'SC01 verificado: Supercharging gratis transferible', value: 2500 },
    { id: 'fsd', label: 'FSD comprado (va con el coche)', value: 1500 },
    { id: 'eap', label: 'Enhanced Autopilot (sin FSD)', value: 700 },
    { id: 'noap', label: 'Sin Autopilot / AP1 sin opciones', value: -1500 },
    { id: 'mcu1', label: 'MCU1 sin actualizar (pantalla lenta, sin LTE 4G)', value: -1200 },
    { id: 'hw25', label: 'HW2.5 (no tiene el ordenador FSD/HW3)', value: -500 },
    { id: 'hp', label: 'Bomba de calor', value: 400 }
  ];

  function blankDeal() {
    return {
      id: 'd' + Date.now().toString(36), name: '', model: '', origin: 'NL', firstReg: '', km: '', co2: '', url: '',
      sellerType: 'dealer_vat', purchasePrice: '', iedmtBaseNew: '', iedmtRatePct: '', itpPct: '',
      quotes: [{ carrier: '', price: '', days: '', cmr: true, vat0: true }],
      coc: 0, fichaReducida: 0, itv: 130, dgt: 99.77, plates: 40, gestoria: 250, recon: 0, other: 0,
      salePrice: '', targetProfit: 1500, tesla: {}, teslaVals: {}, checks: {}, fee: 600
    };
  }
  function sampleDeal() {
    var d = blankDeal();
    Object.assign(d, {
      name: 'Ejemplo · Tesla Model 3 Long Range 2019', model: 'Tesla Model 3 Long Range', origin: 'NL',
      firstReg: '2019-06-14', km: 118000, co2: 0, sellerType: 'dealer_vat', purchasePrice: 15500,
      quotes: [
        { carrier: 'Transportista A (puerta a puerta)', price: 800, days: '3-5', cmr: true, vat0: true },
        { carrier: 'Transportista B (grupaje)', price: 775, days: '≤12', cmr: false, vat0: false },
        { carrier: 'Transportista C', price: 875, days: '5-7', cmr: true, vat0: true }
      ],
      itv: 130, gestoria: 250, recon: 350, salePrice: 21900, targetProfit: 2000,
      tesla: { eap: true }
    });
    return d;
  }

  // ---------- storage ----------
  function loadAll() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) { return []; } }
  function saveAll(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
  var deals = loadAll();
  var cur = null;

  // ---------- quotes ----------
  function renderQuotes() {
    var box = $('#quotes'); box.innerHTML = '';
    var best = bestQuoteIdx();
    cur.quotes.forEach(function (q, i) {
      var row = document.createElement('div'); row.className = 'q' + (i === best ? ' best' : '');
      row.innerHTML =
        '<input data-k="carrier" placeholder="Transportista" value="' + esc(q.carrier) + '">' +
        '<input data-k="price" type="number" min="0" placeholder="€ sin IVA" value="' + esc(q.price) + '">' +
        '<input data-k="days" placeholder="días" value="' + esc(q.days) + '">' +
        '<label><input data-k="cmr" type="checkbox"' + (q.cmr ? ' checked' : '') + '>CMR</label>' +
        '<label><input data-k="vat0" type="checkbox"' + (q.vat0 ? ' checked' : '') + '>0% IVA</label>' +
        (i === best ? '<span class="tag">elegido</span>' : '<span></span>') +
        '<button type="button" class="x" title="Quitar">×</button>';
      row.addEventListener('input', function (e) {
        var k = e.target.dataset.k; if (!k) return;
        q[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        markBest();
        update();
      });
      row.querySelector('.x').onclick = function () { cur.quotes.splice(i, 1); if (!cur.quotes.length) cur.quotes.push({ carrier: '', price: '', cmr: true, vat0: true }); renderQuotes(); update(); };
      box.appendChild(row);
    });
  }
  function markBest() {
    var best = bestQuoteIdx();
    Array.prototype.forEach.call($('#quotes').children, function (row, i) {
      row.className = 'q' + (i === best ? ' best' : '');
      row.children[5].outerHTML = i === best ? '<span class="tag">elegido</span>' : '<span></span>';
    });
  }
  // cheapest quote that provides a CMR (needed to prove the intra-EU transport); fall back to cheapest overall
  function bestQuoteIdx() {
    var idx = -1, min = Infinity, anyCmr = cur.quotes.some(function (q) { return q.cmr && Number(q.price) > 0; });
    cur.quotes.forEach(function (q, i) {
      var p = Number(q.price); if (!(p > 0)) return; if (anyCmr && !q.cmr) return;
      if (p < min) { min = p; idx = i; }
    });
    return idx;
  }

  // ---------- tesla ----------
  function renderTesla() {
    var box = $('#teslaAdj'); box.innerHTML = '';
    TESLA_ADJ.forEach(function (a) {
      var v = cur.teslaVals[a.id] !== undefined ? cur.teslaVals[a.id] : a.value;
      var row = document.createElement('div'); row.className = 'adj';
      row.innerHTML = '<input type="checkbox" id="t_' + a.id + '"' + (cur.tesla[a.id] ? ' checked' : '') + '><label for="t_' + a.id + '" style="color:var(--txt);font-size:13px">' + a.label + '</label><input type="number" step="100" value="' + v + '">';
      row.children[0].onchange = function (e) { cur.tesla[a.id] = e.target.checked; update(); };
      row.children[2].oninput = function (e) { cur.teslaVals[a.id] = Number(e.target.value) || 0; update(); };
      box.appendChild(row);
    });
    var isTesla = /tesla/i.test(cur.model || cur.name || '');
    $('#teslaBox').style.display = isTesla ? '' : 'none';
    if (isTesla) $('#teslaBox').open = true;
  }
  function teslaAdjust() {
    if (!/tesla/i.test(cur.model || cur.name || '')) return 0;
    return TESLA_ADJ.reduce(function (s, a) { return s + (cur.tesla[a.id] ? (cur.teslaVals[a.id] !== undefined ? cur.teslaVals[a.id] : a.value) : 0); }, 0);
  }

  // ---------- checklist ----------
  function checklistItems() {
    var o = cur.origin, st = cur.sellerType, items = [];
    items.push(['inv', st === 'dealer_vat' ? 'Factura con NIF-IVA de ambas empresas y mención "entrega intracomunitaria exenta"' : 'Factura / contrato de compraventa']);
    if (st === 'dealer_vat') items.push(['vies', 'NIF-IVA del vendedor validado en VIES (guardar captura)']);
    if (o === 'NL') items.push(['reg', 'Kentekenbewijs / kentekencard (deel I + II) y vrijwaringsbewijs de exportación']);
    else if (o === 'DE') items.push(['reg', 'Zulassungsbescheinigung Teil I + II y certificado de baja (Abmeldung)']);
    else items.push(['reg', 'Documento de matriculación original (todas sus partes) y baja en origen']);
    items.push(['coc', 'COC (certificado de conformidad) o ficha técnica reducida']);
    items.push(['cmr', 'CMR firmado por transportista y receptor (prueba del transporte intracomunitario)']);
    items.push(['keys', 'Llaves/tarjetas, libro de mantenimiento, factura de reparaciones']);
    items.push(['itv', 'Cita para la ITV de importación y tarjeta ITV española']);
    items.push(['m576', 'Modelo 576 del IEDMT (presentarlo aunque la cuota sea 0 €)']);
    items.push(['ivtm', 'IVTM del ayuntamiento pagado']);
    items.push(['dgt', 'Matriculación en la DGT (tasa 1.1) y placas']);
    if (st === 'dealer_vat') items.push(['m349', 'Adquisición intracomunitaria incluida en el modelo 349 y autorrepercutida en el 303']);
    if (/tesla/i.test(cur.model || cur.name || '')) items.push(['tcode', 'Tesla: códigos de opciones (SC01/SC05, Autopilot) vistos en la cuenta del vendedor, y coche transferido en la app']);
    return items;
  }
  function renderChecklist() {
    var ul = $('#checklist'); ul.innerHTML = '';
    checklistItems().forEach(function (it) {
      var li = document.createElement('li');
      li.innerHTML = '<label style="flex-direction:row;color:var(--txt);font-size:13px"><input type="checkbox"' + (cur.checks[it[0]] ? ' checked' : '') + '>' + it[1] + '</label>';
      li.querySelector('input').onchange = function (e) { cur.checks[it[0]] = e.target.checked; persistSilently(); };
      ul.appendChild(li);
    });
  }

  // ---------- form <-> state ----------
  var FIELDS = ['name', 'model', 'origin', 'firstReg', 'km', 'co2', 'url', 'sellerType', 'purchasePrice', 'iedmtBaseNew', 'iedmtRatePct', 'itpPct',
    'coc', 'fichaReducida', 'itv', 'dgt', 'plates', 'gestoria', 'recon', 'other', 'salePrice', 'targetProfit'];
  function fillForm() {
    FIELDS.forEach(function (f) { if (form.elements[f]) form.elements[f].value = cur[f] === undefined ? '' : cur[f]; });
    $('#fee').value = cur.fee;
    renderQuotes(); renderTesla(); renderChecklist(); update();
  }
  form.addEventListener('input', function (e) {
    var n = e.target.name; if (!n || FIELDS.indexOf(n) < 0) return;
    cur[n] = e.target.value;
    if (n === 'model' || n === 'name') renderTesla();
    if (n === 'origin' || n === 'sellerType' || n === 'model') renderChecklist();
    update();
  });
  $('#fee').addEventListener('input', function (e) { cur.fee = e.target.value; });

  function calcInput() {
    var bi = bestQuoteIdx();
    return {
      purchasePrice: cur.purchasePrice, sellerType: cur.sellerType, firstReg: cur.firstReg, km: cur.km, co2: cur.co2,
      iedmtBaseNew: cur.iedmtBaseNew,
      iedmtRateOverride: cur.iedmtRatePct === '' || cur.iedmtRatePct === undefined ? undefined : Number(cur.iedmtRatePct) / 100,
      itpRate: (Number(cur.itpPct) || 0) / 100,
      transport: bi >= 0 ? Number(cur.quotes[bi].price) : 0,
      coc: cur.coc, fichaReducida: cur.fichaReducida, itv: cur.itv, dgt: cur.dgt, plates: cur.plates, gestoria: cur.gestoria,
      recon: cur.recon, other: cur.other, salePrice: cur.salePrice, valueAdjust: teslaAdjust()
    };
  }

  function update() {
    var inp = calcInput(), r = C.compute(inp);
    var hasData = Number(cur.purchasePrice) > 0 && Number(cur.salePrice) > 0;
    $('#kProfit').textContent = hasData ? eur.format(r.profit) : '–';
    $('#kProfit').className = r.profit >= 0 ? 'pos' : 'neg';
    $('#kMargin').textContent = hasData ? (r.marginPct * 100).toFixed(1) + ' % sobre la venta neta · régimen de reventa: ' + (r.regime === 'rebu' ? 'REBU (IVA solo sobre el margen)' : 'general (21 % sobre el precio)') : 'Pon el precio de compra y el de venta';
    var target = Number(cur.targetProfit) || 0;
    var bid = Number(cur.salePrice) > 0 ? C.maxBid(inp, target) : 0;
    $('#kBid').textContent = Number(cur.salePrice) > 0 ? eur.format(bid) : '–';
    var diff = bid - (Number(cur.purchasePrice) || 0);
    $('#kBidNote').textContent = Number(cur.salePrice) > 0 ? ('para ganar ' + eur.format(target) + (Number(cur.purchasePrice) > 0 ? ' · ' + (diff >= 0 ? 'margen de negociación de ' + eur.format(diff) : 'hay que bajar ' + eur.format(-diff) + ' el precio') : '')) : '';

    var bi = bestQuoteIdx();
    var rows = [
      ['Precio de compra', Number(cur.purchasePrice) || 0],
      ['Transporte' + (bi >= 0 && cur.quotes[bi].carrier ? ' · ' + cur.quotes[bi].carrier : ''), inp.transport],
      ['IEDMT ' + (r.iedmtRate * 100).toFixed(2).replace('.', ',') + ' % sobre ' + eur.format(r.iedmtBase) + (Number(cur.iedmtBaseNew) > 0 ? ' (tablas × ' + r.coef + ')' : ''), r.iedmt],
      r.itp ? ['ITP', r.itp] : null,
      ['COC, ITV, DGT, placas, gestoría y otros', r.fixedCosts - inp.transport],
      ['tot', 'Coste total puesto en España', r.landedCost],
      ['Precio de venta' + (inp.valueAdjust ? ' (' + (inp.valueAdjust > 0 ? '+' : '') + eur.format(inp.valueAdjust) + ' de ajustes Tesla)' : ''), r.salePriceAdj],
      ['IVA de la venta (' + (r.regime === 'rebu' ? 'REBU' : 'general') + ')', -r.outputVat],
      ['tot', 'Beneficio neto', r.profit]
    ].filter(Boolean);
    $('#breakdown').innerHTML = rows.map(function (x) {
      return x[0] === 'tot' ? '<tr class="tot"><td>' + x[1] + '</td><td>' + eur2.format(x[2]) + '</td></tr>' : '<tr><td>' + esc(x[0]) + '</td><td>' + eur2.format(x[1]) + '</td></tr>';
    }).join('');
    var w = r.warnings.slice();
    if (bi >= 0 && !cur.quotes[bi].cmr) w.push('El transportista elegido no confirma CMR: sin CMR no puedes justificar el transporte intracomunitario.');
    if (cur.sellerType === 'dealer_vat' && bi >= 0 && !cur.quotes[bi].vat0) w.push('Pide al transportista una factura con inversión del sujeto pasivo (0 % IVA, B2B intracomunitario).');
    $('#warnings').innerHTML = w.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    renderComps();
    persistSilently();
  }

  function renderComps() {
    var q = encodeURIComponent((cur.model || '').trim());
    var y = cur.firstReg ? new Date(cur.firstReg).getFullYear() : '';
    if (!q) { $('#comps').innerHTML = '<span class="muted">Pon marca y modelo para buscar comparables en España</span>'; return; }
    var g = function (site) { return 'https://www.google.com/search?q=' + encodeURIComponent('site:' + site + ' ' + cur.model + ' ' + y); };
    $('#comps').innerHTML = '<span class="muted">Comparables:</span>' +
      ['coches.net', 'wallapop.com', 'autoscout24.es', 'mobile.de', 'marktplaats.nl'].map(function (s) { return '<a target="_blank" rel="noopener" href="' + g(s) + '">' + s + '</a>'; }).join('');
  }

  // ---------- deals list ----------
  var saveTimer = null;
  function persistSilently() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var i = deals.findIndex(function (d) { return d.id === cur.id; });
      if (i >= 0) { deals[i] = cur; saveAll(deals); }
      try { history.replaceState(null, '', '#d=' + encodeShare(cur)); } catch (e) {}
    }, 300);
  }
  function renderList() {
    var sel = $('#dealList');
    sel.innerHTML = '<option value="">— Operaciones guardadas (' + deals.length + '/' + FREE_LIMIT + ' gratis) —</option>' +
      deals.map(function (d) { return '<option value="' + d.id + '"' + (cur && d.id === cur.id ? ' selected' : '') + '>' + esc(d.name || d.model || 'Sin nombre') + '</option>'; }).join('');
  }
  $('#dealList').onchange = function (e) { var d = deals.find(function (x) { return x.id === e.target.value; }); if (d) { cur = JSON.parse(JSON.stringify(d)); fillForm(); } };
  $('#newDeal').onclick = function () { cur = blankDeal(); fillForm(); renderList(); };
  $('#saveDeal').onclick = function () {
    var i = deals.findIndex(function (d) { return d.id === cur.id; });
    if (i >= 0) deals[i] = cur;
    else { if (deals.length >= FREE_LIMIT) return toast('Plan gratis: máximo ' + FREE_LIMIT + ' operaciones. Borra alguna o pasa a Pro.'); deals.push(cur); }
    saveAll(deals); renderList(); toast('Guardado');
  };
  $('#delDeal').onclick = function () {
    deals = deals.filter(function (d) { return d.id !== cur.id; }); saveAll(deals); cur = blankDeal(); fillForm(); renderList(); toast('Borrado');
  };
  $('#exportCsv').onclick = function () {
    var list = deals.length ? deals : [cur];
    var head = ['nombre', 'modelo', 'origen', 'vendedor', 'compra', 'transporte', 'iedmt', 'coste_total', 'venta', 'iva_venta', 'beneficio', 'margen_pct', 'puja_max'];
    var lines = list.map(function (d) {
      var save = cur; cur = d; var inp = calcInput(), r = C.compute(inp), bid = C.maxBid(inp, Number(d.targetProfit) || 0); cur = save;
      return [d.name, d.model, d.origin, d.sellerType, d.purchasePrice, inp.transport, r.iedmt, r.landedCost, r.salePriceAdj, r.outputVat, r.profit, (r.marginPct * 100).toFixed(1), bid]
        .map(function (v) { v = String(v === undefined ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
    });
    var blob = new Blob(['\ufeff' + head.join(';') + '\n' + lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'importmargen-operaciones.csv'; a.click();
  };
  $('#shareLink').onclick = function () {
    var url = location.origin + location.pathname + '#d=' + encodeShare(cur);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Enlace copiado'); }, function () { prompt('Copia este enlace:', url); });
  };

  // ---------- client quote ----------
  $('#printQuote').onclick = function () {
    var inp = calcInput(), q = C.clientQuote(inp, cur.fee);
    var today = new Date().toLocaleDateString('es-ES');
    $('#printArea').innerHTML = '<h2>Presupuesto de importación</h2><p>' + esc(cur.name || cur.model || 'Vehículo') + '<br>Origen: ' + esc(cur.origin) + ' · 1ª matriculación: ' + esc(cur.firstReg || '–') + ' · ' + esc(cur.km || '–') + ' km<br>Fecha: ' + today + '</p>' +
      '<table>' + q.lines.filter(function (l) { return l[1]; }).map(function (l) { return '<tr><td>' + l[0] + '</td><td>' + eur2.format(l[1]) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>Total estimado puesto en España</td><td>' + eur2.format(q.total) + '</td></tr></table>' +
      '<p style="font-size:11px;color:#555">Estimación sin valor contractual. Transporte, ITV y gestoría figuran sin IVA. El impuesto de matriculación lo liquida Hacienda según sus tablas. El coste de transporte depende de la fecha de recogida.</p>';
    window.print();
  };

  // ---------- helpers ----------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function encodeShare(d) { var x = Object.assign({}, d); delete x.checks; return btoa(unescape(encodeURIComponent(JSON.stringify(x)))); }
  function decodeShare(s) { try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch (e) { return null; } }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200); }

  // ---------- boot ----------
  var m = location.hash.match(/#d=([^&]+)/);
  var shared = m ? decodeShare(m[1]) : null;
  cur = shared ? Object.assign(blankDeal(), shared) : (deals[0] ? JSON.parse(JSON.stringify(deals[0])) : sampleDeal());
  renderList(); fillForm();
  window.__im = { get cur() { return cur; }, calcInput: calcInput };
})();
