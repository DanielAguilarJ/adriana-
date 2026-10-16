// Manejador HTTP sin dependencias: API para hablar con el agente y archivos de /public.
// La API key solo viaja del servidor a ElevenLabs; nunca se devuelve al navegador.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extraerMemoria, esIdConversacion } from './memoria.js';
import { crearLimitador } from './rate-limit.js';

const API = 'https://api.elevenlabs.io';
const TIEMPO_MAX_MS = 10_000;
const VENTANA_MS = 60_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
  'X-Frame-Options': 'DENY',
};

const ERROR_CONEXION = 'No pude comunicarme ahorita. Intenta de nuevo en un momento.';

function enviar(res, status, cuerpo, cabeceras = {}) {
  res.writeHead(status, { ...SEGURIDAD, ...cabeceras });
  res.end(cuerpo);
}

function json(res, status, obj, cabeceras = {}) {
  enviar(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabeceras });
}

function ipDe(req) {
  const reenviada = req.headers['x-forwarded-for'];
  if (typeof reenviada === 'string' && reenviada) return reenviada.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconocida';
}

function crearClienteElevenLabs({ apiKey, fetchImpl }) {
  return async function pedir(ruta) {
    const r = await fetchImpl(API + ruta, {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    });
    const datos = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, datos };
  };
}

function crearApi({ apiKey, agentId, fetchImpl, limites, version }) {
  const pedir = crearClienteElevenLabs({ apiKey, fetchImpl });
  const limSesion = crearLimitador({ max: limites.sesion, ventanaMs: VENTANA_MS });
  const limMemoria = crearLimitador({ max: limites.memoria, ventanaMs: VENTANA_MS });
  const agente = encodeURIComponent(agentId);

  const limitado = (lim, req, res) => {
    const ip = ipDe(req);
    if (lim.permitir(ip)) return false;
    json(res, 429, { error: 'Muchas llamadas seguidas. Espera un momento, por favor.' }, { 'Retry-After': String(lim.segundosParaReintentar(ip)) });
    return true;
  };

  const rutas = {
    async '/api/token'(req, res) {
      if (limitado(limSesion, req, res)) return;
      const r = await pedir(`/v1/convai/conversation/token?agent_id=${agente}`);
      if (!r.ok || !r.datos.token) throw new ErrorRemoto(r.status, 'token');
      json(res, 200, { token: r.datos.token });
    },
    async '/api/signed-url'(req, res) {
      if (limitado(limSesion, req, res)) return;
      const r = await pedir(`/v1/convai/conversation/get-signed-url?agent_id=${agente}`);
      if (!r.ok || !r.datos.signed_url) throw new ErrorRemoto(r.status, 'signed-url');
      json(res, 200, { signedUrl: r.datos.signed_url });
    },
    async '/api/memoria'(req, res, url) {
      if (limitado(limMemoria, req, res)) return;
      const id = url.searchParams.get('id');
      if (!esIdConversacion(id)) return json(res, 400, { error: 'Identificador inválido.' });
      const r = await pedir(`/v1/convai/conversations/${id}`);
      if (r.status === 404) return json(res, 404, { error: 'No encontrada.' });
      if (!r.ok) throw new ErrorRemoto(r.status, 'memoria');
      const memoria = extraerMemoria(r.datos, agentId);
      if (memoria.estado === 'ajena') return json(res, 404, { error: 'No encontrada.' });
      json(res, memoria.estado === 'procesando' ? 202 : 200, memoria);
    },
    async '/api/salud'(req, res) {
      json(res, 200, { ok: true, version });
    },
  };

  return async function manejarApi(req, res, url) {
    const ruta = rutas[url.pathname];
    if (!ruta) return json(res, 404, { error: 'No encontrado.' });
    if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido.' }, { Allow: 'GET' });
    try {
      await ruta(req, res, url);
    } catch (e) {
      console.error(`[api] ${url.pathname}:`, e instanceof ErrorRemoto ? `ElevenLabs respondió ${e.status} (${e.operacion})` : e?.message || e);
      json(res, 502, { error: ERROR_CONEXION });
    }
  };
}

class ErrorRemoto extends Error {
  constructor(status, operacion) {
    super(`ElevenLabs ${status} en ${operacion}`);
    this.status = status;
    this.operacion = operacion;
  }
}

function crearEstaticos(dirPublico) {
  const raiz = path.resolve(dirPublico);
  return async function servirArchivo(req, res, url) {
    let relativa;
    try {
      relativa = decodeURIComponent(url.pathname);
    } catch {
      return enviar(res, 400, 'Solicitud inválida');
    }
    if (relativa.endsWith('/')) relativa += 'index.html';
    const archivo = path.resolve(raiz, `.${relativa}`);
    if (!archivo.startsWith(raiz + path.sep)) return enviar(res, 403, 'Prohibido');
    // Solo se revisa la parte relativa: el proyecto puede vivir dentro de una carpeta oculta.
    if (path.relative(raiz, archivo).split(path.sep).some((parte) => parte.startsWith('.'))) return enviar(res, 404, 'No encontrado');
    try {
      const datos = await fs.readFile(archivo);
      const ext = path.extname(archivo);
      const cache = ext === '.html' ? 'no-cache' : relativa.startsWith('/vendor/') ? 'public, max-age=86400' : 'public, max-age=600';
      enviar(res, 200, datos, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') return enviar(res, 404, 'No encontrado');
      throw e;
    }
  };
}

/** Crea el manejador (req, res) de la app. */
export function crearApp({ apiKey, agentId, fetchImpl = fetch, dirPublico, limites = {}, version = 'dev' }) {
  const manejarApi = crearApi({ apiKey, agentId, fetchImpl, version, limites: { sesion: 12, memoria: 60, ...limites } });
  const servirArchivo = crearEstaticos(dirPublico);
  return async function app(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await manejarApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return enviar(res, 405, 'Método no permitido', { Allow: 'GET, HEAD' });
      return await servirArchivo(req, res, url);
    } catch (e) {
      console.error('[app]', e?.message || e);
      if (!res.headersSent) json(res, 500, { error: 'Algo salió mal.' });
    }
  };
}
