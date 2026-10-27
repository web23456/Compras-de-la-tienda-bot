const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parseValeEntrada, parseValeTexto } = require('./bot-parser');
const githubService = require('./githubService');

const app = express();
const PORT = process.env.PORT || 3060;
const DB_FILE = path.join(__dirname, 'tienda_datos.json');
const SALVAS_DIR = path.join(__dirname, 'salvas_semanales_local');

if (!fs.existsSync(SALVAS_DIR)) {
  fs.mkdirSync(SALVAS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
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
  return null;
}

function guardarDatos(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 1. Endpoint: Analizar texto de vale con el bot robusto
app.post('/api/bot/parse-vale', (req, res) => {
  const { texto, catalogo, comisionDefault, monedaDefault } = req.body;
  if (!texto) {
    return res.status(400).json({ error: 'Falta el texto del vale' });
  }
  try {
    const resultado = parseValeEntrada(texto, comisionDefault || 1500, monedaDefault || 'USD', catalogo || []);
    res.json({ ok: true, data: resultado });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 2. Endpoint: Guardar base de datos localmente
app.post('/api/datos', (req, res) => {
  try {
    guardarDatos(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. Endpoint: Obtener base de datos
app.get('/api/datos', (req, res) => {
  const db = cargarDatos();
  res.json({ ok: true, data: db });
});

// 4. Endpoint: Sincronizar cambios completos a GitHub (tienda_datos.json y/o index.html)
app.post('/api/sync-to-github', async (req, res) => {
  const { database, commitMessage } = req.body;
  try {
    if (database) {
      guardarDatos(database);
    }
    const dbParaGuardar = database || cargarDatos();
    const indexFile = await githubService.fetchFile('tienda_datos.json').catch(() => null);
    const sha = indexFile ? indexFile.sha : null;
    const msg = commitMessage || `feat: sincronización automática desde Bot [${new Date().toLocaleTimeString()}]`;

    const commitRes = await githubService.commitFile(
      'tienda_datos.json',
      JSON.stringify(dbParaGuardar, null, 2),
      sha,
      msg
    );

    res.json({ success: true, commitRes });
  } catch (err) {
    console.error('Error sincronizando con GitHub:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Endpoint: Corte Semanal con Salva en GitHub y Local
app.post('/api/corte-semanal', async (req, res) => {
  const { semana, database } = req.body;
  try {
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const safeSemana = String(semana || 'semana').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `salva_${safeSemana}_${dateStr}.json`;
    const localPath = path.join(SALVAS_DIR, filename);

    const dbAGuardar = database || cargarDatos();

    // Guardar copia local permanente
    fs.writeFileSync(localPath, JSON.stringify(dbAGuardar, null, 2), 'utf8');

    // Subir salva permanente a GitHub
    let gitHubRes = null;
    try {
      gitHubRes = await githubService.crearSalvaSemanalEnGitHub(semana || 'Semana', dbAGuardar);
    } catch (gErr) {
      console.warn('No se pudo subir a GitHub (verificar conexión/token):', gErr.message);
    }

    res.json({
      success: true,
      backupFileLocal: filename,
      backupFileGitHub: gitHubRes ? `salvas_semanales/${filename}` : 'Guardado solo local'
    });
  } catch (err) {
    console.error('Error en corte semanal:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Endpoint: Listar historial de salvas semanales de GitHub
app.get('/api/historial-salvas', async (req, res) => {
  try {
    const salvas = await githubService.listWeeklyBackups();
    res.json({ ok: true, salvas });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. Endpoint: Estado del Bot y conexión
app.get('/api/estado', (req, res) => {
  res.json({
    ok: true,
    bot: 'Bot de Compras de la Tienda',
    puerto: PORT,
    owner: githubService.owner,
    repo: githubService.repo,
    tiempo: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛒 COMPRAS DE LA TIENDA - BOT CONECTADO A GITHUB`);
  console.log(`👤 Propietario: ${githubService.owner} | Repositorio: ${githubService.repo}`);
  console.log(`🌐 Servidor Web disponible en: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
