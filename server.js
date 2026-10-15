// Servidor sin dependencias (Node 18+). Sirve /public y entrega una URL firmada
// para hablar con el agente de ElevenLabs sin exponer la API key al navegador.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');

// Carga mínima de .env
try {
  const env = await fs.readFile(path.join(__dirname, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

// Valores por defecto para producción cuando no hay .env ni variables de entorno.
// Las variables de entorno, si existen, tienen prioridad.
const API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_08349228348b8cbd7f022142e54f10406cd0049015744cd4';
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_3401m50yk4q1ew1b2a1m5qjq4wrz';
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/signed-url') {
    if (!API_KEY || !AGENT_ID) return json(res, 500, { error: 'Falta ELEVENLABS_API_KEY o ELEVENLABS_AGENT_ID en .env (corre: node create-agent.mjs)' });
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(AGENT_ID)}`,
      { headers: { 'xi-api-key': API_KEY } },
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: 'ElevenLabs error', detail: data });
    return json(res, 200, { signedUrl: data.signed_url });
  }
  return json(res, 404, { error: 'No encontrado' });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('No encontrado'); }
    console.error(e);
    json(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`Voz de Mamá en http://localhost:${PORT}`));
