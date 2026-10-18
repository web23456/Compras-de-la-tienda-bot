/**
 * Bot Inteligente Avanzado de Extracción de Vales
 * Inspirado en el motor de Gestores Bot y ElectroConta
 * Soporta:
 * - Detección difusa y similitud Levenshtein de gestores y productos
 * - Múltiples productos en una sola línea o multilínea
 * - Desglose de precios de compra, venta, comisión al equipo y costo de transporte/flete
 * - Soporte bimoneda (USD y CUP)
 */

function normalizarCadena(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarUnicode(str) {
  if (!str) return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i);
    if (code >= 0x1D400 && code <= 0x1D419) { out += String.fromCharCode(65 + (code - 0x1D400)); i++; }
    else if (code >= 0x1D41A && code <= 0x1D433) { out += String.fromCharCode(97 + (code - 0x1D41A)); i++; }
    else if (code >= 0x1D434 && code <= 0x1D44D) { out += String.fromCharCode(65 + (code - 0x1D434)); i++; }
    else if (code >= 0x1D44E && code <= 0x1D467) { out += String.fromCharCode(97 + (code - 0x1D44E)); i++; }
    else if (code >= 0x1D468 && code <= 0x1D481) { out += String.fromCharCode(65 + (code - 0x1D468)); i++; }
    else if (code >= 0x1D482 && code <= 0x1D49B) { out += String.fromCharCode(97 + (code - 0x1D482)); i++; }
    else if (code >= 0x1D5D4 && code <= 0x1D5ED) { out += String.fromCharCode(65 + (code - 0x1D5D4)); i++; }
    else if (code >= 0x1D5EE && code <= 0x1D607) { out += String.fromCharCode(97 + (code - 0x1D5EE)); i++; }
    else { out += str[i]; }
  }
  return out;
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
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similitud(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return (maxLen - calcularLevenshteinDistancia(a, b)) / maxLen;
}

