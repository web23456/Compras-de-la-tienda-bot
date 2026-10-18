const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parseValeTexto } = require('./bot-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'tienda_datos.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Cargar o inicializar base de datos local
function cargarDatos() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Error al leer base de datos local:', e);
    }
  }
  return {
    semanaActual: 1,
    semanas: [],
    inventario: [],
    vales: [],
    comprasNuevas: [],
    gastosExtras: [],
    inversiones: [],
    bajas: [],
    gestores: []
  };
}

function guardarDatos(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Endpoint para parsear texto de vale con el bot
app.post('/api/bot/parse-vale', (req, res) => {
  const { texto, catalogo } = req.body;
  if (!texto) {
    return res.status(400).json({ error: 'Falta el texto del vale' });
  }
  try {
    const db = cargarDatos();
    const productosRef = catalogo || db.inventario || [];
    const resultado = parseValeTexto(texto, productosRef);
    res.json({ ok: true, data: resultado });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Endpoint para obtener todos los datos
app.get('/api/datos', (req, res) => {
  res.json(cargarDatos());
});

// Endpoint para guardar estado completo
app.post('/api/datos', (req, res) => {
  try {
    guardarDatos(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🛒 Servidor y Bot de Compras de la Tienda Activo`);
  console.log(`🌐 Accede en tu navegador: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
