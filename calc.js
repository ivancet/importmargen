/* ImportMargen – calculation engine (pure functions, no DOM).
 * Works in the browser (window.IMCalc) and in Node (module.exports).
 * All money in EUR. Costs are entered NET of Spanish VAT (a VAT-registered
 * trader recovers the input VAT), IEDMT is a real cost.
 * Figures are estimates – always confirm with your gestoría.
 */
(function (root) {
  'use strict';

  var VAT_ES = 0.21;

  // Hacienda depreciation coefficients for used vehicles (years since 1st registration)
  var IEDMT_COEF = [1.00, 0.84, 0.67, 0.56, 0.47, 0.39, 0.34, 0.28, 0.24, 0.19, 0.17, 0.13, 0.10];

  function round2(n) { return Math.round(n * 100) / 100; }

  function ageYears(firstReg, today) {
    if (!firstReg) return 0;
    var d = new Date(firstReg), t = today ? new Date(today) : new Date();
    if (isNaN(d)) return 0;
    var y = t.getFullYear() - d.getFullYear();
    var m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) y--;
    return Math.max(0, y);
  }

  function ageMonths(firstReg, today) {
    if (!firstReg) return 999;
    var d = new Date(firstReg), t = today ? new Date(today) : new Date();
    if (isNaN(d)) return 999;
    return (t.getFullYear() - d.getFullYear()) * 12 + (t.getMonth() - d.getMonth()) - (t.getDate() < d.getDate() ? 1 : 0);
  }

  function iedmtCoef(years) {
    return IEDMT_COEF[Math.min(years, IEDMT_COEF.length - 1)];
  }

  // State rates by CO2 (g/km, WLTP). Communities may raise the rates; user can override.
  function iedmtRate(co2) {
    var c = Number(co2) || 0;
    if (c <= 120) return 0;
    if (c < 160) return 0.0475;
    if (c < 200) return 0.0975;
    return 0.1475;
  }

  // "Nuevo medio de transporte": <= 6 months OR <= 6,000 km -> Spanish VAT always due.
  function isNewMeansOfTransport(input, today) {
    return ageMonths(input.firstReg, today) <= 6 || (Number(input.km) || 0) <= 6000;
  }

  /**
   * input = {
   *   purchasePrice,          // what you pay the seller (net for 0% intra-EU invoice, gross for margin scheme / private)
   *   sellerType,             // 'dealer_vat' (0% intra-EU, regimen general) | 'dealer_margin' (§25a / margin scheme) | 'private'
   *   firstReg, km, co2,
   *   iedmtBaseNew,           // optional: Hacienda table value (new) for the model; empty -> purchase price used as market value
   *   iedmtRateOverride,      // optional decimal (e.g. 0.16)
   *   transport, coc, itv, dgt, plates, gestoria, fichaReducida, recon, other, // net costs
   *   itpRate,                // optional decimal, private purchases only (default 0 – check with gestoría)
   *   salePrice,              // expected retail price in Spain, VAT/REBU included (what the buyer pays)
   *   valueAdjust             // +/- euros added to salePrice (e.g. Tesla SC01, FSD, MCU1)
   * }
   */
  function compute(input, today) {
    var P = Number(input.purchasePrice) || 0;
    var years = ageYears(input.firstReg, today);
    var coef = iedmtCoef(years);
    var rate = (input.iedmtRateOverride !== undefined && input.iedmtRateOverride !== null && input.iedmtRateOverride !== '')
      ? Number(input.iedmtRateOverride) : iedmtRate(input.co2);
    var baseFromTable = Number(input.iedmtBaseNew) > 0;
    var iedmtBase = baseFromTable ? Number(input.iedmtBaseNew) * coef : P;
    var iedmt = round2(iedmtBase * rate);

    var nmt = isNewMeansOfTransport(input, today);
    var sellerType = input.sellerType || 'dealer_vat';
    var warnings = [];

    var itp = 0;
    if (sellerType === 'private' && Number(input.itpRate) > 0) itp = round2(P * Number(input.itpRate));

    var fixed = ['transport', 'coc', 'itv', 'dgt', 'plates', 'gestoria', 'fichaReducida', 'recon', 'other']
      .reduce(function (s, k) { return s + (Number(input[k]) || 0); }, 0);

    var landedCost = round2(P + iedmt + itp + fixed); // cost to the trader, excl. recoverable VAT

    var S = (Number(input.salePrice) || 0) + (Number(input.valueAdjust) || 0);

    // Resale VAT regime
    var regime, outputVat;
    if (sellerType === 'dealer_vat' || nmt) {
      regime = 'general';                         // bought with 0% intra-EU (or NMT) -> sell with 21% VAT on full price
      outputVat = S - S / (1 + VAT_ES);
    } else {
      regime = 'rebu';                            // bought under margin scheme / from a private -> REBU on (sale - purchase)
      var margin = Math.max(0, S - P);
      outputVat = margin - margin / (1 + VAT_ES);
    }
    outputVat = round2(outputVat);

    var netRevenue = round2(S - outputVat);
    var profit = round2(netRevenue - landedCost);
    var marginPct = netRevenue > 0 ? profit / netRevenue : 0;

    if (nmt) warnings.push('Cuenta como "medio de transporte nuevo" (≤6 meses o ≤6.000 km): IVA español obligatorio aunque el vendedor facture con margen.');
    if (!baseFromTable && rate > 0) warnings.push('Sin valor de tablas de Hacienda: IEDMT calculado sobre el precio de compra. Hacienda usa su tabla × coeficiente de antigüedad.');
    if (sellerType === 'dealer_vat') warnings.push('Comprueba el NIF-IVA del vendedor en VIES y que la factura indique entrega intracomunitaria exenta (art. 138 Directiva 2006/112/CE).');
    if (sellerType === 'dealer_margin' && !nmt) warnings.push('Factura en régimen de margen (§25a / margeregeling): el IVA de origen no es deducible y revendes en REBU.');
    if (!(Number(input.coc) > 0) && !(Number(input.fichaReducida) > 0)) warnings.push('Sin coste de COC ni ficha reducida: confirma que el coche trae COC antes de comprar.');

    return {
      years: years, coef: coef, iedmtRate: rate, iedmtBase: round2(iedmtBase), iedmt: iedmt,
      itp: itp, fixedCosts: round2(fixed), landedCost: landedCost,
      salePriceAdj: round2(S), regime: regime, outputVat: outputVat, netRevenue: netRevenue,
      profit: profit, marginPct: marginPct, newMeansOfTransport: nmt, warnings: warnings
    };
  }

  /** Highest purchase price that still yields targetProfit (EUR). Bisection – profit is monotone decreasing in price. */
  function maxBid(input, targetProfit, today) {
    var lo = 0, hi = Math.max(1, (Number(input.salePrice) || 0) + (Number(input.valueAdjust) || 0)) * 2;
    var f = function (p) { var x = Object.assign({}, input, { purchasePrice: p }); return compute(x, today).profit - targetProfit; };
    if (f(lo) < 0) return 0;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (f(mid) >= 0) lo = mid; else hi = mid;
    }
    return Math.floor(lo / 10) * 10; // round down to €10
  }

  /** Client quote for "importación a la carta": the client buys the car, you charge a fee. */
  function clientQuote(input, fee, today) {
    var r = compute(Object.assign({}, input, { salePrice: 0, valueAdjust: 0 }), today);
    var feeNet = Number(fee) || 0;
    var feeVat = round2(feeNet * VAT_ES);
    return {
      lines: [
        ['Precio del vehículo (origen)', Number(input.purchasePrice) || 0],
        ['Transporte a España', Number(input.transport) || 0],
        ['COC / ficha reducida', (Number(input.coc) || 0) + (Number(input.fichaReducida) || 0)],
        ['ITV de importación', Number(input.itv) || 0],
        ['Impuesto de matriculación (IEDMT)', r.iedmt],
        ['Tasa DGT + placas', (Number(input.dgt) || 0) + (Number(input.plates) || 0)],
        ['Gestoría', Number(input.gestoria) || 0],
        ['Otros', (Number(input.recon) || 0) + (Number(input.other) || 0) + r.itp],
        ['Honorarios de gestión de importación', feeNet],
        ['IVA honorarios (21%)', feeVat]
      ],
      total: round2(r.landedCost + feeNet + feeVat)
    };
  }

  var api = { compute: compute, maxBid: maxBid, clientQuote: clientQuote, iedmtRate: iedmtRate, iedmtCoef: iedmtCoef,
    ageYears: ageYears, isNewMeansOfTransport: isNewMeansOfTransport, IEDMT_COEF: IEDMT_COEF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IMCalc = api;
})(this);