function parseValeTexto(rawTexto, catalogo = [], listaGestores = []) {
  if (!rawTexto || !rawTexto.trim()) return null;

  const textoLimpio = normalizarUnicode(rawTexto);
  const lineas = rawTexto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lineasNorm = textoLimpio.split(/\r?\n/).map(l => normalizarCadena(l));

  function extraerCampo(regexList) {
    for (const r of regexList) {
      for (let i = 0; i < lineasNorm.length; i++) {
        const m = lineasNorm[i].match(r);
        if (m && m[1]) {
          const orig = lineas[i].match(new RegExp(r.source, 'i'));
          return (orig && orig[1] ? orig[1] : m[1]).trim();
        }
      }
    }
    return '';
  }

  // 1. Cliente
  const cliente = extraerCampo([
    /nombre\s+del\s+cliente\s*:\s*([^:\n\r]+)/i,
    /cliente\s*:\s*([^:\n\r]+)/i,
    /comprador\s*:\s*([^:\n\r]+)/i
  ]) || 'Cliente General';

  // 2. Teléfono
  const telefono = extraerCampo([
    /telefono\s+del\s+cliente\s*:\s*([^:\n\r]+)/i,
    /tel\w*\s+cliente\s*:\s*([^:\n\r]+)/i,
    /telefono\s*:\s*([^:\n\r]+)/i,
    /whatsapp\s*:\s*([^:\n\r]+)/i,
    /movil\s*:\s*([^:\n\r]+)/i
  ]);

  // 3. Dirección
  const direccion = extraerCampo([
    /direccion\s+del\s+cliente\s*:\s*([^:\n\r]+)/i,
    /direccion\s*:\s*([^:\n\r]+)/i,
    /entrega\s+en\s*:\s*([^:\n\r]+)/i,
    /ubicacion\s*:\s*([^:\n\r]+)/i
  ]);

  // 4. Gestor / Miembro del equipo
  let gestorNombre = extraerCampo([
    /nombre\s+del\s+gestor\s*:\s*([^:\n\r]+)/i,
    /gestor\s*:\s*([^:\n\r]+)/i,
    /vendedor\s*:\s*([^:\n\r]+)/i,
    /equipo\s*:\s*([^:\n\r]+)/i
  ]) || 'Yakelin';

  // Coincidencia inteligente de gestor
  if (listaGestores && listaGestores.length > 0) {
    const normCand = normalizarCadena(gestorNombre);
    let mejorG = null;
    let mejorScore = 0;

    for (const g of listaGestores) {
      const gNorm = normalizarCadena(g.nombre || g);
      if (gNorm.includes(normCand) || normCand.includes(gNorm)) {
        mejorG = g.nombre || g;
        mejorScore = 1;
        break;
      }
      const s = similitud(normCand, gNorm);
      if (s > mejorScore && s >= 0.6) {
        mejorScore = s;
        mejorG = g.nombre || g;
      }
    }
    if (mejorG) gestorNombre = mejorG;
  }

  // 5. Moneda
  const metodoPagoRaw = extraerCampo([
    /metodo\s+de\s+pago\s*:\s*([^:\n\r]+)/i,
    /pago\s*:\s*([^:\n\r]+)/i
  ]);
  const moneda = (/usd|dolar|\$/i.test(metodoPagoRaw) || /usd/i.test(rawTexto)) ? 'USD' : 'CUP';

  // 6. Costo de Transportación / Mensajería
  const transporteRaw = extraerCampo([
    /precio\s+de\s+la\s+mensajeria\s*:\s*([^:\n\r]+)/i,
    /mensajeria\s*:\s*([^:\n\r]+)/i,
    /precio\s+transportacion\s*:\s*([^:\n\r]+)/i,
    /transportacion\s*:\s*([^:\n\r]+)/i,
    /transporte\s*:\s*([^:\n\r]+)/i,
    /flete\s*:\s*([^:\n\r]+)/i
  ]);
  let costoTransporte = 0;
  if (transporteRaw) {
    const num = transporteRaw.match(/(\d+(?:\.\d+)?)/);
    if (num) costoTransporte = parseFloat(num[1]);
  }

  // 7. Comisión del equipo
  const comisionRaw = extraerCampo([
    /comision\s+equipo\s*:\s*([^:\n\r]+)/i,
    /comision\s+gestor\s*:\s*([^:\n\r]+)/i,
    /comision\s*:\s*([^:\n\r]+)/i
  ]);
  let comisionGlobal = 0;
  if (comisionRaw) {
    const num = comisionRaw.match(/(\d+(?:\.\d+)?)/);
    if (num) comisionGlobal = parseFloat(num[1]);
  }

  // 8. Artículos y Precios
  const pedidoRaw = extraerCampo([
    /pedido\s*:\s*([^\n\r]+)/i,
    /articulos\s*:\s*([^\n\r]+)/i,
    /productos\s*:\s*([^\n\r]+)/i
  ]);

  const preciosRaw = extraerCampo([
    /precio\s+del\s+articulo\s*:\s*([^\n\r]+)/i,
    /precios\s*:\s*([^\n\r]+)/i,
    /precio\s+venta\s*:\s*([^\n\r]+)/i,
    /precio\s*:\s*([^\n\r]+)/i
  ]);

  const items = [];
  const mapaPreciosVenta = {};

  if (preciosRaw) {
    const partesPrecios = preciosRaw.split(/\.{2,}|\s*,\s*|\s*;\s*|\s*\/\s*/).map(s => s.trim()).filter(Boolean);
    for (const pp of partesPrecios) {
      const mNumFirst = pp.match(/^(\d+(?:\.\d+)?)\s*(.*)/);
      const mNumLast = pp.match(/^(.*?)\s*(\d+(?:\.\d+)?)$/);
      if (mNumFirst && mNumFirst[2].trim()) {
        mapaPreciosVenta[normalizarCadena(mNumFirst[2].trim())] = parseFloat(mNumFirst[1]);
      } else if (mNumLast && mNumLast[1].trim()) {
        mapaPreciosVenta[normalizarCadena(mNumLast[1].trim())] = parseFloat(mNumLast[2]);
      } else {
        const numMatch = pp.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) {
          const pr = parseFloat(numMatch[1]);
          const kw = pp.replace(numMatch[0], '').trim();
          if (kw) mapaPreciosVenta[normalizarCadena(kw)] = pr;
        }
      }
    }
  }

  if (pedidoRaw) {
    const separadores = /\.{2,}|\s*,\s*|\s*;\s*|\s*\+\s*/;
    const partesPedido = pedidoRaw.split(separadores).map(s => s.trim()).filter(Boolean);

    for (const ped of partesPedido) {
      let cant = 1;
      let nombre = ped;
      const mCant = ped.match(/^(\d+)\s*(.*)/);
      if (mCant) {
        cant = parseInt(mCant[1], 10);
        nombre = mCant[2].trim();
      }

      const lowerPed = normalizarCadena(nombre);

      // Buscar coincidencia en catálogo
      let prodCat = null;
      let mejorScore = 0;

      for (const p of catalogo) {
        const lp = normalizarCadena(p.nombre);
        if (lp.includes(lowerPed) || lowerPed.includes(lp)) {
          prodCat = p;
          break;
        }
        const s = similitud(lowerPed, lp);
        if (s > mejorScore && s >= 0.55) {
          mejorScore = s;
          prodCat = p;
        }
      }

      let precioCompra = prodCat ? (prodCat.precioCompra || 0) : 0;
      let precioVenta = prodCat ? (prodCat.precioVenta || 0) : 0;
      let comisionUnitaria = prodCat ? (prodCat.comisionEquipo || 0) : 0;

      // Buscar precio en mapa extraído
      for (const [kw, pr] of Object.entries(mapaPreciosVenta)) {
        if (lowerPed.includes(kw) || kw.includes(lowerPed)) {
          precioVenta = pr;
          break;
        }
      }

      // Si no hay precio explícito
      if (precioVenta === 0 && preciosRaw) {
        const m = preciosRaw.match(/(\d+(?:\.\d+)?)/);
        if (m) precioVenta = parseFloat(m[1]);
      }

      // Cálculo de costo estimado si no existe en catálogo
      if (precioCompra === 0 && precioVenta > 0) {
        precioCompra = Math.round(precioVenta * 0.75 * 100) / 100;
      }

      // Asignar parte de comisión global si existe
      if (comisionUnitaria === 0 && comisionGlobal > 0) {
        comisionUnitaria = Math.round((comisionGlobal / partesPedido.length) * 100) / 100;
      }

      items.push({
        id: 'item-' + Math.random().toString(36).substring(2, 9),
        producto: prodCat ? prodCat.nombre : (nombre || 'Producto sin nombre'),
        cantidad: cant,
        precioCompra,
        precioVenta,
        comisionEquipo: comisionUnitaria,
        subtotalCompra: cant * precioCompra,
        subtotalVenta: cant * precioVenta,
        margenGanancia: (cant * precioVenta) - (cant * precioCompra) - (cant * comisionUnitaria)
      });
    }
  }

  // Fallback si no hay formato Pedido:
  if (items.length === 0) {
    for (const linea of lineasNorm) {
      if (/precio|total|cliente|telefono|direccion|gestor|pago|mensajeria|transporte/i.test(linea)) continue;
      const mItem = linea.match(/(\d+)\s+([a-zA-Z\s]+?)(?:\s+(?:a|precio|por)?\s*(\d+(?:\.\d+)?))?$/);
      if (mItem) {
        const cant = parseInt(mItem[1], 10);
        const nom = mItem[2].trim();
        const pVenta = mItem[3] ? parseFloat(mItem[3]) : 0;
        const pCompra = Math.round(pVenta * 0.75 * 100) / 100;
        items.push({
          id: 'item-' + Math.random().toString(36).substring(2, 9),
          producto: nom,
          cantidad: cant,
          precioCompra: pCompra,
          precioVenta: pVenta,
          comisionEquipo: 0,
          subtotalCompra: cant * pCompra,
          subtotalVenta: cant * pVenta,
          margenGanancia: (cant * pVenta) - (cant * pCompra)
        });
      }
    }
  }

  if (items.length === 0) {
    items.push({
      id: 'item-1',
      producto: 'Artículo General',
      cantidad: 1,
      precioCompra: 0,
      precioVenta: 0,
      comisionEquipo: 0,
      subtotalCompra: 0,
      subtotalVenta: 0,
      margenGanancia: 0
    });
  }

  const totalVenta = items.reduce((acc, it) => acc + (it.cantidad * it.precioVenta), 0);
  const totalCompra = items.reduce((acc, it) => acc + (it.cantidad * it.precioCompra), 0);
  const totalComision = items.reduce((acc, it) => acc + (it.cantidad * it.comisionEquipo), 0) + (comisionGlobal > 0 && items.every(i => i.comisionEquipo === 0) ? comisionGlobal : 0);
  const margenNetoVale = totalVenta - totalCompra - totalComision - costoTransporte;

  return {
    cliente,
    telefono: telefono || '',
    direccion: direccion || '',
    gestor: gestorNombre,
    moneda,
    costoTransporte,
    comisionTotal: totalComision,
    items,
    totalVenta,
    totalCompra,
    margenNetoVale
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseValeTexto, normalizarCadena, similitud };
}
