/**
 * Bot Extractor Inteligente de Vales de Venta y Compras
 * Soporta múltiples formatos:
 * - Formato WhatsApp con viñetas / emojis
 * - Formato libre multilínea
 * - Tabular / separado por comas o puntos
 */

function normalizarTexto(str) {
  if (!str) return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i);
    // Letras matemáticas negritas / sans-serif
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
  return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseValeTexto(rawTexto, catalogoExistente = []) {
  if (!rawTexto || !rawTexto.trim()) return null;

  const textoNorm = normalizarTexto(rawTexto);
  const lineas = rawTexto.split(/\r?\n/);
  const lineasNorm = textoNorm.split(/\r?\n/);

  function extraerCampo(regexList) {
    for (const r of regexList) {
      for (let i = 0; i < lineasNorm.length; i++) {
        const m = lineasNorm[i].match(r);
        if (m && m[1]) {
          const matchOrig = lineas[i].match(new RegExp(r.source, 'i'));
          return (matchOrig && matchOrig[1] ? matchOrig[1] : m[1]).trim();
        }
      }
    }
    return '';
  }

  // 1. Encabezado
  const cliente = extraerCampo([
    /nombre\s+del\s+cliente\s*:\s*([^:\n\r]+)/i,
    /cliente\s*:\s*([^:\n\r]+)/i,
    /comprador\s*:\s*([^:\n\r]+)/i
  ]) || 'Cliente General';

  const telefono = extraerCampo([
    /telefono\s+del\s+cliente\s*:\s*([^:\n\r]+)/i,
    /tel\w*\s+cliente\s*:\s*([^:\n\r]+)/i,
    /telefono\s*:\s*([^:\n\r]+)/i,
    /movil\s*:\s*([^:\n\r]+)/i,
    /whatsapp\s*:\s*([^:\n\r]+)/i
  ]);

  const direccion = extraerCampo([
    /direccion\s+del\s+cliente\s*:\s*([^:\n\r]+)/i,
    /direccion\s*:\s*([^:\n\r]+)/i,
    /entrega\s+en\s*:\s*([^:\n\r]+)/i,
    /ubicacion\s*:\s*([^:\n\r]+)/i
  ]);

  const gestor = extraerCampo([
    /nombre\s+del\s+gestor\s*:\s*([^:\n\r]+)/i,
    /gestor\s*:\s*([^:\n\r]+)/i,
    /vendedor\s*:\s*([^:\n\r]+)/i,
    /miembro\s+equipo\s*:\s*([^:\n\r]+)/i,
    /equipo\s*:\s*([^:\n\r]+)/i
  ]) || 'Equipo Principal';

  const gestorTelefono = extraerCampo([
    /telefono\s+del\s+gestor\s*:\s*([^:\n\r]+)/i,
    /#de\s+telefono\s+del\s+gestor\s*:\s*([^:\n\r]+)/i,
    /tel\s+gestor\s*:\s*([^:\n\r]+)/i
  ]);

  // 2. Moneda y Pagos
  const metodoPagoRaw = extraerCampo([
    /metodo\s+de\s+pago\s*:\s*([^:\n\r]+)/i,
    /forma\s+de\s+pago\s*:\s*([^:\n\r]+)/i,
    /pago\s*:\s*([^:\n\r]+)/i
  ]);

  const moneda = (/usd|dolar|\$/i.test(metodoPagoRaw) || /usd/i.test(rawTexto)) ? 'USD' : 'CUP';

  // 3. Transporte / Mensajería
  const transporteRaw = extraerCampo([
    /precio\s+de\s+la\s+mensajeria\s*:\s*([^:\n\r]+)/i,
    /mensajeria\s*:\s*([^:\n\r]+)/i,
    /precio\s+transportacion\s*:\s*([^:\n\r]+)/i,
    /transportacion\s*:\s*([^:\n\r]+)/i,
    /transporte\s*:\s*([^:\n\r]+)/i,
    /flete\s*:\s*([^:\n\r]+)/i,
    /envio\s*:\s*([^:\n\r]+)/i
  ]);

  let costoTransporte = 0;
  if (transporteRaw) {
    const num = transporteRaw.match(/(\d+(?:\.\d+)?)/);
    if (num) costoTransporte = parseFloat(num[1]);
  }

  // 4. Comisión al gestor / equipo
  const comisionRaw = extraerCampo([
    /comision\s+equipo\s*:\s*([^:\n\r]+)/i,
    /comision\s+gestor\s*:\s*([^:\n\r]+)/i,
    /comision\s*:\s*([^:\n\r]+)/i
  ]);

  let comisionEquipoSugerida = 0;
  if (comisionRaw) {
    const num = comisionRaw.match(/(\d+(?:\.\d+)?)/);
    if (num) comisionEquipoSugerida = parseFloat(num[1]);
  }

  // 5. Productos y Precios
  const pedidoRaw = extraerCampo([
    /pedido\s*:\s*([^\n\r]+)/i,
    /articulos\s*:\s*([^\n\r]+)/i,
    /productos\s*:\s*([^\n\r]+)/i
  ]);

  const preciosRaw = extraerCampo([
    /precio\s+del\s+articulo\s*:\s*([^\n\r]+)/i,
    /precios\s*:\s*([^\n\r]+)/i,
    /precio\s+venta\s*:\s*([^\n\r]+)/i
  ]);

  const preciosCompraRaw = extraerCampo([
    /precio\s+de\s+compra\s*:\s*([^\n\r]+)/i,
    /costo\s*:\s*([^\n\r]+)/i,
    /precio\s+costo\s*:\s*([^\n\r]+)/i
  ]);

  const items = [];

  // Mapear precios de venta por palabras clave
  const mapaPreciosVenta = {};
  if (preciosRaw) {
    const partesPrecios = preciosRaw.split(/\.{2,}|\s*,\s*|\s*;\s*|\s*\/\s*/).map(s => s.trim()).filter(Boolean);
    for (const pp of partesPrecios) {
      // Buscar formatos como "30 infrarojo", "infrarojo 30", "300 Nevera", "Nevera 300"
      const mNumFirst = pp.match(/^(\d+(?:\.\d+)?)\s*(.*)/);
      const mNumLast = pp.match(/^(.*?)\s*(\d+(?:\.\d+)?)$/);
      if (mNumFirst && mNumFirst[2].trim()) {
        mapaPreciosVenta[mNumFirst[2].trim().toLowerCase()] = parseFloat(mNumFirst[1]);
      } else if (mNumLast && mNumLast[1].trim()) {
        mapaPreciosVenta[mNumLast[1].trim().toLowerCase()] = parseFloat(mNumLast[2]);
      } else {
        const numMatch = pp.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) {
          const pr = parseFloat(numMatch[1]);
          const kw = pp.replace(numMatch[0], '').trim().toLowerCase();
          if (kw) mapaPreciosVenta[kw] = pr;
        }
      }
    }
  }

  // Si hay línea explícita de pedido
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

      // Buscar en catálogo existente
      const lowerPed = nombre.toLowerCase();
      let prodCat = catalogoExistente.find(p => {
        const lp = p.nombre.toLowerCase();
        return lp.includes(lowerPed) || lowerPed.includes(lp);
      });

      let precioCompra = prodCat ? (prodCat.precioCompra || 0) : 0;
      let precioVenta = prodCat ? (prodCat.precioVenta || 0) : 0;
      let comisionUnitaria = prodCat ? (prodCat.comisionEquipo || 0) : 0;

      // Buscar precio de venta en mapa
      for (const [kw, pr] of Object.entries(mapaPreciosVenta)) {
        if (lowerPed.includes(kw) || kw.includes(lowerPed)) {
          precioVenta = pr;
          break;
        }
      }

      // Estimación si no vino precio
      if (precioVenta === 0 && preciosRaw) {
        const m = preciosRaw.match(/(\d+(?:\.\d+)?)/);
        if (m) precioVenta = parseFloat(m[1]);
      }

      // Si no tenemos precio de compra, asumir margen promedio o tomar del producto
      if (precioCompra === 0 && precioVenta > 0) {
        precioCompra = Math.round(precioVenta * 0.75 * 100) / 100; // Margen por defecto ~25%
      }

      if (comisionUnitaria === 0 && comisionEquipoSugerida > 0) {
        comisionUnitaria = Math.round((comisionEquipoSugerida / partesPedido.length) * 100) / 100;
      }

      items.push({
        id: 'item-' + Math.random().toString(36).substring(2, 9),
        producto: nombre || 'Producto sin nombre',
        cantidad: cant,
        precioCompra: precioCompra,
        precioVenta: precioVenta,
        comisionEquipo: comisionUnitaria,
        subtotalCompra: cant * precioCompra,
        subtotalVenta: cant * precioVenta,
        margenGanancia: (cant * precioVenta) - (cant * precioCompra) - (cant * comisionUnitaria)
      });
    }
  } else {
    // Si no vino con formato Pedido: ... buscar patrones "1 Nevera 500" o "2 Olla a 30"
    for (const linea of lineasNorm) {
      if (/precio|total|cliente|telefono|direccion|gestor|pago/i.test(linea)) continue;
      const mItem = linea.match(/(\d+)\s+([a-zA-Z\s]+?)(?:\s+(?:a|precio|por)?\s*(\d+(?:\.\d+)?))?$/);
      if (mItem) {
        const cant = parseInt(mItem[1], 10);
        const nombre = mItem[2].trim();
        const pVenta = mItem[3] ? parseFloat(mItem[3]) : 0;
        const pCompra = Math.round(pVenta * 0.75 * 100) / 100;

        items.push({
          id: 'item-' + Math.random().toString(36).substring(2, 9),
          producto: nombre,
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

  // Si no se pudo parsear ningún artículo, agregar una fila editable vacía
  if (items.length === 0) {
    items.push({
      id: 'item-1',
      producto: 'Artículo por definir',
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
  const totalComision = items.reduce((acc, it) => acc + (it.cantidad * it.comisionEquipo), 0) + (comisionEquipoSugerida > 0 && items.every(i => i.comisionEquipo === 0) ? comisionEquipoSugerida : 0);
  const margenNetoVale = totalVenta - totalCompra - totalComision - costoTransporte;

  return {
    cliente,
    telefono: telefono || '',
    direccion: direccion || '',
    gestor,
    gestorTelefono: gestorTelefono || '',
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
  module.exports = { parseValeTexto, normalizarTexto };
}
