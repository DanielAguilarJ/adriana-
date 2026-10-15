// Servidor sin dependencias (Node 18+). Sirve /public y hace proxy a ElevenLabs.
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

const API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const PORT = process.env.PORT || 3000;
const EL = 'https://api.elevenlabs.io/v1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function relayAudio(res, upstream) {
  if (!upstream.ok) {
    const detail = await upstream.text();
    return json(res, upstream.status, { error: 'ElevenLabs error', detail });
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length });
  res.end(buf);
}

async function handleApi(req, res, url) {
  if (!API_KEY) return json(res, 500, { error: 'Falta ELEVENLABS_API_KEY en .env' });

  // Lista de voces de la cuenta
  if (req.method === 'GET' && url.pathname === '/api/voices') {
    const r = await fetch(`${EL}/voices`, { headers: { 'xi-api-key': API_KEY } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: 'No se pudieron listar voces', detail: data, defaultVoice: DEFAULT_VOICE });
    const voices = (data.voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category }));
    return json(res, 200, { voices, defaultVoice: DEFAULT_VOICE });
  }

  // Texto -> voz de mamá
  if (req.method === 'POST' && url.pathname === '/api/tts') {
    const { text, voiceId } = JSON.parse((await readBody(req)).toString() || '{}');
    if (!text?.trim()) return json(res, 400, { error: 'Texto vacío' });
    const r = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voiceId || DEFAULT_VOICE)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true },
      }),
    });
    return relayAudio(res, r);
  }

  // Tu voz grabada -> voz de mamá (speech-to-speech)
  if (req.method === 'POST' && url.pathname === '/api/sts') {
    const audio = await readBody(req);
    if (!audio.length) return json(res, 400, { error: 'Audio vacío' });
    const voiceId = url.searchParams.get('voiceId') || DEFAULT_VOICE;
    const form = new FormData();
    form.append('audio', new Blob([audio], { type: req.headers['content-type'] || 'audio/webm' }), 'input.webm');
    form.append('model_id', 'eleven_multilingual_sts_v2');
    form.append('remove_background_noise', 'true');
    const r = await fetch(`${EL}/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY },
      body: form,
    });
    return relayAudio(res, r);
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
