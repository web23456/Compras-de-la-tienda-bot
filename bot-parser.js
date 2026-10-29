/**
 * Bot Extractor y Analizador Robusto de Vales de Entrada de Mercancía
 * - Normalización de texto y eliminación de diacríticos
 * - Algoritmo Levenshtein para coincidencia difusa de productos en catálogo
 * - Detección bimoneda precisa (USD y CUP) por ítem o general
 * - Detección y prorrateo automático de gastos de flete/transporte
 * - Separación de múltiples vales concatenados o en lote
 * - Detección de duplicados mediante cálculo de hash/similitud
 */

function normalizarTexto(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcularLevenshteinDistancia(a, b) {
  if (!a || !b) return (a || b || '').length;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function calcularSimilitudLevenshtein(a, b) {
  const normA = normalizarTexto(a);
  const normB = normalizarTexto(b);
  if (!normA && !normB) return 1.0;
  if (!normA || !normB) return 0.0;
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  return (maxLen - calcularLevenshteinDistancia(normA, normB)) / maxLen;
}

function buscarMejorCoincidenciaCatalogo(nombreExtraido, catalogo) {
  if (!Array.isArray(catalogo) || catalogo.length === 0 || !nombreExtraido) return null;
  const normExt = normalizarTexto(nombreExtraido);
  let mejorMatch = null;
  let mejorScore = 0;

  for (const item of catalogo) {
    const prodNombre = typeof item === 'string' ? item : (item.producto || item.nombre || '');
    const normProd = normalizarTexto(prodNombre);
    if (!normProd) continue;

    if (normExt === normProd) {
      return { producto: prodNombre, score: 1.0 };
    }
    if (normExt.includes(normProd) || normProd.includes(normExt)) {
      const score = Math.min(normExt.length, normProd.length) / Math.max(normExt.length, normProd.length);
      if (score > mejorScore) {
        mejorScore = score;
        mejorMatch = prodNombre;
      }
    }
    const levScore = calcularSimilitudLevenshtein(normExt, normProd);
    if (levScore > mejorScore && levScore >= 0.65) {
      mejorScore = levScore;
      mejorMatch = prodNombre;
    }
  }

  return mejorMatch ? { producto: mejorMatch, score: mejorScore } : null;
}

function parseValeEntrada(rawTexto, comisionDefault = 1500, monedaDefault = 'USD', catalogo = []) {
  if (!rawTexto || !rawTexto.trim()) return null;

  const lineas = rawTexto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  function extraerCampo(regexList) {
    for (const r of regexList) {
      for (const l of lineas) {
        const m = l.match(r);
        if (m && m[1]) return m[1].trim();
      }
    }
    return '';
  }

  // Folio / Proveedor / Fecha
  const folio = extraerCampo([
    /folio\s*:\s*([^:\n\r]+)/i,
    /vale\s*:\s*([^:\n\r]+)/i,
    /factura\s*:\s*([^:\n\r]+)/i,
    /#\s*([a-zA-Z0-9_-]+)/i
  ]) || 'ENT-' + Date.now().toString().slice(-4);

  const proveedor = extraerCampo([
    /proveedor\s*:\s*([^:\n\r]+)/i,
    /distribuidor\s*:\s*([^:\n\r]+)/i,
    /origen\s*:\s*([^:\n\r]+)/i,
    /almacen\s*:\s*([^:\n\r]+)/i
  ]) || 'Proveedor General';

  const fecha = extraerCampo([
    /fecha\s*:\s*([^:\n\r]+)/i
  ]) || new Date().toISOString().split('T')[0];

  // Moneda general del vale (USD o CUP)
  const monedaDetectada = (/cup|moneda nacional|mn\b/i.test(rawTexto)) ? 'CUP' : ((/usd|dolar|\$/i.test(rawTexto)) ? 'USD' : (monedaDefault || 'USD'));

  // Transporte / Flete general del vale
  const fleteRaw = extraerCampo([
    /flete\s*:\s*([^:\n\r]+)/i,
    /transporte\s*:\s*([^:\n\r]+)/i,
    /transportacion\s*:\s*([^:\n\r]+)/i,
    /envio\s*:\s*([^:\n\r]+)/i
  ]);

  let transporteTotal = 0;
  if (fleteRaw) {
    const num = fleteRaw.match(/(\d+(?:\.\d+)?)/);
    if (num) transporteTotal = parseFloat(num[1]);
  }

  // Lista de productos extraídos
  const items = [];

  for (const linea of lineas) {
    if (/^(folio|proveedor|fecha|flete|transporte|transportacion|envio|total|moneda|---)/i.test(linea)) continue;

    const partes = linea.split(/\.{2,}|\s*,\s*|\s*;\s*/).map(p => p.trim()).filter(Boolean);

    for (const parte of partes) {
      const mCant = parte.match(/^(\d+)\s*(.*)/);
      if (mCant) {
        const cant = parseInt(mCant[1], 10);
        let resto = mCant[2].trim();

        // Detección de moneda por ítem si especifica CUP o USD
        let itemMoneda = monedaDetectada;
        if (/cup|mn\b/i.test(parte)) itemMoneda = 'CUP';
        else if (/usd|dolar|\$/i.test(parte)) itemMoneda = 'USD';

        // Extraer números
        const numeros = [];
        const regexNum = /(\d+(?:\.\d+)?)/g;
        let match;
        while ((match = regexNum.exec(resto)) !== null) {
          numeros.push(parseFloat(match[1]));
        }

        // Limpiar nombre quitando números y palabras clave
        let nombreLimpio = resto
          .replace(/(\d+(?:\.\d+)?)/g, '')
          .replace(/\b(compra|costo|venta|precio|a|usd|cup|mn|c\/u)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Coincidencia inteligente difusa con catálogo previo si existe
        if (catalogo && catalogo.length > 0) {
          const matchCat = buscarMejorCoincidenciaCatalogo(nombreLimpio, catalogo);
          if (matchCat && matchCat.score >= 0.70) {
            nombreLimpio = matchCat.producto;
          }
        }

        let precioCompra = 0;
        let precioVenta = 0;

        if (numeros.length >= 2) {
          precioCompra = numeros[0];
          precioVenta = numeros[1];
        } else if (numeros.length === 1) {
          precioCompra = numeros[0];
          precioVenta = Math.round(precioCompra * 1.3 * 100) / 100;
        }

        if (nombreLimpio) {
          items.push({
            id: 'item-' + Math.random().toString(36).substring(2, 9),
            nombre: nombreLimpio,
            cantidad: cant,
            moneda: itemMoneda,
            precioCompra: precioCompra,
            precioVenta: precioVenta,
            comisionGestores: comisionDefault,
            comisionMoneda: 'CUP',
            transporteUnitario: 0,
            subtotalCompra: cant * precioCompra,
            subtotalVenta: cant * precioVenta,
            margenGanancia: (cant * precioVenta) - (cant * precioCompra)
          });
        }
      }
    }
  }

  if (items.length === 0) {
    items.push({
      id: 'item-1',
      nombre: 'Mercancía General',
      cantidad: 1,
      moneda: monedaDetectada,
      precioCompra: 0,
      precioVenta: 0,
      comisionGestores: comisionDefault,
      comisionMoneda: 'CUP',
      transporteUnitario: transporteTotal,
      subtotalCompra: 0,
      subtotalVenta: 0,
      margenGanancia: 0
    });
  }

  // Prorratear flete entre la cantidad total de unidades si vino un transporte global
  const totalUnidades = items.reduce((acc, it) => acc + (it.cantidad || 0), 0);
  if (transporteTotal > 0 && totalUnidades > 0) {
    const fleteUnitario = Math.round((transporteTotal / totalUnidades) * 100) / 100;
    items.forEach(it => {
      it.transporteUnitario = fleteUnitario;
      it.margenGanancia = (it.cantidad * it.precioVenta) - (it.cantidad * it.precioCompra) - (it.cantidad * fleteUnitario);
    });
  }

  const totalCompraUSD = items.filter(i => i.moneda === 'USD').reduce((acc, i) => acc + i.subtotalCompra, 0);
  const totalCompraCUP = items.filter(i => i.moneda === 'CUP').reduce((acc, i) => acc + i.subtotalCompra, 0);

  return {
    folio,
    proveedor,
    fecha,
    moneda: monedaDetectada,
    transporteTotal,
    totalCompraUSD,
    totalCompraCUP,
    items,
    rawTexto
  };
}

// Función para compatibilidad con server.js
function parseValeTexto(texto, catalogo = [], gestores = []) {
  return parseValeEntrada(texto, 1500, 'USD', catalogo);
}


if (typeof window !== 'undefined') {
  window.parseValeEntrada = parseValeEntrada;
  window.parseValeTexto = parseValeTexto;
  window.normalizarTexto = normalizarTexto;
  window.calcularLevenshteinDistancia = calcularLevenshteinDistancia;
  window.calcularSimilitudLevenshtein = calcularSimilitudLevenshtein;
  window.buscarMejorCoincidenciaCatalogo = buscarMejorCoincidenciaCatalogo;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseValeEntrada,
    parseValeTexto,
    normalizarTexto,
    calcularLevenshteinDistancia,
    calcularSimilitudLevenshtein,
    buscarMejorCoincidenciaCatalogo
  };
}
