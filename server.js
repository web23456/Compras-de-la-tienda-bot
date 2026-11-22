const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parseValeEntrada, parseValeTexto } = require('./bot-parser');
const githubService = require('./githubService');

const app = express();
const PORT = process.env.PORT || 3060;
const DB_FILE = path.join(__dirname, 'tienda_datos.json');
const GESTORES_DB_FILE = path.join(__dirname, 'gestores_datos.json');
const SALVAS_DIR = path.join(__dirname, 'salvas_semanales_local');

if (!fs.existsSync(SALVAS_DIR)) {
  fs.mkdirSync(SALVAS_DIR, { recursive: true });
}

// Variables de estado para sincronización inteligente de Gestores
let gestoresSyncStatus = {
  lastCheck: null,
  lastUpdate: null,
  lastSha: null,
  inProgress: false,
  error: null,
  totalVales: 0
};

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

// Cargar o leer datos locales de Gestores (independiente de tienda_datos.json)
function cargarDatosGestores() {
  if (fs.existsSync(GESTORES_DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(GESTORES_DB_FILE, 'utf8'));
    } catch (e) {
      console.error('Error al leer gestores_datos.json local:', e);
    }
  }
  return null;
}

function guardarDatosGestores(data) {
  fs.writeFileSync(GESTORES_DB_FILE, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Función central de sincronización inteligente de Gestores:
 * 1. Consulta primero los metadatos de Gestores (SHA) para no descargar pesado si no hay cambios.
 * 2. Si hay cambios o forceSync=true:
 *    - Descarga la base de datos de Gestores.
 *    - La guarda localmente en gestores_datos.json (completamente separada de tienda_datos.json).
 *    - La sube/sincroniza a GitHub en Compras-de-la-tienda-bot/gestores_datos.json para la web de compras.
 */

/**
 * 1. COPIAR BASE DE DATOS DE GESTORES:
 * Descarga database.json de la web/repositorio de gestores y la almacena localmente
 * en el archivo gestores_datos.json sin mezclarla con tienda_datos.json.
 */
async function copiarBaseDatosGestores() {
  if (gestoresSyncStatus.inProgress) {
    return { ok: false, message: 'Operación ya en curso' };
  }
  gestoresSyncStatus.inProgress = true;
  gestoresSyncStatus.lastCheck = new Date().toISOString();

  try {
    console.log('📥 [Copiar Gestores] Descargando base de datos de la web de Gestores...');
    const remoteData = await githubService.fetchGestoresDatabase();
    if (!remoteData || !remoteData.content) {
      throw new Error('Contenido vacío al descargar database.json de Gestores');
    }

    // Guardar exclusivamente en gestores_datos.json (local en el bot)
    guardarDatosGestores(remoteData.content);
    gestoresSyncStatus.lastSha = remoteData.sha;
    gestoresSyncStatus.lastUpdate = new Date().toISOString();
    gestoresSyncStatus.error = null;

    let totalVales = 0;
    try {
      const parsed = JSON.parse(remoteData.content);
      totalVales = Array.isArray(parsed.vales) ? parsed.vales.length : 0;
      gestoresSyncStatus.totalVales = totalVales;
    } catch(e) {}

    console.log(`✅ [Copiar Gestores] Base de datos de Gestores descargada y guardada localmente (${totalVales} vales).`);
    gestoresSyncStatus.inProgress = false;
    return { ok: true, totalVales: totalVales, message: `Base de datos descargada con éxito (${totalVales} vales)` };
  } catch (err) {
    console.error('❌ [Copiar Gestores] Error al descargar de Gestores:', err.message);
    gestoresSyncStatus.error = err.message;
    gestoresSyncStatus.inProgress = false;
    return { ok: false, error: err.message };
  }
}

/**
 * 2. SUBIR BASE DE DATOS A GITHUB:
 * Toma la base de datos descargada en el bot (gestores_datos.json) y la sube
 * a GitHub en el repositorio Compras-de-la-tienda-bot para que la web la lea.
 */
async function subirBaseDatosAGithub() {
  if (!fs.existsSync(GESTORES_DB_FILE)) {
    return { ok: false, error: 'No se ha copiado la base de datos de gestores todavía. Primero presione "Copiar base de datos de gestores".' };
  }

  try {
    console.log('📤 [Subir GitHub] Leyendo gestores_datos.json local para subir a GitHub...');
    const localContent = fs.readFileSync(GESTORES_DB_FILE, 'utf8');

    let totalVales = 0;
    try {
      const parsed = JSON.parse(localContent);
      totalVales = Array.isArray(parsed.vales) ? parsed.vales.length : 0;
    } catch(e) {}

    // Consultar el SHA actual del archivo en Compras-de-la-tienda-bot
    const currentComprasFile = await githubService.fetchFile('gestores_datos.json').catch(() => null);
    const comprasSha = currentComprasFile ? currentComprasFile.sha : null;

    console.log(`🚀 [Subir GitHub] Subiendo gestores_datos.json (${totalVales} vales) a GitHub Compras-de-la-tienda-bot...`);
    await githubService.commitFile(
      'gestores_datos.json',
      localContent,
      comprasSha,
      `sync: subida de base de datos de gestores [${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}]`
    );

    console.log('✅ [Subir GitHub] ¡Base de datos subida a GitHub con éxito!');
    return { ok: true, totalVales: totalVales, message: `Base de datos subida a GitHub con éxito (${totalVales} vales)` };
  } catch (err) {
    console.error('❌ [Subir GitHub] Error al subir a GitHub:', err.message);
    return { ok: false, error: err.message };
  }
}

async function sincronizarBaseDatosGestores(forceSync = false) {
  if (gestoresSyncStatus.inProgress) {
    console.log('⏳ Sincronización de Gestores ya en curso...');
    return { ok: false, message: 'Sincronización en curso' };
  }

  gestoresSyncStatus.inProgress = true;
  gestoresSyncStatus.lastCheck = new Date().toISOString();

  try {
    console.log('🔍 [Sync Gestores] Verificando cambios en Gestores...');
    const meta = await githubService.getGestoresDbMetadata();
    if (!meta) {
      throw new Error('No se encontró database.json en el repositorio de Gestores.');
    }

    // Verificar si el SHA cambió respecto al que conocemos
    if (!forceSync && gestoresSyncStatus.lastSha && gestoresSyncStatus.lastSha === meta.sha) {
      console.log(`✅ [Sync Gestores] Sin cambios en Gestores (SHA coincide: ${meta.sha.substring(0, 7)}). No se requiere descarga.`);
      gestoresSyncStatus.inProgress = false;
      return { ok: true, changed: false, message: 'Sin cambios en Gestores' };
    }

    console.log(`📥 [Sync Gestores] Descargando actualización de Gestores (SHA: ${meta.sha.substring(0, 7)})...`);
    const remoteData = await githubService.fetchGestoresDatabase();
    if (!remoteData || !remoteData.content) {
      throw new Error('Contenido vacío al descargar database.json de Gestores');
    }

    // Guardar localmente en gestores_datos.json
    guardarDatosGestores(remoteData.content);
    gestoresSyncStatus.lastSha = remoteData.sha;
    gestoresSyncStatus.lastUpdate = new Date().toISOString();
    gestoresSyncStatus.error = null;

    try {
      const parsed = JSON.parse(remoteData.content);
      gestoresSyncStatus.totalVales = Array.isArray(parsed.vales) ? parsed.vales.length : 0;
    } catch(e) {}

    console.log(`💾 [Sync Gestores] Guardado local exitoso (${gestoresSyncStatus.totalVales} vales). Sincronizando con GitHub Compras...`);

    // Sincronizar en GitHub (Compras-de-la-tienda-bot/gestores_datos.json) para que la web pública lo tenga
    const currentComprasFile = await githubService.fetchFile('gestores_datos.json').catch(() => null);
    const comprasSha = currentComprasFile ? currentComprasFile.sha : null;

    await githubService.commitFile(
      'gestores_datos.json',
      remoteData.content,
      comprasSha,
      `sync: actualización periódica de ventas de gestores [${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}]`
    );

    console.log(`🚀 [Sync Gestores] ¡Sincronizado y publicado con éxito en la web de Compras!`);
    gestoresSyncStatus.inProgress = false;
    return { ok: true, changed: true, totalVales: gestoresSyncStatus.totalVales };
  } catch (err) {
    console.error('❌ [Sync Gestores] Error al sincronizar base de datos de Gestores:', err.message);
    gestoresSyncStatus.error = err.message;
    gestoresSyncStatus.inProgress = false;
    return { ok: false, error: err.message };
  }
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

// 2. Endpoint: Guardar base de datos localmente y sincronizar en GitHub
app.post('/api/datos', async (req, res) => {
  try {
    guardarDatos(req.body);
    // Intentar sincronizar con GitHub en segundo plano si hay cambios
    githubService.fetchFile('tienda_datos.json')
      .then(file => {
        const sha = file ? file.sha : null;
        return githubService.commitFile(
          'tienda_datos.json',
          JSON.stringify(req.body, null, 2),
          sha,
          'feat: sincronización automática de datos desde el Bot [' + new Date().toLocaleTimeString() + ']'
        );
      })
      .catch(e => console.warn('Sync automático a GitHub en segundo plano:', e.message));

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

// 7. Endpoint: Estado del Bot, conexión y sincronización de Gestores
app.get('/api/estado', (req, res) => {
  res.json({
    ok: true,
    bot: 'Bot de Compras de la Tienda',
    puerto: PORT,
    owner: githubService.owner,
    repo: githubService.repo,
    gestoresOwner: githubService.gestoresOwner,
    gestoresRepo: githubService.gestoresRepo,
    gestoresSync: gestoresSyncStatus,
    tiempo: new Date().toISOString()
  });
});

// 8. Endpoint: Forzar sincronización inmediata de la base de datos de Gestores

// Endpoint: Copiar base de datos de gestores (Descarga desde Gestores al Bot)
app.post('/api/gestores/copiar', async (req, res) => {
  try {
    const resultado = await copiarBaseDatosGestores();
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Endpoint: Subir base de datos a GitHub (Sube gestores_datos.json desde el Bot a la web de Compras)
app.post('/api/gestores/subir-github', async (req, res) => {
  try {
    const resultado = await subirBaseDatosAGithub();
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/gestores/sync', async (req, res) => {
  try {
    const force = req.body && req.body.force === true;
    const resultado = await sincronizarBaseDatosGestores(force);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 9. Endpoint: Obtener datos actuales de Gestores desde local (gestores_datos.json)
app.get('/api/gestores/datos', (req, res) => {
  const data = cargarDatosGestores();
  res.json({ ok: true, data: data, status: gestoresSyncStatus });
});

// Planificador periódico inteligente:
// Dado que la base de datos de Gestores se actualiza muy poco y no debe ser brusco ni cada 5 minutos,
// se verifica cada 1 HORA (3,600,000 ms). Primero comprueba SHA ligero y solo si hay cambio descarga y publica.
const INTERVALO_SYNC_GESTORES_MS = 60 * 60 * 1000; // 1 Hora

setInterval(() => {
  console.log(`⏰ [Intervalo Programado] Verificación periódica de novedades en Gestores (${new Date().toLocaleTimeString()})...`);
  sincronizarBaseDatosGestores(false).catch(err => console.error('Error en intervalo sync:', err.message));
}, INTERVALO_SYNC_GESTORES_MS);

// Ejecutar una verificación inicial suave a los 10 segundos de encender el bot
setTimeout(() => {
  console.log('🚀 [Inicio Bot] Verificación inicial de base de datos de Gestores...');
  sincronizarBaseDatosGestores(false).catch(err => console.warn('Sync inicial Gestores pospuesto:', err.message));
}, 10000);

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛒 COMPRAS DE LA TIENDA - BOT CONECTADO A GITHUB`);
  console.log(`👤 Propietario: ${githubService.owner} | Repositorio: ${githubService.repo}`);
  console.log(`📊 Gestores Sincronizados: ${githubService.gestoresOwner}/${githubService.gestoresRepo}`);
  console.log(`⏱️ Verificación de novedades en Gestores: cada 1 hora (no intrusivo)`);
  console.log(`🌐 Servidor Web disponible en: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
