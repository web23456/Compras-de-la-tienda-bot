// ===============================================================
//  GITHUB SERVICE - COMPRAS DE LA TIENDA BOT
//  Permite leer, sincronizar, respaldar y versionar semanas en GitHub
// ===============================================================

const fs = require('fs');
const path = require('path');

function getEnvConfig() {
  const envPath = path.join(__dirname, '.env');
  const config = {
    PORT: process.env.PORT || 3060,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
    GITHUB_OWNER: process.env.GITHUB_OWNER || 'web23456',
    GITHUB_REPO: process.env.GITHUB_REPO || 'Compras-de-la-tienda'
  };

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(l => {
      const match = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        config[match[1]] = match[2] ? match[2].trim() : '';
      }
    });
  }
  return config;
}

const env = getEnvConfig();
const token = process.env.GITHUB_TOKEN || env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER || env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO || env.GITHUB_REPO;

async function fetchFile(filePath) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'Compras-Tienda-Bot',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Error ${res.status} al leer ${filePath} desde GitHub: ${res.statusText}`);
  }

  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return {
    content,
    sha: data.sha
  };
}

async function commitFile(filePath, newContent, sha, commitMessage) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const body = {
    message: commitMessage || `feat: actualización de ${filePath} desde Bot`,
    content: Buffer.from(newContent, 'utf8').toString('base64'),
    branch: 'main'
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'Compras-Tienda-Bot',
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Error ${res.status} al commitear en GitHub: ${errData.message || res.statusText}`);
  }

  return await res.json();
}

async function crearSalvaSemanalEnGitHub(nombreSemana, datosJSON) {
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const safeNombre = String(nombreSemana).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = `salvas_semanales/salva_${safeNombre}_${dateStr}.json`;
  const content = JSON.stringify(datosJSON, null, 2);
  const commitMsg = `backup: Salva de cierre de ${nombreSemana} [${new Date().toLocaleString()}]`;

  return await commitFile(filePath, content, null, commitMsg);
}

module.exports = {
  fetchFile,
  commitFile,
  crearSalvaSemanalEnGitHub,
  owner,
  repo
};
