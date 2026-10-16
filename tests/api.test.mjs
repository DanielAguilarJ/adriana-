import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearApp } from '../lib/app.js';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLAVE = 'sk_clave_de_prueba_que_nunca_debe_salir';
const AGENTE = 'agent_mama';
const llamadas = [];

function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo };
}

async function fetchFalso(url, opciones = {}) {
  llamadas.push({ url: String(url), headers: opciones.headers || {} });
  const u = new URL(url);
  if (u.pathname === '/v1/convai/conversation/token') return respuesta(200, { token: 'tok_123' });
  if (u.pathname === '/v1/convai/conversation/get-signed-url') return respuesta(200, { signed_url: 'wss://firmada' });
  if (u.pathname === '/v1/convai/conversations/conv_procesando1') return respuesta(200, { agent_id: AGENTE, status: 'processing' });
  if (u.pathname === '/v1/convai/conversations/conv_deotroagente') return respuesta(200, { agent_id: 'agent_otro', status: 'done' });
  if (u.pathname === '/v1/convai/conversations/conv_lista12345') {
    return respuesta(200, {
      agent_id: AGENTE, status: 'done', metadata: { call_duration_secs: 60 },
      analysis: { data_collection_results: { resumen: { value: 'Habló de su día.' } } },
    });
  }
  if (u.pathname === '/v1/convai/conversations/conv_caido12345') throw new Error('red caída');
  return respuesta(404, { detail: 'no existe' });
}

let servidor;
let base;

before(async () => {
  const app = crearApp({ apiKey: CLAVE, agentId: AGENTE, fetchImpl: fetchFalso, dirPublico: path.join(RAIZ, 'public'), limites: { sesion: 5, memoria: 50 } });
  servidor = http.createServer(app);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

const pedir = async (ruta, opciones) => {
  const r = await fetch(base + ruta, opciones);
  const texto = await r.text();
  assert.doesNotMatch(texto, new RegExp(CLAVE), `la clave salió en ${ruta}`);
  return { status: r.status, headers: r.headers, texto, json: () => JSON.parse(texto) };
};

test('GET /api/token entrega un token WebRTC usando la clave solo hacia ElevenLabs', async () => {
  const r = await pedir('/api/token', { headers: { 'x-forwarded-for': '10.0.0.1' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json(), { token: 'tok_123' });
  const ultima = llamadas.at(-1);
  assert.equal(ultima.headers['xi-api-key'], CLAVE);
  assert.match(ultima.url, /agent_id=agent_mama/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('GET /api/signed-url sigue funcionando para la versión anterior y como respaldo', async () => {
  const r = await pedir('/api/signed-url', { headers: { 'x-forwarded-for': '10.0.0.2' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json(), { signedUrl: 'wss://firmada' });
});

test('las sesiones tienen límite por IP', async () => {
  const ip = { headers: { 'x-forwarded-for': '10.9.9.9' } };
  for (let i = 0; i < 5; i++) assert.equal((await pedir('/api/token', ip)).status, 200);
  const r = await pedir('/api/token', ip);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
});

test('GET /api/memoria valida el id antes de llamar a ElevenLabs', async () => {
  const antes = llamadas.length;
  const r = await pedir('/api/memoria?id=../../v1/user');
  assert.equal(r.status, 400);
  assert.equal(llamadas.length, antes, 'no debió llamar a ElevenLabs');
});

test('GET /api/memoria responde 202 mientras se procesa', async () => {
  const r = await pedir('/api/memoria?id=conv_procesando1');
  assert.equal(r.status, 202);
  assert.deepEqual(r.json(), { estado: 'procesando' });
});

test('GET /api/memoria no revela conversaciones de otros agentes', async () => {
  const r = await pedir('/api/memoria?id=conv_deotroagente');
  assert.equal(r.status, 404);
});

test('GET /api/memoria devuelve la memoria lista', async () => {
  const r = await pedir('/api/memoria?id=conv_lista12345');
  assert.equal(r.status, 200);
  const m = r.json();
  assert.equal(m.estado, 'lista');
  assert.equal(m.resumen, 'Habló de su día.');
  assert.equal(m.duracion, 60);
});

test('un fallo de red se informa sin filtrar detalles', async () => {
  const r = await pedir('/api/memoria?id=conv_caido12345');
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.texto, /red caída/);
});

test('GET /api/salud responde sin datos sensibles', async () => {
  const r = await pedir('/api/salud');
  assert.equal(r.status, 200);
  assert.equal(r.json().ok, true);
});

test('métodos no permitidos y rutas desconocidas', async () => {
  assert.equal((await pedir('/api/token', { method: 'POST' })).status, 405);
  assert.equal((await pedir('/api/nada')).status, 404);
});

test('sirve la página con cabeceras de seguridad y bloquea rutas fuera de public', async () => {
  const r = await pedir('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('permissions-policy'), /microphone=\(self\)/);
  const fuera = await pedir('/..%2f..%2fserver.js');
  assert.ok([403, 404].includes(fuera.status), `status ${fuera.status}`);
  // server.js sí existe un nivel arriba de public: nunca debe servirse su código.
  const codigo = await pedir('/..%2fserver.js');
  assert.ok([403, 404].includes(codigo.status), `status ${codigo.status}`);
  assert.doesNotMatch(codigo.texto, /crearApp/);
  const env = await pedir('/../.env');
  assert.ok([403, 404].includes(env.status));
});
