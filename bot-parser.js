/**
 * Bot Extractor de Vales de Entrada de Mercancía al Almacén
 * Extrae productos, cantidades, precios de compra y venta, y fletes.
 */

function normalizarTexto(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseValeEntrada(rawTexto, comisionDefault = 1500) {
  if (!rawTexto || !rawTexto.trim()) return null;

  const lineas = rawTexto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const textoNorm = normalizarTexto(rawTexto);

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
    /#\s*(\w+)/i
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

  // Buscar bloque o líneas de pedido/artículos
  for (const linea of lineas) {
    if (/^(folio|proveedor|fecha|flete|transporte|total)/i.test(linea)) continue;

    // Si viene en formato: "2 Nevera..1 Infrarojo" o "1 Olla Reina 25 compra 35 venta"
    const partes = linea.split(/\.{2,}|\s*,\s*|\s*;\s*/).map(p => p.trim()).filter(Boolean);

    for (const parte of partes) {
      // Intentar extraer: [Cantidad] [Nombre Producto] [Precio Compra] [Precio Venta]
      // Ejemplos: "5 Nevera 225 compra 300 venta", "10 Infrarojo a 20", "2 Neveras 220 300"
      const mCant = parte.match(/^(\d+)\s*(.*)/);
      if (mCant) {
        const cant = parseInt(mCant[1], 10);
        let resto = mCant[2].trim();

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
          .replace(/\b(compra|costo|venta|precio|a|usd|cup|c\/u)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        let precioCompra = 0;
        let precioVenta = 0;

        if (numeros.length >= 2) {
          precioCompra = numeros[0];
          precioVenta = numeros[1];
        } else if (numeros.length === 1) {
          precioCompra = numeros[0];
          precioVenta = Math.round(precioCompra * 1.3 * 100) / 100; // margen sugerido
        }

        if (nombreLimpio) {
          items.push({
            id: 'item-' + Math.random().toString(36).substring(2, 9),
            nombre: nombreLimpio,
            cantidad: cant,
            precioCompra: precioCompra,
            precioVenta: precioVenta,
            comisionGestores: comisionDefault,
            transporteUnitario: 0,
            subtotalCompra: cant * precioCompra,
            subtotalVenta: cant * precioVenta,
            margenGanancia: (cant * precioVenta) - (cant * precioCompra) - (cant * comisionDefault)
          });
        }
      }
    }
  }

  // Si no se extrajeron con el split, intentar línea por línea clásica
  if (items.length === 0) {
    items.push({
      id: 'item-1',
      nombre: 'Mercancía General',
      cantidad: 1,
      precioCompra: 0,
      precioVenta: 0,
      comisionGestores: comisionDefault,
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
      it.margenGanancia = (it.cantidad * it.precioVenta) - (it.cantidad * it.precioCompra) - (it.cantidad * it.comisionGestores) - (it.cantidad * fleteUnitario);
    });
  }

  return {
    folio,
    proveedor,
    fecha,
    transporteTotal,
    items,
    rawTexto
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseValeEntrada, normalizarTexto };
}
