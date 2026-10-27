// ===============================================================
//  MOTOR DE MEMORIA MULTICAPA DE COMPRAS DE LA TIENDA
//  Capa 1: Memoria RAM reactiva instantánea
//  Capa 2: LocalStorage / IndexedDB persistente offline
//  Capa 3: Snapshots & Time-Machine locales y versionados
//  Capa 4: Servidor Backend Node.js Local / Bot API (http://localhost:3060)
//  Capa 5: Respaldo remoto permanente en GitHub (GitHub API / Pages)
// ===============================================================

const DB_STORE_NAME = 'compras_almacen_db_v4';
const DB_NAME = 'ComprasTiendaIndexedDB';

class MultilayerMemoryEngine {
  constructor() {
    this.cache = null;
    this.db = null;
    this.subscribers = [];
    this.apiBase = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? ''
      : 'http://localhost:3060';
  }

  async init(defaultData) {
    await this.initIndexedDB();
    const idbData = await this.readFromIDB();
    const localData = this.readFromLocalStorage();

    if (idbData) {
      this.cache = idbData;
    } else if (localData) {
      this.cache = localData;
    } else {
      this.cache = defaultData;
    }

    // Intentar sincronizar con el Bot API si está activo
    try {
      const res = await fetch(`${this.apiBase}/api/datos`, { method: 'GET' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.ok && json.data) {
          this.cache = json.data;
        }
      }
    } catch (e) {
      // Sin bot local activo en este momento, sigue offline/web pura
    }

    // Guardar copia consistente localmente
    this.saveToLocalStorage(this.cache);
    await this.saveToIDB(this.cache);
    return this.cache;
  }

  initIndexedDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('appData')) {
          db.createObjectStore('appData', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = () => resolve(null);
    });
  }

  readFromIDB() {
    return new Promise((resolve) => {
      if (!this.db) return resolve(null);
      try {
        const tx = this.db.transaction('appData', 'readonly');
        const store = tx.objectStore('appData');
        const req = store.get('current_state');
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  saveToIDB(data) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      try {
        const tx = this.db.transaction('appData', 'readwrite');
        const store = tx.objectStore('appData');
        store.put({ id: 'current_state', data, timestamp: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  readFromLocalStorage() {
    try {
      const s = localStorage.getItem(DB_STORE_NAME);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }

  saveToLocalStorage(data) {
    try {
      localStorage.setItem(DB_STORE_NAME, JSON.stringify(data));
      localStorage.setItem(DB_STORE_NAME + '_BACKUP', JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage lleno o restringido:', e);
    }
  }

  async persist(data) {
    this.cache = data;
    this.saveToLocalStorage(data);
    await this.saveToIDB(data);

    // Enviar a servidor backend si está activo (local o via bot)
    try {
      fetch(`${this.apiBase}/api/datos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {});
    } catch (e) {}

    this.notify('update', data);
  }

  async saveSalvaEnGitHub(semanaNombre) {
    try {
      const res = await fetch(`${this.apiBase}/api/corte-semanal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semana: semanaNombre, database: this.cache })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async syncToGitHub(commitMsg) {
    try {
      const res = await fetch(`${this.apiBase}/api/sync-to-github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          database: this.cache,
          commitMessage: commitMsg || 'feat: sincronizacion automatica de salva'
        })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async parseValeConBotApi(texto, comisionDefault, monedaDefault, catalogo) {
    try {
      const res = await fetch(`${this.apiBase}/api/bot/parse-vale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto,
          comisionDefault,
          monedaDefault,
          catalogo
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) return json.data;
      }
    } catch (e) {}
    return null;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify(event, data) {
    this.subscribers.forEach(cb => {
      try { cb(event, data); } catch (e) { console.error(e); }
    });
  }
}

window.memoryEngine = new MultilayerMemoryEngine();
